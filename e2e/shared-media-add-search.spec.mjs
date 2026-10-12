import { test, expect } from '@playwright/test';

test('shared add page stores a manga in guest mode and shared search scopes the manga list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.locator('#desktopNavAdd').click();
  await expect(page).toHaveURL(/add\.html/);
  await page.locator('#openMangaAdd').click();
  await page.locator('#mangaAddForm [name="title"]').fill('共通追加テスト漫画');
  await page.locator('#mangaAddForm [name="url"]').fill('https://example.com/pages/1.jpg');
  await page.locator('#mangaAddForm [type="submit"]').click();
  await expect(page.locator('#mangaAddStatus')).toContainText('端末に保存しました');
  await page.locator('#desktopNavManga').click();
  await expect(page.locator('#mangaListSection')).toBeVisible();
  await expect(page.locator('#exportImportRow')).toBeHidden();
  await expect(page.locator('#smartListRow')).toBeHidden();
  await expect(page.locator('#shelfSearchInput')).toBeHidden();
  await expect(page.locator('.book-title').filter({ hasText: '共通追加テスト漫画' })).toBeVisible();
  await page.locator('#desktopNavSearch').click();
  await page.locator('#testcodeContextSearchInput').fill('共通追加テスト漫画');
  await expect(page.locator('.book-title').filter({ hasText: '共通追加テスト漫画' })).toBeVisible();
  await page.locator('#testcodeContextSearchInput').fill('一致しないタイトル');
  await expect(page.locator('.book-title').filter({ hasText: '共通追加テスト漫画' })).toHaveCount(0);
  await page.getByRole('button', { name: '検索を閉じる' }).click();
  await expect(page.locator('.book-title').filter({ hasText: '共通追加テスト漫画' })).toBeVisible();
});
