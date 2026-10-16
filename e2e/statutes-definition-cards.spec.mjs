import { test, expect } from '@playwright/test';

async function enterGuest(page) {
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/home\.html$/);
}

test('desktop home menu opens cards and migrates unchecked definitions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await enterGuest(page);
  await page.evaluate(() => localStorage.setItem('testCode.statutes.definitions.v1', JSON.stringify([{
    subject:'civil-general', article:'１条', part:0, start:0, end:2,
    quote:'私権', definition:'私法上の権利', card:false
  }])));
  await page.locator('#desktopNavDefinitionCards').click();
  await expect(page).toHaveURL(/definition-cards\.html$/);
  await expect(page.locator('#definitionCardsTerm')).toHaveText('私権');
  await expect(page.locator('#definitionCardsSource')).toHaveText('民法１条');
  await expect(page.locator('#definitionCardsAnswer')).toBeHidden();
  await page.getByRole('button', { name: '答えを見る' }).click();
  await expect(page.locator('#definitionCardsAnswer')).toHaveText('私法上の権利');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('testCode.statutes.definitions.v1'))[0].card)).toBe(true);
  await page.goto('statutes.html');
  await expect(page.locator('#statutesEditToggle')).toBeVisible();
  await expect(page.locator('#statutesCardsOpen')).toHaveCount(0);
  await expect(page.locator('.statutesDefinitionCardCheckbox')).toHaveCount(0);
});

test('mobile Home gives access to a standalone cards page', async ({ page }) => {
  await enterGuest(page);
  const link = page.getByRole('navigation', { name:'学習メニュー' }).getByRole('link', { name:'定義カード' });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/definition-cards\.html$/);
  await expect(page.locator('#definitionCardsEmpty')).toBeVisible();
  await page.getByRole('link', { name:'逐条集へ' }).click();
  await expect(page).toHaveURL(/statutes\.html$/);
});
