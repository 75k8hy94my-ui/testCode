import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const manga = read('manga.html');
const sandbox = read('manga-sandbox.html');
const spa = read('home-profile-spa.js');
const gate = read('media-access-gate.js');

test('manga shells load the standalone bookshelf stylesheet', () => {
  assert.match(manga, /manga-list\.css\?v=/);
  assert.match(sandbox, /manga-list\.css\?v=/);
});

test('manga and video routes wait for an allowed VPN verdict before starting list runtimes', () => {
  assert.match(spa, /function renderVpnGate\(/);
  assert.match(spa, /canLoadExternalMedia\(\)/);
  assert.match(spa, /if\(!gate\|\|!gate\.canLoadExternalMedia\(\)\)\{renderVpnGate/);
  const mangaRoute = spa.slice(spa.indexOf('async function renderManga'), spa.indexOf('async function renderReader'));
  const videoRoute = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.ok(mangaRoute.indexOf('canLoadExternalMedia') < mangaRoute.indexOf('MangaListRouteFactory.create'));
  assert.ok(videoRoute.indexOf('canLoadExternalMedia') < videoRoute.indexOf('VideoListRouteFactory.create'));
  assert.doesNotMatch(mangaRoute.slice(0, mangaRoute.indexOf('MangaListRouteFactory.create')), /savedListItems|book-card|renderSavedList/);
  assert.doesNotMatch(videoRoute.slice(0, videoRoute.indexOf('VideoListRouteFactory.create')), /savedListItems|book-card|renderVideoList/);
  assert.match(spa, /manga-reader-vpn-status/);
});

test('VPN gate exposes status changes without changing its verdict contract', () => {
  assert.match(gate, /function emitStatus\(\)/);
  assert.match(gate, /manga-reader-vpn-status/);
  assert.match(gate, /getStatus/);
  assert.match(gate, /applyFinalStatus\(allowed\)/);
  assert.match(gate, /setAllowedForTesting\(allowed\)/);
});

test('standalone bookshelf CSS covers the primary manga surfaces', () => {
  const css = read('manga-list.css');
  for (const selector of ['book-card', 'book-cover', 'folder-card', 'listToolbar', 'smartListRow', 'filter-row', 'bookshelf-pagination']) {
    assert.match(css, new RegExp(`\\.${selector}|#${selector}`), selector);
  }
});
