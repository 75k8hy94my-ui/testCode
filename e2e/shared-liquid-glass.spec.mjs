import { test, expect } from '@playwright/test';

async function loadMaterialFixture(page) {
  // No authentication, network content or protected manga bytes are involved.
  await page.goto('/robots.txt');
  await page.setContent(`<!doctype html>
    <html lang="ja" data-theme="dark"><head><meta charset="utf-8"></head>
    <body style="margin:0;min-height:100vh;background:linear-gradient(90deg,#304d85,#e6a875)">
      <main id="readerApp">
        <header id="topbar" style="position:absolute;top:20px;left:30px;width:500px;height:62px;border-radius:24px">
          <button class="ctrlBtn" type="button">閉じる</button>
        </header>
        <section id="viewer"><div id="pageStage">UNCHANGED_READER_STAGE</div></section>
        <nav id="controls" style="position:absolute;top:100px;left:30px;width:470px;height:62px;border-radius:24px">
          <button class="ctrlBtn" type="button">前のページ</button>
          <input id="pageSlider" type="range"><span id="pageLabel">1 / 1</span>
        </nav>
      </main>
      <nav id="mobileBottomNav" class="liquidGlassNav" style="position:fixed;bottom:10px;left:10px;width:360px;height:62px;border-radius:30px">
        <div class="liquidGlassSelection" style="position:absolute;top:8px;left:7px;width:62px;height:46px;border-radius:22px"></div>
      </nav>
    </body></html>`);
  await page.addStyleTag({ url: '/liquid-glass.css' });
  await page.addScriptTag({ url: '/liquid-glass-engine.js' });
}

test('one shared optical system styles Reader and mobile navigation with no image-stage writes', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await loadMaterialFixture(page);
  for (const selector of ['#readerApp #topbar', '#readerApp #controls', '#readerApp .ctrlBtn', '#mobileBottomNav', '.liquidGlassSelection']) {
    await expect(page.locator(selector)).toHaveClass(/lg-surface/);
  }
  await expect(page.locator('#pageStage')).toHaveText('UNCHANGED_READER_STAGE');

  const panel = await page.locator('#mobileBottomNav').evaluate((node) => ({
    background: getComputedStyle(node).backgroundImage,
    filter: getComputedStyle(node).backdropFilter || getComputedStyle(node).webkitBackdropFilter,
    rim: getComputedStyle(node, '::after').backgroundImage
  }));
  expect(panel.background).toContain('gradient');
  expect(panel.filter).not.toBe('none');
  expect(panel.rim).toContain('gradient');

  await page.evaluate(() => {
    const menu = document.createElement('div');
    menu.id = 'mobileUtilityMenu';
    menu.style.cssText = 'position:fixed;bottom:85px;right:16px;width:180px;height:120px;border-radius:20px';
    document.body.append(menu);
  });
  await expect(page.locator('#mobileUtilityMenu')).toHaveClass(/lg-surface/);

  await page.evaluate(() => window.TestCodeLiquidGlass.destroy());
  await expect(page.locator('#mobileBottomNav')).not.toHaveClass(/lg-surface/);
});

test('mobile-sized material retains interactive lens and shared Safari-safe fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadMaterialFixture(page);
  await expect(page.locator('#mobileBottomNav')).toHaveClass(/lg-surface/);
  await expect(page.locator('#mobileBottomNav .liquidGlassSelection')).toHaveClass(/lg-surface/);
  await page.locator('#mobileBottomNav').hover({ force: true });
  const coords = await page.locator('#mobileBottomNav').evaluate((node) => ({
    x: node.style.getPropertyValue('--lg-light-x'),
    y: node.style.getPropertyValue('--lg-light-y')
  }));
  expect(coords.x).toMatch(/%$/);
  expect(coords.y).toMatch(/%$/);
});
