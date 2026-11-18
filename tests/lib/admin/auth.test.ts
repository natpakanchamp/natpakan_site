import { beforeAll, describe, expect, test, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { remoteAccessKeys, verifyAdminRequest, type AccessConfig } from '@/lib/admin/auth';
import type { KeyResolver } from '@/lib/rs256';

const config: AccessConfig = {
  teamDomain: 'https://natpakan.cloudflareaccess.com',
  audience: 'aud-tag-123',
  adminEmails: ['owner@example.com'],
};

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let jwks: KeyResolver;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
  jwks = async (kid) => (kid === 'k1' ? pair.publicKey : null);
});

async function token(
  claims: Record<string, unknown>,
  { key = privateKey, iss = config.teamDomain, aud = config.audience, exp = '5m' } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
}

function request(jwt?: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (jwt) headers.set('Cf-Access-Jwt-Assertion', jwt);
  if (init.cookie) headers.set('Cookie', init.cookie);
  return new Request('https://site.test/api/admin/posts', { ...init, headers });
}

describe('verifyAdminRequest', () => {
  test('accepts a valid token for the admin email', async () => {
    const result = await verifyAdminRequest(request(await token({ email: 'owner@example.com' })), config, jwks);
    expect(result).toEqual({ ok: true, email: 'owner@example.com' });
  });

  test('matches the admin email case-insensitively', async () => {
    const result = await verifyAdminRequest(request(await token({ email: 'Owner@Example.com' })), config, jwks);
    expect(result.ok).toBe(true);
  });

  test('falls back to the CF_Authorization cookie', async () => {
    const jwt = await token({ email: 'owner@example.com' });
    const result = await verifyAdminRequest(request(undefined, { cookie: `a=b; CF_Authorization=${jwt}` }), config, jwks);
    expect(result.ok).toBe(true);
  });

  test('rejects a request with no token', async () => {
    expect(await verifyAdminRequest(request(), config, jwks)).toEqual({ ok: false, status: 401, reason: 'missing token' });
  });

  test('rejects a valid token for a different email', async () => {
    const result = await verifyAdminRequest(request(await token({ email: 'intruder@example.com' })), config, jwks);
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  test('rejects a token signed by another key', async () => {
    const jwt = await token({ email: 'owner@example.com' }, { key: otherPrivateKey });
    expect(await verifyAdminRequest(request(jwt), config, jwks)).toMatchObject({ ok: false, status: 401 });
  });

  test('rejects a token for another Access application (wrong audience)', async () => {
    const jwt = await token({ email: 'owner@example.com' }, { aud: 'other-app' });
    expect(await verifyAdminRequest(request(jwt), config, jwks)).toMatchObject({ ok: false, status: 401 });
  });

  test('rejects a token from another team (wrong issuer)', async () => {
    const jwt = await token({ email: 'owner@example.com' }, { iss: 'https://evil.cloudflareaccess.com' });
    expect(await verifyAdminRequest(request(jwt), config, jwks)).toMatchObject({ ok: false, status: 401 });
  });

  test('rejects an expired token', async () => {
    const jwt = await token({ email: 'owner@example.com' }, { exp: '-1m' });
    expect(await verifyAdminRequest(request(jwt), config, jwks)).toMatchObject({ ok: false, status: 401 });
  });

  test('rejects a cross-origin state-changing request even with a valid token', async () => {
    const jwt = await token({ email: 'owner@example.com' });
    const req = request(jwt, { method: 'POST', headers: { Origin: 'https://evil.test' } });
    expect(await verifyAdminRequest(req, config, jwks)).toMatchObject({ ok: false, status: 403, reason: 'bad origin' });
  });

  test('allows a same-origin state-changing request', async () => {
    const jwt = await token({ email: 'owner@example.com' });
    const req = request(jwt, { method: 'DELETE', headers: { Origin: 'https://site.test' } });
    expect((await verifyAdminRequest(req, config, jwks)).ok).toBe(true);
  });
});

describe('remoteAccessKeys', () => {
  test('fetches the Access certs once, then refetches only for an unknown kid', async () => {
    const certs = (kids: string[]) => new Response(JSON.stringify({ keys: kids.map((kid) => ({ ...publicJwk, kid, kty: 'RSA' })) }));
    const fetchMock = vi.fn().mockResolvedValueOnce(certs(['k1'])).mockResolvedValueOnce(certs(['k1', 'k2']));
    const resolve = remoteAccessKeys('https://rotation.cloudflareaccess.com', fetchMock);

    expect(await resolve('k1')).not.toBeNull();
    expect(await resolve('k1')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://rotation.cloudflareaccess.com/cdn-cgi/access/certs');

    expect(await resolve('k2')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await resolve(undefined)).toBeNull();
  });

  test('a valid token verifies end-to-end through the remote key resolver', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'k1', kty: 'RSA' }] })));
    const resolve = remoteAccessKeys('https://e2e-team.cloudflareaccess.com', fetchMock);
    const result = await verifyAdminRequest(request(await token({ email: 'owner@example.com' })), config, resolve);
    expect(result.ok).toBe(true);
  });
});
