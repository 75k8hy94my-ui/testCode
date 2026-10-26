import { test, expect } from '@playwright/test';

async function openGuestLibrary(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.locator('#desktopNavVideo').click();
  await expect(page.locator('#videoLibraryApp')).toBeVisible();
  await page.evaluate(() => {
    const makeVideo = (id, title, addedAt) => ({
      id, title, addedAt, a: 'url', b: id, url: 'https://example.test/video/' + id + '.mp4',
    });
    localStorage.setItem('mangaReaderVideos', JSON.stringify([
      makeVideo('regular-video', '通常の動画', 3),
      makeVideo('hidden-video', '秘密検索語の動画', 2),
      makeVideo('other-video', '別の通常動画', 1),
    ]));
    localStorage.setItem('mangaReaderVideoMeta', JSON.stringify({ 'hidden-video': { hidden: true } }));
    localStorage.setItem('mangaReaderVideoFolders', '[]');
    window.MangaReaderVideoLibrary.init(window.MangaReaderMediaAccess);
  });
  await expect(page.locator('#videoLibraryCount')).toHaveText('2 / 2件');
}

test('hidden videos are excluded from ordinary search but included in hidden-list search', async ({ page }) => {
  await openGuestLibrary(page);
  await page.evaluate(() => window.TestCodeContextSearch.open());
  await page.locator('#testcodeContextSearchInput').fill('秘密検索語');
  await expect(page.locator('#videoLibraryCount')).toHaveText('0 / 2件');
  await expect(page.locator('.vl-card[data-video-id="hidden-video"]')).toHaveCount(0);
  await page.evaluate(() => window.TestCodeContextSearch.close());

  await page.locator('#videoLibraryHidden').click();
  await expect(page.locator('#videoLibraryCount')).toHaveText('1 / 1件');
  await page.evaluate(() => window.TestCodeContextSearch.open());
  await page.locator('#testcodeContextSearchInput').fill('秘密検索語');
  await expect(page.locator('.vl-card[data-video-id="hidden-video"]')).toBeVisible();
  await page.locator('#testcodeContextSearchInput').fill('通常の動画');
  await expect(page.locator('#videoLibraryCount')).toHaveText('0 / 1件');
});

test('returning from a hidden video does not switch the list into the hidden folder', async ({ page }) => {
  await openGuestLibrary(page);
  await page.locator('.vl-card[data-video-id="regular-video"] .vl-open').first().click();
  await expect(page).toHaveURL(/video-player\.html\?id=regular-video/);
  await page.getByRole('link', { name: '詳細を編集' }).click();
  await expect(page).toHaveURL(/video-edit\.html\?id=regular-video/);
  await page.locator('.videoEditForm input[name="hidden"]').check();
  await expect.poll(async () => page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('mangaReaderVideoMeta') || '{}');
    return meta['regular-video']?.hidden;
  })).toBe(true);
  await page.getByRole('link', { name: '戻る' }).click();
  await expect(page).toHaveURL(/video-player\.html\?id=regular-video/);

  await expect(page.locator('#shellTitle a')).not.toHaveAttribute('href', /returnVideo=/);
  await page.locator('#desktopNavVideo').click();
  await expect(page.locator('#videoLibraryHidden')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#videoLibraryCount')).toHaveText('1 / 1件');
  await expect(page.locator('.vl-card[data-video-id="other-video"]')).toBeVisible();
  await expect(page.locator('.vl-card[data-video-id="regular-video"]')).toHaveCount(0);

  // The same rule applies to a video explicitly opened in the hidden list.
  await page.locator('#videoLibraryHidden').click();
  await page.locator('.vl-card[data-video-id="hidden-video"] .vl-open').first().click();
  await expect(page.locator('#shellTitle a')).not.toHaveAttribute('href', /returnVideo=/);
  await page.locator('#shellTitle a').click();
  await expect(page.locator('#videoLibraryHidden')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.vl-card[data-video-id="other-video"]')).toBeVisible();
});

test('IME conversion Enter does not save a video title while editing', async ({ page }) => {
  await openGuestLibrary(page);
  await page.locator('.vl-card[data-video-id="regular-video"] .vl-open').first().click();
  const heading = page.locator('.videoPlayerTitle');
  await heading.click();
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await page.evaluate(() => {
    const heading = document.querySelector('.videoPlayerTitle');
    heading.textContent = '日本語';
    heading.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true }));
    heading.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    heading.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await expect(heading).toHaveAttribute('contenteditable', 'true');
  await heading.focus();
  await page.evaluate(() => {
    const heading = document.querySelector('.videoPlayerTitle');
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText('タイトル');
  // The next deliberate Enter is a separate keystroke from IME confirmation.
  await page.waitForTimeout(30);
  await page.keyboard.press('Enter');
  await expect(heading).toHaveAttribute('contenteditable', 'false');
  await expect(heading).toHaveText('日本語タイトル');
});
