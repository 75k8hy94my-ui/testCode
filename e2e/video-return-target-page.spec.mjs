import { test, expect } from '@playwright/test';

async function openGuestVideoList(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.locator('#desktopNavVideo').click();
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('mangaReaderVideos', JSON.stringify(Array.from({ length: 55 }, (_, index) => ({
      id: 'return-video-' + (index + 1),
      title: '戻り先動画 ' + (index + 1),
      url: 'https://example.test/video/' + (index + 1) + '.mp4',
      a: 'url', b: String(index + 1), addedAt: index + 1,
    }))));
    localStorage.setItem('mangaReaderVideoMeta', '{}');
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  });
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('1 / 3');
  await page.locator('#videoLibraryNextPage').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('2 / 3');
  await page.locator('#videoLibraryNextPage').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('3 / 3');
  await page.locator('.vl-card[data-video-id="return-video-3"] .vl-open').first().click();
  await expect(page).toHaveURL(/video-player\.html\?id=return-video-3/);
}

test('player header returns to the page containing the current video, even after a route refresh', async ({ page }) => {
  await openGuestVideoList(page);
  await expect(page.locator('#shellTitle a')).toHaveAttribute('href', /returnVideo=return-video-3/);
  await page.locator('#shellTitle a').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('3 / 3');
  await expect(page.locator('.vl-card[data-video-id="return-video-3"]')).toBeVisible();
  await page.evaluate(() => window.HomeProfileSPA.renderRoute());
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('3 / 3');
  await expect(page.locator('.vl-card[data-video-id="return-video-3"]')).toBeVisible();
  await page.locator('#videoLibraryPrevPage').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('2 / 3');
});

test('desktop Video navigation from the player also restores the video page', async ({ page }) => {
  await openGuestVideoList(page);
  await page.locator('#desktopNavVideo').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('3 / 3');
  await expect(page.locator('.vl-card[data-video-id="return-video-3"]')).toBeVisible();
});
