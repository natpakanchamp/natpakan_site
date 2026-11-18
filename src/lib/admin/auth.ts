import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

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
const jwksCache = new Map<string, JWTVerifyGetKey>();

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
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
  getKey: JWTVerifyGetKey = remoteJwks(config.teamDomain),
): Promise<AdminAuthResult> {
  const token = readToken(request);
  if (!token) return { ok: false, status: 401, reason: 'missing token' };

  let email: string;
  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: config.teamDomain,
      audience: config.audience,
      algorithms: ['RS256'],
    });
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
