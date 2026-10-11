import { test, expect } from '@playwright/test';

test('guest can navigate home, manga, video, and profile without protected backend access', async ({ page }) => {
  const uncaught = [];
  page.on('pageerror', error => uncaught.push(error.message));
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());

  await page.goto('index.html');
  await expect(page.getByRole('button', { name: 'ログインせずに使う' })).toBeVisible();
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/home\.html$/);
  await expect(page.locator('#homeGrid')).toBeVisible();

  await page.getByRole('navigation', { name: 'モバイルメニュー' }).getByRole('link', { name: '漫画' }).click();
  await expect(page).toHaveURL(/manga\.html$/);
  await expect(page.locator('#mangaListSection')).toBeVisible();

  await page.getByRole('navigation', { name: 'モバイルメニュー' }).getByRole('link', { name: '動画' }).click();
  await expect(page).toHaveURL(/video\.html$/);
  await expect(page.locator('#videoLibraryApp')).toBeVisible();

  await page.getByRole('navigation', { name: 'モバイルメニュー' }).getByRole('link', { name: 'プロフィール' }).click();
  await expect(page).toHaveURL(/profile\.html$/);
  await expect(page.locator('#profileShortsResetBtn')).toBeVisible();
  expect(await page.evaluate(() => typeof window.MangaReaderVideoShortsState?.reset)).toBe('function');
  await expect(page.locator('#profileShortsResetStatus')).not.toContainText('読み込めませんでした');
  await page.locator('#profileShortsResetBtn').click();
  await expect(page.locator('#profileShortsResetStatus')).toContainText('再生順をリセットしました');
  expect(uncaught).toEqual([]);
});

for (const startRoute of ['manga', 'video']) {
  test(`${startRoute} shell preloads the profile Shorts dependency before SPA navigation`, async ({ page }) => {
    await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
    await page.goto('index.html');
    await page.getByRole('button', { name: 'ログインせずに使う' }).click();
    await expect(page).toHaveURL(/home\.html$/);
    await page.getByRole('navigation', { name: 'モバイルメニュー' }).getByRole('link', { name: startRoute === 'manga' ? '漫画' : '動画' }).click();
    await expect(page).toHaveURL(new RegExp(`${startRoute}\\.html$`));
    await page.getByRole('navigation', { name: 'モバイルメニュー' }).getByRole('link', { name: 'プロフィール' }).click();
    await expect(page).toHaveURL(/profile\.html$/);
    expect(await page.evaluate(() => typeof window.MangaReaderVideoShortsState?.reset)).toBe('function');
    await expect(page.locator('#profileShortsResetStatus')).not.toContainText('読み込めませんでした');
    await page.locator('#profileShortsResetBtn').click();
    await expect(page.locator('#profileShortsResetStatus')).toContainText('再生順をリセットしました');
  });
}
