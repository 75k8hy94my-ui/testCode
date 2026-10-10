import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('profile offers the Shorts queue reset and wires it through the protected state API', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /id="profileShortsResetBtn"/);
  assert.match(spa, /id="profileShortsResetStatus"/);
  assert.match(spa, /const state=window\.MangaReaderVideoShortsState/);
  assert.match(spa, /state\.reset\(/);
  assert.match(spa, /canReadProtectedData\(\)/);
  assert.match(spa, /再生順をリセット/);
});

test('profile loads Shorts state support before mounting its SPA settings view', () => {
  const html = read('profile.html');
  assert.ok(html.indexOf('vault-payload.js') < html.indexOf('video-shorts-state.js'));
  assert.ok(html.indexOf('video-shorts-state.js') < html.indexOf('home-profile-spa.js'));
});
