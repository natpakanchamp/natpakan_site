import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The admin UI against a dev server in `--mode e2e` (Access bypassed via
 * ADMIN_DEV_BYPASS_EMAIL). GitHub and R2 are mocked at the network layer so
 * nothing real is committed or uploaded.
 */

const SHA = 'a'.repeat(40);
const EXISTING = '2025-10-28-CP-scholarship-Bootcamp-2025.md';

function fulfillJson(route: Route, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function openEditor(page: Page, query = '') {
  await page.goto(`/admin/edit/${query}`);
  await page.locator('#post-form[data-ready="true"]').waitFor();
}

async function mockApi(page: Page) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  await page.route('**/api/admin/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData() as string) : null;
    calls.push({ method: req.method(), url: url.pathname, body });

    if (url.pathname === '/api/admin/posts/' && req.method() === 'GET') {
      return fulfillJson(route, 200, { posts: [{ name: '2026-11-17-CP-scholarship-Bootcamp-2026.md', sha: SHA }, { name: EXISTING, sha: SHA }] });
    }
    if (url.pathname === '/api/admin/posts/' && req.method() === 'POST') {
      return fulfillJson(route, 201, { name: `${body.date}-${body.slug}.md`, sha: SHA, commitUrl: 'https://github.com/x/commit/1' });
    }
    if (url.pathname === `/api/admin/posts/${encodeURIComponent(EXISTING.replace(/\.md$/, ''))}/` && req.method() === 'GET') {
      return fulfillJson(route, 200, {
        name: EXISTING,
        sha: SHA,
        slug: 'cp-scholarship-bootcamp-2025',
        fields: { title: 'CP Scholarship Bootcamp 2025', date: '2025-10-28', time: '16:00', categories: ['activities'], draft: false },
        body: 'เนื้อหาเดิม **ตัวหนา**',
      });
    }
    if (url.pathname === '/api/admin/upload/') {
      return fulfillJson(route, 200, {
        uploadUrl: 'https://acc.r2.cloudflarestorage.com/b/posts/2026/11/x-photo.png?X-Amz-Signature=1',
        publicUrl: 'https://media.e2e.test/posts/2026/11/x-photo.png',
        contentType: 'image/png',
        snippet: '<img src="https://media.e2e.test/posts/2026/11/x-photo.png" alt="" loading="lazy">',
      });
    }
    return fulfillJson(route, 404, { error: 'unmocked' });
  });
  await page.route('https://acc.r2.cloudflarestorage.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('https://media.e2e.test/**', (route) => route.fulfill({ status: 404, body: '' }));
  return calls;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('keep')) localStorage.clear();
  });
});

test('post list shows titles from the build and flags drafts', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'โพสต์ทั้งหมด' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('2 โพสต์');
  const draftRow = page.getByRole('link', { name: /CP Scholarship Bootcamp 2026/ });
  await expect(draftRow).toContainText('draft');
  await expect(page.getByRole('link', { name: /CP Scholarship Bootcamp 2025/ })).not.toContainText('draft');
});

test('writing a new post: slug auto-fills, preview renders, upload inserts media, publish sends a valid payload', async ({ page }) => {
  const calls = await mockApi(page);
  await openEditor(page);

  await page.getByPlaceholder('CP Scholarship Bootcamp 2026').fill('Winter Camp 2026');
  await expect(page.locator('input[name="slug"]')).toHaveValue('winter-camp-2026');
  await expect(page.locator('#url-preview')).toContainText('/activities/');

  await page.locator('#body').fill('# สวัสดี\n\nข้อความ *ทดสอบ*');
  await expect(page.locator('#preview h1')).toHaveText('สวัสดี');
  await expect(page.locator('#preview em')).toHaveText('ทดสอบ');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#file-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#body')).toHaveValue(/<img src="https:\/\/media\.e2e\.test\/posts\/2026\/11\/x-photo\.png"/);
  await expect(page.locator('#preview img')).toHaveAttribute('src', 'https://media.e2e.test/posts/2026/11/x-photo.png');

  await page.getByRole('button', { name: 'เผยแพร่' }).click();
  await expect(page.locator('#save-status')).toContainText('เผยแพร่แล้ว');
  await expect(page).toHaveURL(/\/admin\/edit\/\?file=.*winter-camp-2026\.md/);

  const create = calls.find((c) => c.method === 'POST' && c.url === '/api/admin/posts/');
  expect(create?.body).toMatchObject({ title: 'Winter Camp 2026', slug: 'winter-camp-2026', categories: ['activities'], draft: false });
});

test('a Thai-only title leaves the slug empty and blocks saving until one is typed', async ({ page }) => {
  const calls = await mockApi(page);
  await openEditor(page);
  await page.getByPlaceholder('CP Scholarship Bootcamp 2026').fill('ค่ายฤดูหนาว');
  await expect(page.locator('input[name="slug"]')).toHaveValue('');
  await page.getByRole('button', { name: 'บันทึก draft' }).click();
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
});

test('editing loads the existing post and shows the delete button', async ({ page }) => {
  await mockApi(page);
  await openEditor(page, `?file=${encodeURIComponent(EXISTING)}`);
  await expect(page.getByPlaceholder('CP Scholarship Bootcamp 2026')).toHaveValue('CP Scholarship Bootcamp 2025');
  await expect(page.locator('input[name="slug"]')).toHaveValue('cp-scholarship-bootcamp-2025');
  await expect(page.locator('#preview strong')).toHaveText('ตัวหนา');
  await expect(page.getByRole('button', { name: 'ลบโพสต์' })).toBeVisible();
});

test('autosave offers to restore unsaved text after a reload', async ({ page }) => {
  await mockApi(page);
  await openEditor(page);
  await page.locator('#body').fill('ร่างที่ยังไม่บันทึก');
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('admin-autosave:')));

  // Reload without the beforeEach clear.
  await page.evaluate(() => sessionStorage.setItem('keep', '1'));
  page.on('dialog', (d) => void d.accept()); // beforeunload, then the restore prompt
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  await expect(page.locator('#body')).toHaveValue('ร่างที่ยังไม่บันทึก');
});

test('admin pages are not indexable and public pages do not list drafts', async ({ page }) => {
  await mockApi(page);
  const res = await page.goto('/admin/');
  expect(res?.headers()['cache-control']).toBe('no-store');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  await page.goto('/');
  await expect(page.getByText('CP Scholarship Bootcamp 2025')).toBeVisible();
  await expect(page.getByText('CP Scholarship Bootcamp 2026')).toHaveCount(0);
});

test('admin API routes resolve at the exact URLs the client calls (no mocks)', async ({ request }) => {
  const me = await request.get('/api/admin/me/');
  expect(me.status()).toBe(200);
  expect(await me.json()).toEqual({ email: 'e2e@example.com' });

  const bad = await request.get('/api/admin/posts/..%2F..%2Fsecret/');
  expect([400, 404]).toContain(bad.status());

  const crossOrigin = await request.post('/api/admin/posts/', { data: {}, headers: { Origin: 'https://evil.test' } });
  // Dev bypass skips Access, but body validation still runs; production adds the Origin check (unit-tested).
  expect(crossOrigin.status()).toBe(400);
});
