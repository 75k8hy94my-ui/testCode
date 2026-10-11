import { test, expect } from '@playwright/test';

test('shared video cards keep the YouTube layout and menu behavior on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/i\.ytimg\.com|supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, (route) => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();

  await page.evaluate(() => {
    const videos = Array.from({ length: 3 }, (_, index) => ({
      id: `card-${index + 1}`,
      title: `YouTube風の表示確認用タイトル ${index + 1} とても長いタイトルの折り返しを確認します`,
      url: `https://www.youtube.com/watch?v=sample${index + 1}`,
      a: 'youtube',
      b: `sample${index + 1}`,
      addedAt: index + 1,
      durationSeconds: 95,
    }));
    localStorage.setItem('mangaReaderVideos', JSON.stringify(videos));
    localStorage.setItem('mangaReaderVideoMeta', JSON.stringify({ 'card-1': { tags: ['design'] } }));
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  });

  const firstCard = page.locator('.videoCard--grid').first();
  await expect(page.locator('.videoCard--grid')).toHaveCount(3);
  await expect(firstCard.locator('.videoCardTitle')).toHaveCSS('-webkit-line-clamp', '2');
  await expect(firstCard.locator('.videoCardMenuButton')).toBeVisible();
  const geometry = await firstCard.locator('.videoCardThumb').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { ratio: rect.width / rect.height, width: rect.width };
  });
  expect(geometry.ratio).toBeCloseTo(16 / 9, 1);
  expect(await page.locator('.vl-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBeGreaterThan(1);

  const listUrl = page.url();
  await firstCard.locator('.videoCardMenuButton').click();
  await expect(firstCard.locator('.videoCardMenu')).toBeVisible();
  await expect(page).toHaveURL(listUrl);
  await expect(firstCard.getByRole('menuitem', { name: 'お気に入りに追加' })).toBeVisible();
  await firstCard.getByRole('menuitem', { name: 'お気に入りに追加' }).click();
  await expect(page.locator('.videoCard--grid')).toHaveCount(3);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.vl-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await firstCard.locator('.videoCardTitle').click();
  await expect(page).toHaveURL(/video-player\.html\?id=card-3/);
  await expect(page.locator('.videoCard--related')).toHaveCount(2);
  const relatedCard = page.locator('.videoCard--related').first();
  const relatedUrl = page.url();
  await relatedCard.locator('.videoCardMenuButton').scrollIntoViewIfNeeded();
  await relatedCard.locator('.videoCardMenuButton').click();
  await expect(relatedCard.locator('.videoCardMenu')).toBeVisible();
  await expect(page).toHaveURL(relatedUrl);
  const editAction = relatedCard.locator('.videoCardMenuEdit');
  await expect(editAction).toHaveAttribute('href', /return=player/);
  await editAction.click();
  await expect(page).toHaveURL(/video-edit\.html\?id=card-/);
  await expect(page).toHaveURL(/return=player/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
