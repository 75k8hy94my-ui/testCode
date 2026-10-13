import { test, expect } from '@playwright/test';

test('guest publishes split clips and full edit to video list, overwrites and restores original', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('testCode.guestMode.v1', '1'));
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('mangaReaderVideos', JSON.stringify([{
      id: 'publish-original', title: '編集元', url: 'https://media.example.test/movie.mp4',
      addedAt: 1, updatedAt: 1,
    }]));
    localStorage.setItem('mangaReaderVideoMeta', JSON.stringify({ 'publish-original': { favorite: true } }));
  });
  await page.goto('video-virtual-editor.html?id=publish-original');
  await expect(page.locator('[data-publish-panel]')).toBeVisible();
  await expect(page.locator('[data-add]')).toBeEnabled();

  // Prepare two clips without fetching media over the network.
  await page.evaluate(() => {
    const start = document.querySelector('[data-start]');
    const end = document.querySelector('[data-end]');
    const add = document.querySelector('[data-add]');
    start.value = '0'; end.value = '10'; add.click();
    start.value = '10'; end.value = '20'; add.click();
    const angle = document.querySelector('[data-rotation]');
    angle.value = '90'; angle.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.vveClip')).toHaveCount(2);

  await page.locator('[data-publish-clips]').click();
  await expect(page.locator('[data-publish-status]')).toContainText('2本の動画');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderVideos')).length)).toBe(3);
  const clipIds = await page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderVideos'))
    .filter(video => video.id !== 'publish-original').map(video => video.id));
  expect(clipIds).toHaveLength(2);

  await page.locator('[data-publish-new]').click();
  await expect(page.locator('[data-publish-status]')).toContainText('1本の動画');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderVideos')).length)).toBe(4);

  await page.locator('[data-publish-target]').selectOption('publish-original');
  await page.locator('[data-publish-overwrite]').click();
  await expect(page.locator('[data-publish-status]')).toContainText('既存動画を編集版に変更');
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await expect(page.locator('.vl-card')).toHaveCount(4);
  await expect(page.locator('.vl-card[data-video-id="publish-original"]')).toContainText('元動画の編集版');

  const publication = await page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderVideoMeta'))['publish-original'].virtualPublishedEdit);
  expect(publication.kind).toBe('overwrite');
  expect(publication.edit.clips[1].rotation).toBe(90);

  await page.goto('video-player.html?id=publish-original');
  await expect(page).toHaveURL(/video-virtual-player\.html\?video=publish-original/);
  await expect(page.locator('[data-restore]')).toBeVisible();
  await page.locator('[data-restore]').click();
  await expect(page).toHaveURL(/video-player\.html\?id=publish-original/);
  const snapshot = await page.evaluate(() => ({
    original: JSON.parse(localStorage.getItem('mangaReaderVideos')).find(video => video.id === 'publish-original'),
    publication: JSON.parse(localStorage.getItem('mangaReaderVideoMeta'))['publish-original'].virtualPublishedEdit,
  }));
  expect(snapshot.original.url).toBe('https://media.example.test/movie.mp4');
  expect(snapshot.publication).toBeNull();

  // One of the split outputs also routes into the virtual sequence player.
  await page.goto('video-player.html?id=' + encodeURIComponent(clipIds[0]));
  await expect(page).toHaveURL(/video-virtual-player\.html\?video=/);
  await expect(page.locator('[data-title]')).toContainText('分割');
});
