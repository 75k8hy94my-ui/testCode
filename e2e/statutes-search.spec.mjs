import { test, expect } from '@playwright/test';

test('statutes common header searches article numbers and article text', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=labor-standards');
  await expect(page.locator('#statutesCurrentSection')).toHaveText('労働基準法');
  await expect(page.locator('.statuteNumber').filter({ hasText: /^３２条$/ })).toHaveCount(1);
  await expect(page.locator('#statutesSearchPanel')).toBeVisible();
  const input = page.getByRole('searchbox', { name: '条番号または条文の文字列' });
  await input.fill('32条');
  await expect(page.locator('.statutesSearchResult')).toHaveCount(1);
  await expect(page.locator('.statutesSearchResult strong')).toHaveText('３２条　労働時間');
  await input.fill('３２条');
  await expect(page.locator('.statutesSearchResult strong')).toHaveText('３２条　労働時間');
  await input.fill('労働時間');
  await expect(page.locator('.statutesSearchResult').first()).toBeVisible();
  await page.locator('.statutesSearchResult').first().click();
  await expect(page.locator('#statutesSearchPanel')).toBeVisible();
  await expect(page.locator('.statutesSearchHit')).toHaveCount(1);
});

test('civil general article 972 search opens family law and scrolls to the correct article', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  await expect(page.locator('#statutesCurrentSection')).toHaveText('民法総則');
  await expect(page.locator('#statutesSearchPanel')).toBeVisible();
  await page.getByRole('searchbox', { name: '条番号または条文の文字列' }).fill('９７２');
  await expect(page.locator('.statutesSearchResult strong')).toContainText('９７２条');
  await page.locator('.statutesSearchResult').first().click();
  await expect(page).toHaveURL(/section=civil-family/);
  await expect(page.locator('#statutesCurrentSection')).toHaveText('家族法');
  await expect(page.locator('.statutesSearchHit .statuteNumber')).toHaveText('９７２条');
});

test('desktop statutes search uses the shared sidebar magnifier, not the top bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  await expect(page.locator('#statutesSearchToggle')).toBeHidden();
  await expect(page.locator('#desktopNavSearch')).toBeVisible();
  await expect(page.locator('#statutesSearchPanel')).toBeVisible();
  await page.locator('#desktopNavSearch').click();
  await expect(page.locator('#statutesSearchPanel')).toBeHidden();
  await page.locator('#desktopNavSearch').click();
  await expect(page.locator('#statutesSearchPanel')).toBeVisible();
  await page.locator('#statutesSearchInput').fill('９７２');
  await expect(page.locator('.statutesSearchResult strong')).toContainText('９７２条');
});

test('search dock does not overlap statute text and wraps long results on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  const dock = page.locator('#statutesSearchPanel');
  await expect(dock).toBeVisible();
  await expect.poll(async () => {
    const a = await page.locator('#routeContent').boundingBox();
    const b = await dock.boundingBox();
    return a && b ? a.x + a.width <= b.x : false;
  }).toBe(true);
  await expect.poll(async () => (await dock.boundingBox()).width).toBeLessThan(250);
  await page.locator('#statutesSearchInput').fill('法律行為');
  await expect(page.locator('.statutesSearchResult').first()).toBeVisible();
  const result = page.locator('.statutesSearchResult span').first();
  await expect(result).toHaveCSS('white-space', 'normal');
  await expect(result).toHaveCSS('overflow-wrap', 'anywhere');
});

test('Enter navigates to the first statute search result', async ({ page }) => {
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  const input = page.locator('#statutesSearchInput');
  await input.fill('９７２');
  await input.press('Enter');
  await expect(page).toHaveURL(/section=civil-family/);
  await expect(page.locator('.statutesSearchHit .statuteNumber')).toHaveText('９７２条');
});

test('mobile search starts hidden and search overlay can overlap with translucency', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  await expect(page.locator('#statutesSearchPanel')).toBeHidden();
  await page.locator('#statutesSearchToggle').click();
  await expect(page.locator('#statutesSearchPanel')).toBeVisible();
  await page.locator('#statutesSearchInput').evaluate(element => element.blur());
  await expect(page.locator('#statutesSearchPanel')).toHaveCSS('opacity', '0.57');
  await page.locator('#statutesSearchInput').focus();
  await expect(page.locator('#statutesSearchPanel')).toHaveCSS('opacity', '1');
});

test('consecutive deleted civil articles appear as one range', async ({ page }) => {
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  const deletedRange = page.locator('.statuteDeletedRange').filter({ hasText: '３８条〜' }).first();
  await expect(deletedRange).toBeVisible();
  await expect(deletedRange).toContainText('削除');
  await expect(page.locator('.statuteCard .statuteNumber').filter({ hasText: /^３９条$/ })).toHaveCount(0);
});
