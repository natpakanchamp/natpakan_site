const FIREBASE_PROJECT = 'natpakan-site';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

async function fsGet(collection: string, docId: string) {
  const res = await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}`);
  if (!res.ok) return null;
  const data = await res.json() as { fields?: Record<string, unknown> };
  return data.fields || null;
}

async function fsSet(collection: string, docId: string, fields: Record<string, unknown>) {
  await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function fsIncrement(collection: string, docId: string, field: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents:commit`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: `projects/${FIREBASE_PROJECT}/databases/(default)/documents/${collection}/${docId}`,
          fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }],
        },
      }],
    }),
  });
}

async function fsGetCount(slug: string): Promise<number> {
  const doc = await fsGet('pageViews', slug) as Record<string, { integerValue?: string }> | null;
  return Number(doc?.count?.integerValue || 0);
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + ':natpakan');
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// ── Rate limiter: max 10 requests per IP per minute ──

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

async function isRateLimited(ipHash: string): Promise<boolean> {
  const doc = await fsGet('rateLimits', ipHash) as Record<string, { integerValue?: string }> | null;
  const now = Date.now();

  if (!doc) {
    await fsSet('rateLimits', ipHash, {
      count: { integerValue: '1' },
      windowStart: { integerValue: String(now) },
    });
    return false;
  }

  const windowStart = Number(doc.windowStart?.integerValue || 0);
  const count = Number(doc.count?.integerValue || 0);

  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    await fsSet('rateLimits', ipHash, {
      count: { integerValue: '1' },
      windowStart: { integerValue: String(now) },
    });
    return false;
  }

  if (count >= RATE_LIMIT_MAX) return true;

  await fsSet('rateLimits', ipHash, {
    count: { integerValue: String(count + 1) },
    windowStart: { integerValue: String(windowStart) },
  });
  return false;
}

// ── Handler ──

export const onRequest: PagesFunction = async (context) => {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  let payload: { slug?: string };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const { slug } = payload;
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return json(400, { error: 'Invalid slug' });
  }

  const ip = getClientIp(request);
  const ipHash = await hashIp(ip);

  if (await isRateLimited(ipHash)) {
    return json(429, { error: 'Too Many Requests' });
  }

  // Dedup: check if this IP has already viewed this slug
  const viewerKey = `${slug}__${ipHash}`;
  const alreadyViewed = await fsGet('pageViewers', viewerKey);

  if (!alreadyViewed) {
    await Promise.all([
      fsSet('pageViewers', viewerKey, {
        slug: { stringValue: slug },
        viewedAt: { integerValue: String(Date.now()) },
      }),
      fsIncrement('pageViews', slug, 'count'),
    ]);
  }

  const count = await fsGetCount(slug);
  return json(200, { count });
};
