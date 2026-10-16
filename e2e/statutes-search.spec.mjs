import { test, expect } from '@playwright/test';

test('statutes common header searches article numbers and article text', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=labor-standards');
  await expect(page.locator('#statutesCurrentSection')).toHaveText('労働基準法');
  await expect(page.locator('.statuteNumber').filter({ hasText: /^３２条$/ })).toHaveCount(1);
  await page.getByRole('button', { name: '条文を検索' }).click();
  const input = page.getByRole('searchbox', { name: '条番号または条文の文字列' });
  await input.fill('32条');
  await expect(page.locator('#statutesSearchCount')).toHaveText('1件見つかりました');
  await expect(page.locator('.statutesSearchResult strong')).toHaveText('３２条　労働時間');
  await input.fill('労働時間');
  await expect(page.locator('.statutesSearchResult').first()).toBeVisible();
  await page.locator('.statutesSearchResult').first().click();
  await expect(page.locator('#statutesSearchPanel')).toBeHidden();
  await expect(page.locator('.statutesSearchHit')).toHaveCount(1);
});

test('civil general article 972 search opens family law and scrolls to the correct article', async ({ page }) => {
  await page.route(/supabase\\.co|\\/auth\\/v1\\/|\\/rest\\/v1\\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  await expect(page.locator('#statutesCurrentSection')).toHaveText('民法総則');
  await page.getByRole('button', { name: '条文を検索' }).click();
  await page.getByRole('searchbox', { name: '条番号または条文の文字列' }).fill('972');
  await expect(page.locator('.statutesSearchResult strong')).toContainText('９７２条');
  await page.locator('.statutesSearchResult').first().click();
  await expect(page).toHaveURL(/section=civil-family/);
  await expect(page.locator('#statutesCurrentSection')).toHaveText('家族法');
  await expect(page.locator('.statutesSearchHit .statuteNumber')).toHaveText('９７２条');
});
