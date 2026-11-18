import { describe, expect, test } from 'vitest';
import { AdminConfigError, readAdminEnv } from '@/lib/admin/env';

const complete = {
  CF_ACCESS_TEAM_DOMAIN: 'natpakan.cloudflareaccess.com',
  CF_ACCESS_AUD: 'aud',
  ADMIN_EMAILS: 'Owner@Example.com, second@example.com',
  GITHUB_TOKEN: 'github_pat_x',
  GITHUB_REPO: 'owner/repo',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'media',
  MEDIA_PUBLIC_BASE_URL: 'https://media.example.com/',
};

describe('readAdminEnv', () => {
  test('normalises a complete env', () => {
    const env = readAdminEnv(complete);
    expect(env.access).toEqual({
      teamDomain: 'https://natpakan.cloudflareaccess.com',
      audience: 'aud',
      adminEmails: ['owner@example.com', 'second@example.com'],
    });
    expect(env.github).toEqual({ token: 'github_pat_x', repo: 'owner/repo', branch: 'main' });
    expect(env.r2.publicBaseUrl).toBe('https://media.example.com');
  });

  test('lists every missing variable by name, never by value', () => {
    const { GITHUB_TOKEN: _t, R2_BUCKET: _b, ...partial } = complete;
    expect(() => readAdminEnv(partial)).toThrow(AdminConfigError);
    expect(() => readAdminEnv(partial)).toThrow(/GITHUB_TOKEN.*R2_BUCKET/);
  });

  test('rejects a malformed repo name', () => {
    expect(() => readAdminEnv({ ...complete, GITHUB_REPO: 'not-a-repo' })).toThrow(/GITHUB_REPO/);
  });

  test('rejects a non-https media URL', () => {
    expect(() => readAdminEnv({ ...complete, MEDIA_PUBLIC_BASE_URL: 'http://media.example.com' })).toThrow(/MEDIA_PUBLIC_BASE_URL/);
  });
});
