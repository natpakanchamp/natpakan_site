import { afterEach, describe, expect, test } from 'vitest';
import { clientIp, configureIpHashSalt, hashIp } from '@/lib/rate-limit';

afterEach(() => configureIpHashSalt({}));

describe('hashIp', () => {
  test('is stable for the same IP and salt', async () => {
    configureIpHashSalt({ IP_HASH_SALT: 'a-secret-salt-of-32-characters!!' });
    expect(await hashIp('1.2.3.4')).toBe(await hashIp('1.2.3.4'));
  });

  test('changes when the secret salt changes, so hashes cannot be precomputed', async () => {
    configureIpHashSalt({ IP_HASH_SALT: 'first-secret-salt-123456' });
    const a = await hashIp('1.2.3.4');
    configureIpHashSalt({ IP_HASH_SALT: 'second-secret-salt-12345' });
    expect(await hashIp('1.2.3.4')).not.toBe(a);
  });

  test('ignores a salt that is too short', async () => {
    configureIpHashSalt({});
    const legacy = await hashIp('1.2.3.4');
    configureIpHashSalt({ IP_HASH_SALT: 'short' });
    expect(await hashIp('1.2.3.4')).toBe(legacy);
  });

  test('returns 64 hex chars', async () => {
    expect(await hashIp('::1')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('clientIp', () => {
  test('prefers CF-Connecting-IP, which Cloudflare sets and clients cannot spoof', () => {
    const req = new Request('https://s.test', { headers: { 'CF-Connecting-IP': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' } });
    expect(clientIp(req)).toBe('9.9.9.9');
  });
});
