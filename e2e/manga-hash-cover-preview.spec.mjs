import { test, expect } from '@playwright/test';

test('a #1 manga shows the first external page as an inert thumbnail; ordinary web pages keep the WEB cover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.route('https://hash-cover-fixture.test/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body style="background:#eff2fa;margin:0"><div id="page-one" style="background:#446ca8;color:white;font:48px sans-serif;height:85vh">第一ページ</div></body></html>',
  }));

  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/home\.html$/);
  await page.evaluate(() => {
    localStorage.setItem('mangaReaderSavedItems', JSON.stringify([
      { id: 'hash-cover', title: 'Hash Cover Fixture', url: 'https://hash-cover-fixture.test/work.html#1', addedAt: Date.now() },
      { id: 'ordinary-embed', title: 'Ordinary Embed Fixture', url: 'https://hash-cover-fixture.test/work.html', addedAt: Date.now() - 10 },
    ]));
  });
  await page.goto('manga.html');
  const hashCard = page.locator('.book-card').filter({ has: page.locator('.book-title', { hasText: 'Hash Cover Fixture' }) });
  const ordinaryCard = page.locator('.book-card').filter({ has: page.locator('.book-title', { hasText: 'Ordinary Embed Fixture' }) });
  await expect(hashCard).toBeVisible();
  await expect(ordinaryCard).toBeVisible();

  const preview = hashCard.locator('.book-cover-hash-preview');
  const frame = preview.locator('iframe');
  await expect(frame).toHaveAttribute('src', 'https://hash-cover-fixture.test/work.html#1');
  await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
  await expect(frame).toHaveAttribute('tabindex', '-1');
  await expect(frame).toHaveAttribute('aria-hidden', 'true');
  await expect(preview).toBeVisible();
  await expect(hashCard.frameLocator('.book-cover-hash-preview iframe').locator('#page-one')).toHaveText('第一ページ');
  const behavior = await preview.evaluate(node => ({
    previewPointer: getComputedStyle(node).pointerEvents,
    iframePointer: getComputedStyle(node.querySelector('iframe')).pointerEvents,
    iframeInert: node.querySelector('iframe').inert,
  }));
  expect(behavior.previewPointer).toBe('none');
  expect(behavior.iframePointer).toBe('none');
  expect(behavior.iframeInert).toBe(true);
  await expect(ordinaryCard.locator('.book-cover-hash-preview')).toHaveCount(0);

  // The preview is not clickable as a website; the card remains a Reader link.
  await hashCard.locator('.book-cover').click({ position: { x: 35, y: 45 } });
  await expect(page).toHaveURL(/reader\.html\?item=hash-cover/);
});
