import { beforeAll, describe, expect, test } from 'vitest';
import { SignJWT, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { base64UrlDecode, base64UrlEncode, importPkcs8Pem, signRs256, verifyRs256, type KeyResolver } from '@/lib/rs256';

let pair: CryptoKeyPair;
let pem: string;
let resolve: KeyResolver;
const opts = { issuer: 'https://iss.test', audience: 'aud-1' };
const nowS = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  pair = await generateKeyPair('RS256', { extractable: true });
  pem = await exportPKCS8(pair.privateKey);
  resolve = async (kid) => (kid === 'k' || kid === undefined ? pair.publicKey : null);
});

const claims = (extra: Record<string, unknown> = {}) => ({ iss: opts.issuer, aud: opts.audience, exp: nowS() + 300, email: 'a@b.c', ...extra });

describe('base64url', () => {
  test('round-trips bytes without padding or +/ characters', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const encoded = base64UrlEncode(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Array.from(base64UrlDecode(encoded))).toEqual(Array.from(bytes));
  });
});

describe('interop with jose', () => {
  test('a token signed with our signer verifies with jose', async () => {
    const jwt = await signRs256(claims(), await importPkcs8Pem(pem), 'k');
    const { payload } = await jwtVerify(jwt, pair.publicKey, opts);
    expect(payload.email).toBe('a@b.c');
  });

  test('a token signed by jose verifies with our verifier', async () => {
    const jwt = await new SignJWT(claims()).setProtectedHeader({ alg: 'RS256', kid: 'k' }).sign(pair.privateKey);
    expect((await verifyRs256(jwt, resolve, opts)).email).toBe('a@b.c');
  });
});

describe('verifyRs256 rejects', () => {
  const sign = async (c: Record<string, unknown>) => signRs256(c, await importPkcs8Pem(pem), 'k');

  test('alg none', async () => {
    const jwt = `${base64UrlEncode('{"alg":"none"}')}.${base64UrlEncode(JSON.stringify(claims()))}.x`;
    await expect(verifyRs256(jwt, resolve, opts)).rejects.toThrow(/alg/);
  });

  test('a tampered payload', async () => {
    const [h, , sig] = (await sign(claims())).split('.');
    const forged = `${h}.${base64UrlEncode(JSON.stringify(claims({ email: 'evil@x.y' })))}.${sig}`;
    await expect(verifyRs256(forged, resolve, opts)).rejects.toThrow(/signature/);
  });

  test('an unknown kid', async () => {
    const jwt = await signRs256(claims(), await importPkcs8Pem(pem), 'other');
    await expect(verifyRs256(jwt, resolve, opts)).rejects.toThrow(/key/);
  });

  test.each([
    ['issuer', { iss: 'https://evil.test' }, /issuer/],
    ['audience', { aud: 'other' }, /audience/],
    ['expired', { exp: nowS() - 120 }, /expired/],
    ['missing exp', { exp: undefined }, /expired/],
    ['nbf in the future', { nbf: nowS() + 600 }, /not yet/],
  ])('%s', async (_name, extra, error) => {
    await expect(verifyRs256(await sign(claims(extra)), resolve, opts)).rejects.toThrow(error);
  });

  test('malformed tokens', async () => {
    for (const bad of ['', 'a.b', 'a..c', 'not-a-jwt']) await expect(verifyRs256(bad, resolve, opts)).rejects.toThrow();
  });

  test('accepts an audience array that contains ours', async () => {
    expect((await verifyRs256(await sign(claims({ aud: ['x', 'aud-1'] })), resolve, opts)).email).toBe('a@b.c');
  });
});
