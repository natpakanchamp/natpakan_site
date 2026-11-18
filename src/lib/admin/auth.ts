import { importRsaJwk, verifyRs256, type KeyResolver } from '../rs256';

/**
 * Cloudflare Access sits in front of /admin/* and /api/admin/*. This is the
 * second line of defence: every admin handler re-verifies the Access JWT so a
 * misconfigured Access policy alone can never expose the admin API.
 */
export interface AccessConfig {
  /** e.g. https://natpakan.cloudflareaccess.com */
  teamDomain: string;
  /** Application Audience (AUD) tag from the Access application. */
  audience: string;
  /** Lower-cased emails allowed to use the admin. */
  adminEmails: string[];
}

export type AdminAuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; reason: string };

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const JWKS_TTL_MS = 10 * 60_000;

interface CachedJwks {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

const jwksCache = new Map<string, CachedJwks>();

async function fetchJwks(teamDomain: string, fetchImpl: typeof fetch): Promise<CachedJwks> {
  const res = await fetchImpl(`${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed (${res.status})`);
  const body = (await res.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty === 'RSA' && jwk.kid) keys.set(jwk.kid, await importRsaJwk(jwk));
  }
  return { keys, fetchedAt: Date.now() };
}

/** Resolves Access signing keys by kid; refetches once on an unknown kid (key rotation). */
export function remoteAccessKeys(teamDomain: string, fetchImpl: typeof fetch = fetch): KeyResolver {
  return async (kid) => {
    if (!kid) return null;
    let cached = jwksCache.get(teamDomain);
    const stale = !cached || Date.now() - cached.fetchedAt > JWKS_TTL_MS;
    if (stale || !cached?.keys.has(kid)) {
      cached = await fetchJwks(teamDomain, fetchImpl);
      jwksCache.set(teamDomain, cached);
    }
    return cached.keys.get(kid) ?? null;
  };
}

function readToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? match[1] : null;
}

export async function verifyAdminRequest(
  request: Request,
  config: AccessConfig,
  getKey: KeyResolver = remoteAccessKeys(config.teamDomain),
): Promise<AdminAuthResult> {
  const token = readToken(request);
  if (!token) return { ok: false, status: 401, reason: 'missing token' };

  let email: string;
  try {
    const payload = await verifyRs256(token, getKey, { issuer: config.teamDomain, audience: config.audience });
    email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  } catch {
    return { ok: false, status: 401, reason: 'invalid token' };
  }

  if (!email || !config.adminEmails.includes(email)) return { ok: false, status: 403, reason: 'not an admin' };

  if (STATE_CHANGING.has(request.method.toUpperCase())) {
    const origin = request.headers.get('Origin');
    if (origin !== new URL(request.url).origin) return { ok: false, status: 403, reason: 'bad origin' };
  }

  return { ok: true, email };
}
