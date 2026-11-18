import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';
import { clearGoogleTokenCache } from '@/lib/google-auth';
import { configureFirestore, fsGet, fsIncrement, fsSet } from '@/lib/firestore';

let serviceAccountJson: string;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  serviceAccountJson = JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearGoogleTokenCache();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', mock);
  return mock;
}

const firestoreCalls = (mock: ReturnType<typeof stubFetch>) =>
  mock.mock.calls.filter(([url]) => String(url).startsWith('https://firestore.googleapis.com'));

describe('firestore client', () => {
  test('sends a Bearer token when a service account is configured', async () => {
    configureFirestore({ FIREBASE_SERVICE_ACCOUNT: serviceAccountJson });
    const mock = stubFetch((url) =>
      url.includes('oauth2')
        ? new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }))
        : new Response(JSON.stringify({ fields: { count: { integerValue: '3' } } })),
    );

    expect(await fsGet('pageViews', 'a b')).toEqual({ count: { integerValue: '3' } });
    const [url, init] = firestoreCalls(mock)[0];
    expect(url).toContain('/pageViews/a%20b');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  test('falls back to unauthenticated calls and warns once when no service account is set', async () => {
    configureFirestore({});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mock = stubFetch(() => new Response('{}'));

    await fsSet('c', 'd', {});
    await fsIncrement('c', 'd', 'count');
    for (const [, init] of firestoreCalls(mock)) {
      expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('logs failed writes instead of failing silently', async () => {
    configureFirestore({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(() => new Response('{}', { status: 403 }));

    await fsSet('pageViews', 'x', {});
    expect(error).toHaveBeenCalledWith('[firestore] set pageViews failed (403)');
  });

  test('a missing document is null and not logged as an error', async () => {
    configureFirestore({});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(() => new Response('{}', { status: 404 }));

    expect(await fsGet('pageViews', 'missing')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});
