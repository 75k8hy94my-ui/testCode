import { test, expect } from '@playwright/test';

// Mobile Safari / Chrome both report touch pointers even when landscape
// viewport width exceeds the desktop breakpoint.
test.use({ isMobile: true, hasTouch: true });

async function openGuestReader(page) {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.route('https://reader-fixture.example/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body style="margin:0;background:#eee">Embed fixture</body></html>',
  }));
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/home\.html$/);
  await page.evaluate(() => {
    localStorage.setItem('mangaReaderSavedItems', JSON.stringify([{
      id: 'mobile-safe-fixture', title: 'Mobile safe mode fixture',
      url: 'https://reader-fixture.example/work.html#1',
    }]));
  });
  await page.goto('reader.html?item=mobile-safe-fixture');
  await expect(page.locator('#pageStage iframe')).toBeAttached();
  await expect(page.locator('#safeModeBtn')).toBeVisible();
}

async function assertMobileTopbar(page) {
  const bounds = await page.locator('#topbar').evaluate(node => {
    const rect = node.getBoundingClientRect();
    const primary = node.querySelector('.readerHeaderPrimary').getBoundingClientRect();
    const secondary = node.querySelector('.readerHeaderSecondary').getBoundingClientRect();
    const safe = node.querySelector('#safeModeBtn').getBoundingClientRect();
    return {
      x: rect.x, y: rect.y, width: rect.width, viewport: innerWidth,
      position: getComputedStyle(node).position,
      transform: getComputedStyle(node).transform,
      primaryBottom: primary.bottom, secondaryTop: secondary.top,
      safeX: safe.x, safeRight: safe.right, safeTop: safe.top,
    };
  });
  expect(bounds.position).toBe('fixed');
  expect(bounds.transform).toBe('none');
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.x).toBeLessThanOrEqual(1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeLessThanOrEqual(1);
  expect(bounds.width).toBeGreaterThan(bounds.viewport - 3);
  expect(bounds.safeX).toBeGreaterThanOrEqual(0);
  expect(bounds.safeRight).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.safeTop).toBeLessThan(100);
  expect(bounds.primaryBottom).toBeLessThanOrEqual(bounds.secondaryTop + 2);
}

test('portrait phone keeps header at the top and safe mode can be switched ON/OFF by touch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGuestReader(page);
  await assertMobileTopbar(page);

  const safe = page.locator('#safeModeBtn');
  await safe.tap();
  await expect(page.locator('body')).toHaveClass(/safe-mode/);
  await expect(safe).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#viewer').evaluate(node => getComputedStyle(node, '::after').content)).not.toBe('none');

  await safe.tap();
  await expect(page.locator('body')).not.toHaveClass(/safe-mode/);
  await expect(safe).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('#viewer').evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
  expect(await page.evaluate(() => localStorage.getItem('mangaReaderSafeMode'))).toBe('0');

  await safe.tap();
  await safe.tap();
  await expect(page.locator('body')).not.toHaveClass(/safe-mode/);
});

test('landscape touch viewport keeps the header top-aligned instead of desktop centered', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openGuestReader(page);
  await assertMobileTopbar(page);
  const safe = page.locator('#safeModeBtn');
  await safe.tap();
  await expect(page.locator('body')).toHaveClass(/safe-mode/);
  await safe.tap();
  await expect(page.locator('body')).not.toHaveClass(/safe-mode/);
});
