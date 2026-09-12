import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('global chrome does not fetch-replace pages or intercept SPA family clicks', () => {
  const shell = read('app-global-shell.js');
  assert.match(shell, /window\.AppShell\s*=/);
  assert.match(shell, /SPA_PAGES/);
  assert.match(shell, /if \(isSpaPage\(\)\) return;/);
  assert.doesNotMatch(shell, /function loadRoute/);
  assert.doesNotMatch(shell, /fetch\(url\.href/);
  assert.doesNotMatch(shell, /addEventListener\('click', intercept\)/);
});

test('home-family pages share one History API controller', () => {
  const spa = read('home-profile-spa.js');
  const shell = read('app-global-shell.js');
  for (const page of ['home.html', 'profile.html', 'index-search.html', 'hyakusen.html', 'links.html']) {
    assert.match(shell, new RegExp(`['"]${page}['"]`));
    assert.match(read(page), /home-profile-spa\.js/);
    assert.match(read(page), /class=["']homeHeader["']/);
  }
  assert.match(spa, /history\.pushState/);
  assert.match(spa, /addEventListener\('click',intercept\)/);
  assert.match(spa, /function renderProfile/);
  assert.match(spa, /id="profileLogoutBtn"/);
  assert.match(spa, /id="profileThemeLight"/);
  assert.match(spa, /保管庫を開く/);
});

test('static verifier covers the shared shell and profile entry', () => {
  const verifier = read('scripts/check-static.mjs');
  for (const file of ['profile.html', 'home-profile-spa.js', 'profile-menu.js', 'video-library.js', 'media-access-gate.js']) {
    assert.match(verifier, new RegExp(`['"]${file}['"]`));
  }
});
