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
      url: `https://cdn.example.com/video/sample${index + 1}.mp4`,
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

test('ordinary video-page URL renders as a compact bookmark, filters separately, and opens its original address', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, (route) => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();

  const bookmarkUrl = 'https://example.com/video/111.html?key=abc#part';
  await page.evaluate((url) => {
    localStorage.setItem('mangaReaderVideos', JSON.stringify([
      { id: 'page', url, title: '外部サイトの動画ページ', addedAt: 2 },
      { id: 'mp4', url: 'https://cdn.example.com/clip.mp4', title: '直接再生動画', addedAt: 1 },
    ]));
    localStorage.setItem('mangaReaderVideoMeta', '{}');
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  }, bookmarkUrl);

  const bookmark = page.locator('.vl-card[data-video-id="page"]');
  const direct = page.locator('.vl-card[data-video-id="mp4"]');
  await expect(bookmark).toHaveClass(/videoCard--bookmark/);
  await expect(bookmark.locator('.videoCardThumb')).toHaveCount(0);
  await expect(bookmark.locator('.videoCardBookmarkDomain')).toHaveText('example.com');
  await expect(bookmark.locator('.videoCardTitle')).toHaveAttribute('href', bookmarkUrl);
  await expect(direct.locator('.videoCardThumb')).toHaveCount(1);
  const bookmarkHeight = await bookmark.evaluate((node) => node.getBoundingClientRect().height);
  const directHeight = await direct.evaluate((node) => node.getBoundingClientRect().height);
  expect(bookmarkHeight).toBeLessThan(directHeight);
  await page.locator('#videoLibraryKind').selectOption('bookmark');
  await expect(page.locator('.vl-card')).toHaveCount(1);
  await expect(bookmark).toBeVisible();
  await page.locator('#videoLibraryKind').selectOption('direct');
  await expect(page.locator('.vl-card')).toHaveCount(1);
  await expect(direct).toBeVisible();
  await page.locator('#videoLibraryKind').selectOption('all');

  // Intercept the remote destination so no external network is required.
  await page.route('https://example.com/video/111.html?key=abc', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Bookmark destination</title>' }));
  await bookmark.locator('.videoCardTitle').click();
  await expect(page).toHaveURL(bookmarkUrl);
});


test('untitled existing bookmark fetches on click, saves its title, and never refetches a saved title', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, (route) => route.abort());
  const outsideUrl = 'https://example.com/title-test?ref=one#section';
  const outsideWithTitle = 'https://example.com/pre-titled?ref=two';
  let lookupCalls = 0;
  await page.route(/^https:\/\/api\.microlink\.io\//, async (route) => {
    lookupCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ status: 'success', data: { title: '自動取得されたタイトル' } }),
    });
  });
  await page.route(/^https:\/\/example\.com\/(title-test|pre-titled)/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>External destination</title>' }));

  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('video.html');
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(({ outsideUrl, outsideWithTitle }) => {
    localStorage.setItem('testcode.video.bookmarkTitleLookupConsent.v1', 'allow');
    localStorage.removeItem('testcode.video.bookmarkTitleLookupDaily.v1');
    localStorage.setItem('mangaReaderVideos', JSON.stringify([
      { id: 'missing-title', url: outsideUrl, title: '', addedAt: 2 },
      { id: 'existing-title', url: outsideWithTitle, title: '手入力タイトル', addedAt: 1 },
    ]));
    localStorage.setItem('mangaReaderVideoMeta', '{}');
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  }, { outsideUrl, outsideWithTitle });
  await expect(page.locator('.vl-card[data-video-id="missing-title"]')).toBeVisible();
  expect(lookupCalls).toBe(0); // No bulk lookup when rendering existing bookmarks.

  await page.locator('.vl-card[data-video-id="missing-title"] .videoCardTitle').click();
  await expect(page).toHaveURL(outsideUrl);
  expect(lookupCalls).toBe(1);

  await page.goto('video.html');
  await expect(page.locator('.vl-card[data-video-id="missing-title"] .videoCardTitle')).toHaveText('自動取得されたタイトル');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderVideoMeta'))['missing-title'].title)).toBe('自動取得されたタイトル');
  await page.locator('.vl-card[data-video-id="missing-title"] .videoCardTitle').click();
  await expect(page).toHaveURL(outsideUrl);
  expect(lookupCalls).toBe(1); // Saved title suppresses future calls.

  await page.goto('video.html');
  await page.locator('.vl-card[data-video-id="existing-title"] .videoCardTitle').click();
  await expect(page).toHaveURL(outsideWithTitle);
  expect(lookupCalls).toBe(1); // Manually titled bookmarks are never overwritten.
});
