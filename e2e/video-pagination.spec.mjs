import { test, expect } from '@playwright/test';

test('video list paginates filtered results, animates turns, and supports desktop and mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.locator('#desktopNavVideo').click();
  await expect(page.locator('#videoLibraryApp')).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem('mangaReaderVideos', JSON.stringify(Array.from({ length: 26 }, (_, index) => ({
      id: `pager-${index + 1}`,
      title: `ページ確認動画 ${index + 1}`,
      url: `https://example.test/video/${index + 1}`,
      a: 'example',
      b: String(index + 1),
      addedAt: index + 1,
    }))));
    localStorage.setItem('mangaReaderVideoMeta', '{}');
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  });

  const pager = page.locator('#videoLibraryPagination');
  await expect(page.locator('.vl-card')).toHaveCount(25);
  await expect(pager).toBeVisible();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('1 / 2');
  await expect(page.locator('#videoLibraryPrevPage')).toBeDisabled();
  await expect(page.locator('#videoLibraryNextPage')).toBeEnabled();
  await expect(pager).toHaveCSS('position', 'fixed');
  await expect(pager).toHaveCSS('backdrop-filter', /blur\(30px\)/);
  await page.evaluate(() => {
    window.videoPagerAnimationCount = 0;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      window.videoPagerAnimationCount += 1;
      return animate.apply(this, args);
    };
  });

  await page.locator('#videoLibraryNextPage').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('2 / 2');
  await expect(page.locator('.vl-card')).toHaveCount(1);
  await expect(page.locator('#videoLibraryNextPage')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.videoPagerAnimationCount)).toBe(1);
  await expect(page.locator('.vl-slide-track')).toHaveCount(0);
  await page.locator('#videoLibraryPrevPage').click();
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('1 / 2');
  await expect(page.locator('.vl-card')).toHaveCount(25);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const target = document.querySelector('.vl-open');
    const rect = target.getBoundingClientRect();
    const makeTouch = (x, y) => new Touch({ identifier: 7, target, clientX: x, clientY: y });
    const dispatch = (type, x, y, changed = false) => target.dispatchEvent(new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === 'touchend' ? [] : [makeTouch(x, y)],
      changedTouches: changed ? [makeTouch(x, y)] : [],
    }));
    const x = rect.left + Math.max(100, rect.width / 2);
    const y = rect.top + Math.min(70, rect.height / 2);
    dispatch('touchstart', x, y);
    dispatch('touchmove', x - 120, y);
    dispatch('touchend', x - 120, y, true);
  });
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('2 / 2');
  await expect(page.locator('.vl-card')).toHaveCount(1);

  await expect(page.locator('#videoLibrarySearch')).toBeHidden();
  await page.locator('#mobileNavSearch').click();
  await page.locator('#testcodeContextSearchInput').fill('ページ確認動画 1');
  await expect(page.locator('#videoLibraryCount')).toHaveText('11 / 26件');
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('1 / 1');
  await expect(pager).toBeHidden();

  await page.locator('#testcodeContextSearchInput').fill('no matching video');
  await expect(page.locator('#videoLibraryCount')).toHaveText('0 / 26件');
  await expect(pager).toBeHidden();
  await expect(page.locator('.vl-empty')).toBeVisible();
});

test('remounting and leaving the video list cancel in-flight page animations', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.locator('#desktopNavVideo').click();
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('mangaReaderVideos', JSON.stringify(Array.from({ length: 26 }, (_, index) => ({
      id: `detach-${index}`,
      title: `Video ${index}`,
      url: `https://example.test/video/${index}`,
      addedAt: index + 1,
    }))));
    window.MangaReaderVideoLibrary.refreshFromStorage();
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('vl-slide-track')) {
        animation.pause();
        window.listPageAnimation = animation;
      }
      return animation;
    };
  });

  await page.locator('#videoLibraryNextPage').click();
  await expect.poll(() => page.evaluate(() => window.listPageAnimation?.playState)).toBe('paused');
  await page.evaluate(() => window.HomeProfileSPA.renderRoute());
  await expect.poll(() => page.evaluate(() => window.listPageAnimation?.playState)).toBe('idle');
  await expect(page.locator('#videoLibraryPageLabel')).toHaveText('2 / 2');
  await expect(page.locator('.vl-slide-track')).toHaveCount(0);

  const card = await page.locator('.vl-card').elementHandle();
  await page.evaluate(() => window.HomeProfileSPA.renderRoute());
  await expect(page.locator('.vl-card')).toBeVisible();
  expect(await card.evaluate(node => node === document.querySelector('.vl-card'))).toBe(true);

  await page.locator('#videoLibraryPrevPage').click();
  await expect.poll(() => page.evaluate(() => window.listPageAnimation?.playState)).toBe('paused');
  await page.locator('#desktopNavHome').click();
  await expect(page).toHaveURL(/home\.html$/);
  await expect(page.locator('#videoListSection')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.listPageAnimation?.playState)).toBe('idle');
});
