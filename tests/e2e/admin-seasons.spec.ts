import { expect, test, type Page } from '@playwright/test';

const SHA = 'b'.repeat(40);

const SNOW = { enabled: true, start: '11-15', end: '12-30' };

async function mockSeasons(page: Page, initial = { christmas: { enabled: true, start: '12-01', end: '01-06' }, snow: SNOW }) {
  const saved: unknown[] = [];
  await page.route('**/api/admin/seasons/', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ seasons: initial, sha: SHA }) });
    }
    saved.push(JSON.parse(req.postData() ?? '{}'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 'c'.repeat(40), commitUrl: 'https://github.com/x/commit/2' }) });
  });
  return saved;
}

test('loads the committed dates and saves edited ones', async ({ page }) => {
  const saved = await mockSeasons(page);
  await page.goto('/admin/seasons/');
  await page.locator('#seasons-form[data-ready="true"]').waitFor();

  await expect(page.locator('select[name="christmas.start.month"]')).toHaveValue('12');
  await expect(page.locator('select[name="christmas.end.day"]')).toHaveValue('06');
  await expect(page.locator('[data-season-id="christmas"] [data-status]')).toContainText('ข้ามปีใหม่');

  await page.locator('select[name="christmas.start.day"]').selectOption('15');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#save-status')).toContainText('บันทึกแล้ว');

  expect(saved[0]).toEqual({ seasons: { christmas: { enabled: true, start: '12-15', end: '01-06' }, snow: SNOW }, sha: SHA });
});

test('an impossible date is flagged and never sent', async ({ page }) => {
  const saved = await mockSeasons(page);
  await page.goto('/admin/seasons/');
  await page.locator('#seasons-form[data-ready="true"]').waitFor();

  await page.locator('select[name="christmas.end.month"]').selectOption('02');
  await page.locator('select[name="christmas.end.day"]').selectOption('30');
  await expect(page.locator('[data-season-id="christmas"] [data-status]')).toContainText('ไม่มีอยู่จริง');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#save-status')).toContainText('แก้วันที่');
  expect(saved).toHaveLength(0);
});

test('turning a season off is saved as enabled: false', async ({ page }) => {
  const saved = await mockSeasons(page);
  await page.goto('/admin/seasons/');
  await page.locator('#seasons-form[data-ready="true"]').waitFor();
  await page.locator('input[name="christmas.enabled"]').uncheck();
  await expect(page.locator('[data-season-id="christmas"] [data-status]')).toContainText('ปิดอยู่');
  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.locator('#save-status')).toContainText('บันทึกแล้ว');
  expect(saved[0]).toMatchObject({ seasons: { christmas: { enabled: false } } });
});

test('the seasons API route exists at the URL the page calls (no mocks)', async ({ request }) => {
  const res = await request.put('/api/admin/seasons/', { data: { seasons: { christmas: { enabled: true, start: '02-30', end: '03-01' }, snow: SNOW } } });
  expect(res.status()).toBe(400);
});
