import type { APIRoute } from 'astro';
import { fsGet, fsSet, fsIncrement } from '@/lib/firestore';
import { clientIp, hashIp, isRateLimited } from '@/lib/rate-limit';

export const prerender = false;

const RATE_LIMIT = { collection: 'rateLimits', max: 10, windowMs: 60_000 };

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

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });

export const POST: APIRoute = async ({ request }) => {
  let payload: { slug?: string };
  try { payload = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { slug } = payload;
  if (!slug || typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    return json(400, { error: 'Invalid slug' });
  }

  const ipHash = await hashIp(clientIp(request));

  if (await isRateLimited(ipHash, RATE_LIMIT)) return json(429, { error: 'Too Many Requests' });

  const viewerKey = `${slug}__${ipHash}`;
  const alreadyViewed = await fsGet('pageViewers', viewerKey);

  if (!alreadyViewed) {
    await Promise.all([
      fsSet('pageViewers', viewerKey, { slug: { stringValue: slug }, viewedAt: { integerValue: String(Date.now()) } }),
      fsIncrement('pageViews', slug, 'count'),
    ]);
  }

  const doc = await fsGet('pageViews', slug) as Record<string, { integerValue?: string }> | null;
  return json(200, { count: Number(doc?.count?.integerValue || 0) });
};
