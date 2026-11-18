import { describe, expect, test, vi } from 'vitest';
import { authorizeAdmin } from '@/lib/admin/handler';

const raw = {
  CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
  CF_ACCESS_AUD: 'aud',
  ADMIN_EMAILS: 'owner@example.com',
  GITHUB_TOKEN: 't',
  GITHUB_REPO: 'o/r',
  R2_ACCOUNT_ID: 'a',
  R2_ACCESS_KEY_ID: 'k',
  R2_SECRET_ACCESS_KEY: 's',
  R2_BUCKET: 'b',
  MEDIA_PUBLIC_BASE_URL: 'https://m.example.com',
};

const req = () => new Request('https://site.test/api/admin/posts');

describe('authorizeAdmin', () => {
  test('returns 500 naming missing variables when config is incomplete', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await authorizeAdmin(req(), { ADMIN_EMAILS: 'x' }, false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(500);
    const body = await result.response.json();
    expect(body.detail).toMatch(/GITHUB_TOKEN/);
    expect(JSON.stringify(body)).not.toContain('owner@example.com');
  });

  test('returns 401 without an Access token in production', async () => {
    const result = await authorizeAdmin(req(), raw, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  test('ignores the dev bypass variable in production builds', async () => {
    const result = await authorizeAdmin(req(), { ...raw, ADMIN_DEV_BYPASS_EMAIL: 'owner@example.com' }, false);
    expect(result.ok).toBe(false);
  });

  test('honours the dev bypass only when running astro dev', async () => {
    const result = await authorizeAdmin(req(), { ...raw, ADMIN_DEV_BYPASS_EMAIL: 'Owner@example.com' }, true);
    expect(result).toMatchObject({ ok: true, email: 'owner@example.com' });
  });

  test('admin responses are never cached', async () => {
    const result = await authorizeAdmin(req(), raw, false);
    if (!result.ok) expect(result.response.headers.get('Cache-Control')).toBe('no-store');
  });
});
