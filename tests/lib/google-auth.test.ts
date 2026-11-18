import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { clearGoogleTokenCache, getGoogleAccessToken, parseServiceAccount, type ServiceAccount } from '@/lib/google-auth';

let account: ServiceAccount;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  account = { client_email: 'svc@proj.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) };
});

beforeEach(() => clearGoogleTokenCache());

const okResponse = () => new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }), { status: 200 });

describe('parseServiceAccount', () => {
  test('reads the two fields from the JSON key file', () => {
    expect(parseServiceAccount(JSON.stringify({ ...account, project_id: 'p' }))).toEqual(account);
  });

  test.each([undefined, '', 'not json', '{"client_email":"x"}'])('returns null for %j', (raw) => {
    expect(parseServiceAccount(raw)).toBeNull();
  });
});

describe('getGoogleAccessToken', () => {
  test('exchanges a signed JWT assertion for an access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const token = await getGoogleAccessToken(account, 'scope-a', fetchMock);

    expect(token).toBe('ya29.token');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const params = new URLSearchParams(init.body);
    expect(params.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const claims = decodeJwt(params.get('assertion') ?? '');
    expect(claims).toMatchObject({ iss: account.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'scope-a' });
  });

  test('reuses a cached token until shortly before expiry', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => okResponse());
    let now = 1_000_000;
    await getGoogleAccessToken(account, 's', fetchMock, () => now);
    now += 50 * 60_000;
    await getGoogleAccessToken(account, 's', fetchMock, () => now);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 6 * 60_000;
    await getGoogleAccessToken(account, 's', fetchMock, () => now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('throws on a failed exchange without leaking the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }));
    const error = await getGoogleAccessToken(account, 's', fetchMock).catch((e: unknown) => e);
    expect(String(error)).toMatch(/400/);
    expect(String(error)).not.toContain('PRIVATE KEY');
  });
});
