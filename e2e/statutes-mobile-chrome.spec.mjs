import { test, expect } from '@playwright/test';

async function openGuestStatutes(page, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await page.goto('statutes.html?section=civil-general');
  await expect(page.locator('#statutesCurrentSection')).toHaveText('民法総則');
}

async function readingAreaGap(page) {
  return page.evaluate(() => {
    const header = document.querySelector('#appGlobalHeader').getBoundingClientRect();
    const content = document.querySelector('#routeContent').getBoundingClientRect();
    const dock = document.querySelector('#statutesLawDock').getBoundingClientRect();
    return {
      top: content.top - header.bottom,
      bottom: dock.top - content.bottom,
      viewportOverflow: Math.max(0, content.right - window.innerWidth),
    };
  });
}

test('mobile app navigation sits inside the same header band as the statute controls', async ({ page }) => {
  await openGuestStatutes(page, 320, 720);
  for (const width of [320, 375, 390, 480, 620, 899]) {
    await page.setViewportSize({ width, height: 780 });
    await expect.poll(() => page.evaluate(() => {
      const header = document.getElementById('appGlobalHeader');
      const nav = document.getElementById('mobileBottomNav');
      return nav?.parentElement === header;
    })).toBe(true);

    const layout = await page.evaluate(() => {
      const header = document.getElementById('appGlobalHeader');
      const nav = document.getElementById('mobileBottomNav');
      const title = document.getElementById('statutesCurrentSection');
      const edit = document.querySelector('.statutesModeSwitch');
      const search = document.getElementById('statutesSearchToggle');
      const h = header.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      const t = title.getBoundingClientRect();
      const actions = [title, edit, search].map(node => node.getBoundingClientRect());
      const items = [...nav.querySelectorAll('[data-mobile-route]')].map(node => node.getBoundingClientRect());
      const columns = getComputedStyle(nav).gridTemplateColumns.split(' ').map(Number.parseFloat);
      return {
        headerTop:h.top,
        navWithinHeader:n.left >= h.left && n.right <= h.right && n.top >= h.top && n.bottom <= h.bottom,
        navAboveTitle:n.bottom <= t.top,
        actionsInsideHeader:actions.every(rect => rect.top >= h.top && rect.bottom <= h.bottom),
        itemsFit:items.length === 6 && items.every(rect => rect.left >= n.left && rect.right <= n.right),
        sixEqualColumns:columns.length === 6 && columns.every(value => Math.abs(value - columns[0]) < 1),
        horizontalOverflow:document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(layout).toMatchObject({
      headerTop:0,
      navWithinHeader:true,
      navAboveTitle:true,
      actionsInsideHeader:true,
      itemsFit:true,
      sixEqualColumns:true,
      horizontalOverflow:false,
    });
    await expect.poll(async () => (await readingAreaGap(page)).top).toBeGreaterThanOrEqual(10);
    await expect(page.locator('#statutesSearchToggle')).toBeVisible();
    await expect(page.locator('.statutesModeSwitch')).toBeVisible();
  }

  // Restoring desktop width puts the hidden mobile nav back in its old parent.
  await page.setViewportSize({ width:1024, height:768 });
  await expect.poll(() => page.evaluate(() =>
    document.getElementById('mobileBottomNav')?.parentElement === document.getElementById('homeApp')
  )).toBe(true);
  await expect(page.locator('#mobileBottomNav')).toBeHidden();
});

test('small-phone toolbar stays above text even when sync controls wrap', async ({ page }) => {
  await openGuestStatutes(page, 320, 720);
  await expect.poll(async () => (await readingAreaGap(page)).top).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => (await readingAreaGap(page)).bottom).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => (await readingAreaGap(page)).viewportOverflow).toBe(0);
  await expect(page.locator('.statutesModeSwitch')).toBeVisible();
  await expect(page.locator('#statutesLawMenu')).toBeVisible();

  // Simulate additional sync actions appearing after a connection conflict.
  await page.evaluate(() => {
    const header = document.querySelector('#appGlobalHeader');
    for (const label of ['クラウドを採用', 'この端末を採用']) {
      const button = document.createElement('button');
      button.textContent = label;
      button.className = 'mobile-test-sync-control';
      header.append(button);
    }
  });
  await expect.poll(async () => (await readingAreaGap(page)).top).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => (await readingAreaGap(page)).viewportOverflow).toBe(0);
});

test('mobile definition and reference panes do not overlap the bottom law dock', async ({ page }) => {
  await openGuestStatutes(page, 390, 844);
  const grip = page.locator('.statutesPhoneResize');
  await page.evaluate(() => {
    document.documentElement.classList.add('statutes-definition-open');
    // A real editor opening also removes inert; merely toggling the CSS class
    // leaves the divider unable to receive pointer events.
    document.querySelector('#statutesDefinitionSide').inert = false;
  });
  await expect(grip).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const header = document.querySelector('#appGlobalHeader').getBoundingClientRect();
    const statute = document.querySelector('#routeContent').getBoundingClientRect();
    const side = document.querySelector('#statutesDefinitionSide').getBoundingClientRect();
    const dock = document.querySelector('#statutesLawDock').getBoundingClientRect();
    return statute.top >= header.bottom + 8 && side.top >= statute.bottom - 2 && side.bottom <= dock.top - 8;
  })).toBe(true);

  await page.evaluate(() => document.documentElement.classList.add('statutes-split-open'));
  await expect(page.locator('#statutesSplitPanel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const side = document.querySelector('#statutesDefinitionSide').getBoundingClientRect();
    const split = document.querySelector('#statutesSplitPanel').getBoundingClientRect();
    const dock = document.querySelector('#statutesLawDock').getBoundingClientRect();
    return side.bottom <= split.top + 2 && split.bottom <= dock.top - 8;
  })).toBe(true);
});

test('dragging the phone divider uses the actual top toolbar height', async ({ page }) => {
  await openGuestStatutes(page, 390, 844);
  await page.evaluate(() => {
    document.documentElement.classList.add('statutes-definition-open');
    // A real editor opening also removes inert; merely toggling the CSS class
    // leaves the divider unable to receive pointer events.
    document.querySelector('#statutesDefinitionSide').inert = false;
  });
  const grip = page.locator('.statutesPhoneResize');
  await expect(grip).toBeVisible();
  const initial = await page.locator('#routeContent').boundingBox();
  const side = await page.locator('#statutesDefinitionSide').boundingBox();
  const start = await grip.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, side.y + side.height * .65, { steps: 5 });
  await page.mouse.up();
  const resized = await page.locator('#routeContent').boundingBox();
  expect(resized.height).toBeGreaterThan(initial.height + 30);
});
