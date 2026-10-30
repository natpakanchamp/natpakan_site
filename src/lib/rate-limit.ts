import { fsGet, fsSet } from './firestore';

interface RateLimitOptions {
  collection: string;
  max: number;
  windowMs: number;
}

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ':natpakan'));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fixed-window counter per IP hash, stored in Firestore. */
export async function isRateLimited(ipHash: string, { collection, max, windowMs }: RateLimitOptions): Promise<boolean> {
  const doc = await fsGet(collection, ipHash) as Record<string, { integerValue?: string }> | null;
  const now = Date.now();
  const startWindow = () => fsSet(collection, ipHash, { count: { integerValue: '1' }, windowStart: { integerValue: String(now) } });

  if (!doc) {
    await startWindow();
    return false;
  }

  const windowStart = Number(doc.windowStart?.integerValue || 0);
  const count = Number(doc.count?.integerValue || 0);

  if (now - windowStart > windowMs) {
    await startWindow();
    return false;
  }

  if (count >= max) return true;

  await fsSet(collection, ipHash, { count: { integerValue: String(count + 1) }, windowStart: { integerValue: String(windowStart) } });
  return false;
}

/** Browsers always send Origin on POST; reject requests from other sites. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return origin === new URL(request.url).origin;
}
