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
  await expect(page.locator('.statutesModeSwitch')).toBeVisible();
  await expect(page.locator('#statutesCardsOpen')).toHaveCount(0);
  await expect(page.locator('.statutesDefinitionCardCheckbox')).toHaveCount(0);
});

test('mobile Home gives access to a standalone cards page', async ({ page }) => {
  await enterGuest(page);
  const link = page.locator('.homeCardLink[href="definition-cards.html"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/definition-cards\.html$/);
  await expect(page.locator('#definitionCardsEmpty')).toBeVisible();
  await page.getByRole('link', { name:'逐条集へ' }).click();
  await expect(page).toHaveURL(/statutes\.html$/);
});

test('the whole article can be saved as the statutory definition of 親族', async ({ page }) => {
  await enterGuest(page);
  await page.goto('statutes.html?section=civil-family');
  const card = page.locator('.statuteCard').filter({ has: page.locator('.statuteNumber', { hasText: '７２５条' }) }).first();
  await expect(card).toBeVisible();
  await page.locator('.statutesModeSwitch').click();
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.statuteCard'))
      .find(c => c.querySelector('.statuteNumber')?.textContent.trim() === '７２５条');
    const span = card.querySelector('.statuteSelectable');
    const node = span.firstChild;
    const start = node.textContent.indexOf('親族');
    if (start < 0) throw new Error('Could not select 親族 in Article 725');
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 2);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const popup = page.locator('#statuteSelectionPopup');
  await expect(popup).toHaveAttribute('data-visible', 'true');
  await popup.click();
  const form = page.locator('.statutesDefinitionForm');
  await form.locator('.statutesDefinitionStatuteToggle').check();
  await expect(form.locator('textarea')).toBeHidden();
  await expect(form.locator('.statutesDefinitionStatutePreview')).toContainText('三親等内の姻族');
  await form.getByRole('button', { name: '保存' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('testCode.statutes.definitions.v1')));
  expect(saved).toHaveLength(1);
  expect(saved[0].definitionKind).toBe('statute');
  expect(saved[0].quote).toBe('親族');
  expect(saved[0].definition).toContain('三親等内の姻族');
  await page.goto('definition-cards.html');
  await expect(page.locator('#definitionCardsTerm')).toHaveText('親族');
  await expect(page.locator('#definitionCardsSource')).toContainText('条文による定義');
  await page.locator('#definitionCardsFlip').click();
  await expect(page.locator('#definitionCardsAnswer')).toContainText('三親等内の姻族');
});
