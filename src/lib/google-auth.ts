import { SignJWT, importPKCS8 } from 'jose';

/**
 * OAuth2 access token for a Google service account (JWT bearer grant), so the
 * Worker can call Firestore with its own identity and the database rules can
 * deny all public access.
 */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_LIFETIME_S = 3600;
const REFRESH_MARGIN_MS = 5 * 60_000;

interface CachedToken {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();

export function parseServiceAccount(raw: unknown): ServiceAccount | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== 'string' || typeof parsed.private_key !== 'string') return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

export async function getGoogleAccessToken(
  account: ServiceAccount,
  scope: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<string> {
  const cacheKey = `${account.client_email}|${scope}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.value;

  const key = await importPKCS8(account.private_key, 'RS256');
  const issuedAt = Math.floor(now() / 1000);
  const assertion = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_LIFETIME_S)
    .sign(key);

  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google token response had no access_token');

  cache.set(cacheKey, { value: body.access_token, expiresAt: now() + (body.expires_in ?? TOKEN_LIFETIME_S) * 1000 });
  return body.access_token;
}

/** Test hook. */
export function clearGoogleTokenCache(): void {
  cache.clear();
}
