import { test, expect } from '@playwright/test';

test('offline statute corpus displays labor law article captions after navigation and reload', async ({ page }) => {
  const corpusRequests = [];
  const unexpectedExternalLawRequests = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/statutes-data/labor-standards.json')) corpusRequests.push(url);
    if (/laws\.e-gov\.go\.jp\/api\//.test(url)) unexpectedExternalLawRequests.push(url);
  });
  await page.route(/supabase\.co|\/auth\/v1\/|\/rest\/v1\//i, route => route.abort());
  await page.goto('index.html');
  await page.getByRole('button', { name: 'ログインせずに使う' }).click();
  await expect(page).toHaveURL(/home\.html$/);

  await page.goto('statutes.html?section=labor-standards');
  await expect(page.locator('#statutesCurrentSection')).toHaveText('労働基準法');
  const card = number => page.locator('.statuteCard').filter({
    has: page.locator('.statuteNumber', { hasText: new RegExp('^' + number + '$') }),
  });
  await expect(card('９条').locator('.statuteHeading')).toHaveText('定義');
  await expect(card('１０条').locator('.statuteHeading')).toHaveText('定義');
  await expect(card('３２条').locator('.statuteHeading')).toHaveText('労働時間');

  await page.reload();
  await expect(card('９条').locator('.statuteHeading')).toHaveText('定義');
  await expect(card('３２条').locator('.statuteHeading')).toHaveText('労働時間');
  expect(corpusRequests.length).toBeGreaterThan(0);
  expect(corpusRequests.every(url => new URL(url).searchParams.has('v'))).toBe(true);
  expect(unexpectedExternalLawRequests).toEqual([]);
});
