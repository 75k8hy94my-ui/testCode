import { test, expect } from '@playwright/test';

test('guest can group existing videos without a name, add a member and detach it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(() => {
    const videos = ['a', 'b', 'c'].map((id, index) => ({
      id, title: '動画' + id, url: 'https://example.test/' + id + '.mp4',
      addedAt: 3 - index,
    }));
    localStorage.setItem('mangaReaderVideos', JSON.stringify(videos));
    localStorage.setItem('mangaReaderVideoMeta', '{}');
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  });

  await page.locator('#videoLibrarySeriesMode').click();
  await expect(page.locator('#videoLibrarySeriesBar')).toBeVisible();
  await expect(page.locator('input[id*="seriesName"]')).toHaveCount(0);
  await page.locator('.vl-card[data-video-id="a"] .vl-series-pick input').check();
  await page.locator('.vl-card[data-video-id="b"] .vl-series-pick input').check();
  await expect(page.locator('#videoLibrarySeriesCount')).toHaveText('2本選択中');
  await page.locator('#videoLibrarySeriesGroup').click();
  await expect(page.locator('.vl-series')).toHaveCount(1);
  await expect(page.locator('.vl-card')).toHaveCount(1);
  await expect(page.locator('.vl-series-toggle')).toHaveText('▸ シリーズ · 2本');

  const groupId = await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('mangaReaderVideoMeta'));
    if (!meta.a.seriesId || meta.a.seriesId !== meta.b.seriesId) throw Error('not grouped');
    return meta.a.seriesId;
  });

  // Selecting the existing box and an ungrouped video extends it rather
  // than creating an unrelated named folder.
  await page.locator('#videoLibrarySeriesMode').click();
  await page.locator('.vl-series-select-all input').check();
  await page.locator('.vl-card[data-video-id="c"] .vl-series-pick input').check();
  await page.locator('#videoLibrarySeriesGroup').click();
  await expect(page.locator('.vl-series-toggle')).toHaveText('▸ シリーズ · 3本');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderVideoMeta')).c.seriesId)).toBe(groupId);

  await page.locator('.vl-series-toggle').click();
  await expect(page.locator('.vl-series .vl-card')).toHaveCount(3);
  await page.locator('.vl-series .vl-card[data-video-id="c"] .videoCardMenuButton').click();
  await page.getByRole('menuitem', { name: 'シリーズから外す' }).click();
  await expect(page.locator('.vl-series-toggle')).toHaveText('▾ シリーズ · 2本');
  await expect(page.locator('.vl-card')).toHaveCount(3);
  const members = await page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('mangaReaderVideoMeta'));
    const videos = JSON.parse(localStorage.getItem('mangaReaderVideos'));
    return { members: [meta.a.seriesId, meta.b.seriesId, meta.c.seriesId], videoCount: videos.length };
  });
  expect(members).toEqual({ members: [groupId, groupId, null], videoCount: 3 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.reload();
  await expect(page.locator('.vl-series')).toHaveCount(1);
  await expect(page.locator('.vl-series-toggle')).toHaveText('▸ シリーズ · 2本');
});

test('series membership does not expose hidden videos in the regular list', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('mangaReaderVideos', JSON.stringify([
      { id: 'visible', title: 'public', url: 'https://example.test/public.mp4', addedAt: 2 },
      { id: 'hidden', title: 'private', url: 'https://example.test/private.mp4', addedAt: 1 },
    ]));
    localStorage.setItem('mangaReaderVideoMeta', JSON.stringify({
      visible: { seriesId: 'secret' },
      hidden: { seriesId: 'secret', hidden: true },
    }));
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  });
  await expect(page.locator('.vl-series')).toHaveCount(0);
  await expect(page.locator('.vl-card')).toHaveCount(1);
  await expect(page.locator('.vl-card[data-video-id="hidden"]')).toHaveCount(0);
});
