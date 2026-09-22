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
  for (const page of ['home.html', 'profile.html', 'manga.html', 'video.html']) {
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

test('mobile home shell provides navigation to profile and other pages', () => {
  const spa = fs.readFileSync(new URL('../home-profile-spa.js', import.meta.url), 'utf8');
  assert.match(spa, /mobileBottomNav/);
  assert.match(spa, /profile\.html/);
  assert.match(spa, /manga\.html/);
});

test('static verifier covers the shared shell and profile entry', () => {
  const verifier = read('scripts/check-static.mjs');
  for (const file of ['profile.html', 'home-profile-spa.js', 'profile-menu.js', 'video-library.js', 'media-access-gate.js']) {
    assert.match(verifier, new RegExp(`['"]${file}['"]`));
  }
});

test('mobile bottom navigation stays visible on manga and video routes', () => {
  const css = read('home-profile-shell.css');
  assert.doesNotMatch(css, /html\.reader-entry-manga #mobileBottomNav,html\.reader-entry-video #mobileBottomNav[^{}]*\{display:none!important\}/);
  assert.match(css, /@media\(max-width:899px\)\{html\.reader-entry-manga #mobileBottomNav,html\.reader-entry-video #mobileBottomNav\{display:flex!important\}\}/);
  for (const page of ['manga.html', 'video.html']) {
    assert.match(read(page), /home-profile-shell\.css\?v=20260922-mobile-route-nav/);
  }
});
