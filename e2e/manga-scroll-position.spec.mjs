import { test, expect } from '@playwright/test';

test('manga page turns do not snap the vertical scroll position back to the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();

  // Populate two full pages with equal-height covers to isolate the
  // unintended scrollIntoView() jump from legitimate scroll clamping.
  await page.evaluate(() => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: 'scroll-regression-' + index,
      title: '位置維持テスト作品 ' + index,
      url: 'https://example.invalid/page-' + index + '.jpg',
      addedAt: 1000 + index,
      folderId: null,
      author: '',
      tags: [],
    }));
    localStorage.setItem('mangaReaderSavedItems', JSON.stringify(items));
    localStorage.setItem('mangaReaderSavedFolders', '[]');
    localStorage.setItem('mangaReaderAuthorCards', '[]');
  });
  await page.goto('manga.html');
  await expect(page.locator('#mangaListSection')).toBeVisible();
  // Guest route startup can rehydrate from its own storage snapshot.
  // Remount after seeding to guarantee the pagination model sees new items.
  await page.evaluate(() => window.HomeProfileSPA.renderRoute());
  await expect(page.locator('#bookshelfPageLabel')).toHaveText('1 / 3');
  await expect(page.locator('.book-card')).toHaveCount(25);

  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
  const firstY = await page.evaluate(() => window.scrollY);

  // A tap on the page button and a horizontal swipe must both preserve Y.
  await page.locator('#bookshelfNextBtn').evaluate(button => button.click());
  await expect(page.locator('#bookshelfPageLabel')).toHaveText('2 / 3');
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - firstY)).toBeLessThan(20);

  await page.locator('#savedListItems').evaluate(surface => {
    const card = surface.querySelector('.book-card');
    const touch = (x, y) => new Touch({ identifier: 5, target: card, clientX: x, clientY: y });
    const send = (type, x, y) => card.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [touch(x, y)],
      changedTouches: type === 'touchend' ? [touch(x, y)] : [],
    }));
    send('touchstart', 115, 230);
    send('touchmove', 260, 234);
    send('touchend', 260, 234);
  });
  await expect(page.locator('#bookshelfPageLabel')).toHaveText('1 / 3');
  await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - firstY)).toBeLessThan(20);
});
