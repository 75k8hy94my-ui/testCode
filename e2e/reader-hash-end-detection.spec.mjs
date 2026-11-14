import { test, expect } from '@playwright/test';

test('reader learns the last hash page only when normal sequential reading reaches #1- fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  // Same-origin test fixture, because a real cross-origin iframe's location
  // is unreadable by design. #1 also becomes #1-, but only #4 is invalid.
  await page.route('**/hash-end-fixture.html', async route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main id="page-marker"></main>
      <script>
        function show() {
          const requested = Number(location.hash.slice(1));
          if (requested === 1 || requested > 3) history.replaceState(null, '', '#1-');
          document.querySelector('#page-marker').textContent = String(requested);
        }
        show();
        addEventListener('hashchange', show);
      <\/script>
    </body></html>`,
  }));

  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/home\.html$/);
  await page.evaluate(() => localStorage.setItem('mangaReaderSavedItems', JSON.stringify([{
    id: 'hash-end-fixture',
    title: 'End detection fixture',
    url: location.origin + '/hash-end-fixture.html#1'
  }])));
  await page.goto('reader.html?item=hash-end-fixture');
  const label = page.locator('#pageLabel');
  await expect(label).toHaveText('1 / ?');
  const frame = page.frameLocator('#pageStage iframe');
  await expect(frame.locator('#page-marker')).toHaveText('1');
  await expect.poll(() => page.locator('#pageStage iframe').evaluate(node => node.contentWindow.location.hash)).toBe('#1-');
  await expect(label).toHaveText('1 / ?', { timeout: 4000 });

  for (const p of [2, 3]) {
    await page.locator('#nextBtn').click();
    await expect(label).toHaveText(p + ' / ?');
    await expect(frame.locator('#page-marker')).toHaveText(String(p));
    await expect.poll(() => page.locator('#pageStage iframe').evaluate(node => node.contentWindow.location.hash)).toBe('#' + p);
  }

  await page.locator('#nextBtn').click();
  await expect(label).toHaveText('3 / 3');
  await expect(page.locator('#pageStage iframe')).toHaveAttribute('src', /#3$/);
  await expect(page.locator('#nextBtn')).toBeDisabled();
  await expect(page.locator('#lastBtn')).toHaveAttribute('aria-label', '最後のページ');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mangaReaderSavedItems'))[0].hashPageCount)).toBe(3);
  await page.locator('#firstBtn').click();
  await expect(label).toHaveText('1 / 3');
});
