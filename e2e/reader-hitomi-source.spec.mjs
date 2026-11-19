import { test, expect } from '@playwright/test';

test('Hitomi gallery metadata is resolved into reader images without persisting remote URLs', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  const firstHash = 'a'.repeat(64);
  const secondHash = 'b'.repeat(64);
  let manifestReads = 0;
  const browserErrors = [];
  const remoteRequests = [];
  page.on('pageerror', error => browserErrors.push('pageerror: ' + String(error.message)));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push('console: ' + message.text()); });
  page.on('requestfailed', request => browserErrors.push('request: ' + request.url() + ' ' + (request.failure()?.errorText || '')));
  page.on('request', request => { if (request.url().includes('gold-usergeneratedcontent.net')) remoteRequests.push(request.url()); });
  await page.route('https://ltn.gold-usergeneratedcontent.net/gg.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: 'var gg={b:"1795075201/",s:function(h){return String(parseInt(h.slice(-1)+h.slice(-3,-1),16));},m:function(g){return g%2;}};'
  }));
  await page.route('https://ltn.gold-usergeneratedcontent.net/galleries/3904373.js', route => {
    manifestReads++;
    return route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'var galleryinfo=' + JSON.stringify({ id: 3904373, files: [
        { hash: firstHash, haswebp: 1, hasavif: 1 },
        { hash: secondHash, haswebp: 1, hasavif: 1 }
      ] }) + ';'
    });
  });
  await page.route(/^https:\/\/w\d+\.gold-usergeneratedcontent\.net\/.*\.webp$/, route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGMM2HKJgYGBiYGBgYGBAQAVsAHaWvT9gAAAAABJRU5ErkJggg==', 'base64')
  }));

  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-guest-mode', 'true');
  // Register through the actual user form instead of injecting a storage fixture.
  await page.goto('add.html');
  await page.locator('#openMangaAdd').click();
  await page.locator('#mangaAddForm [name="title"]').fill('Remote pages test');
  await page.locator('#mangaAddForm [name="url"]').fill('https://hitomi.la/reader/3904373.html');
  await page.locator('#mangaAddForm [type="submit"]').click();
  await expect(page.locator('#mangaAddStatus')).toContainText('端末に保存しました');
  const workId = await page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderSavedItems') || '[]')
    .find(item => item.url === 'https://hitomi.la/reader/3904373.html')?.id);
  expect(workId).toBeTruthy();
  // Follow the real shelf path and verify the source type before launching Reader.
  await page.goto('manga.html');
  const card = page.locator('.book-card').filter({ has: page.locator('.book-title', { hasText: 'Remote pages test' }) });
  await expect(card).toBeVisible();
  const cover = await card.locator('.book-cover img').first().getAttribute('src');
  expect(decodeURIComponent(cover || '')).toContain('外部画像リーダー');
  expect(decodeURIComponent(cover || '')).not.toContain('埋め込みページ');
  await card.locator('.book-cover').click();
  await expect(page).toHaveURL(/reader\.html\?item=i-/);

  // Include the Reader diagnostics in CI assertion failures, not just 1 / 1.
  try {
    await expect(page.locator('#pageLabel')).toHaveText('1 / 2', { timeout: 16000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      label: document.getElementById('pageLabel')?.textContent,
      readerStatus: document.getElementById('readerStatus')?.textContent,
      readerMessage: document.getElementById('readerMessage')?.textContent?.slice(0, 500),
      runtime: !!window.MangaReaderRuntime,
      galleryResolver: window.ReaderHitomiSourceFactory?.galleryIdFromUrl?.('https://hitomi.la/reader/3904373.html'),
      activeImages: document.querySelectorAll('.readerPageImage').length,
      frames: document.querySelectorAll('#pageStage iframe').length
    }));
    console.error('REMOTE_READER_DIAGNOSTICS', JSON.stringify({
      ...diagnostics, manifestReads, remoteRequests, browserErrors
    }));
    throw error;
  }
  await expect(page.locator('.readerPageImage')).toBeVisible();
  const first = await page.locator('.readerPageImage').getAttribute('src');
  expect(first).toContain('/1795075201/2730/' + firstHash + '.webp');
  await page.locator('#nextBtn').click();
  await expect(page.locator('#pageLabel')).toHaveText('2 / 2');
  const second = await page.locator('.readerPageImage').getAttribute('src');
  expect(second).toContain('/1795075201/3003/' + secondHash + '.webp');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderSavedItems'))[0]);
  expect(saved.pages).toBeUndefined();
  expect(saved.pageManifest).toBeUndefined();
  expect(manifestReads).toBeGreaterThan(0);
});
