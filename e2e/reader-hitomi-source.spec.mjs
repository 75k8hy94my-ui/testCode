import { test, expect } from '@playwright/test';

test('Hitomi gallery metadata is resolved into reader images without persisting remote URLs', async ({ page }) => {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  const firstHash = 'a'.repeat(64);
  const secondHash = 'b'.repeat(64);
  let manifestReads = 0;
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
  await page.evaluate(() => localStorage.setItem('mangaReaderSavedItems', JSON.stringify([{
    id: 'remote-pages-test', title: 'Remote pages test',
    url: 'https://hitomi.la/reader/3904373.html', addedAt: Date.now()
  }])));
  await page.goto('reader.html?item=remote-pages-test');
  await expect(page.locator('#pageLabel')).toHaveText('1 / 2', { timeout: 15000 });
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
