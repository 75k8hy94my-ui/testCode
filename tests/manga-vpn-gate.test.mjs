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
  assert.match(spa, /dataset\.vpnStatusButton='1'/);
  assert.match(spa, /dataset\.vpnRecheckButton='1'/);
  assert.match(spa, /dataset\.vpnDiagnosticsButton='1'/);
  assert.match(spa, /className='glassBtn vpnDiagnosticsButton'/);
  assert.doesNotMatch(spa.slice(spa.indexOf('function renderVpnGate'), spa.indexOf('async function ensureVpnGate')), /button\.dataset\.vpnStatusButton='1'.*button\.dataset\.vpnDiagnosticsButton='1'/s);
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

test('manga, video and reader list surfaces expose separate VPN recheck and diagnostics controls', () => {
  const mangaRoute = read('manga-list-route.js');
  const videoTemplate = read('video-list-template.js');
  const readerTemplate = read('reader-saved-list-template.js');
  for (const source of [mangaRoute, videoTemplate, readerTemplate]) {
    assert.match(source, /vpnRecheckButton|data-vpn-recheck-button|vpnRecheckButton/);
    assert.match(source, /vpnDiagnosticsButton|data-vpn-diagnostics-button/);
    assert.match(source, /vpnStatusButton|data-vpn-status-button/);
  }
  assert.doesNotMatch(read('manga-list-template.js'), /data-vpn-header="manga-list"/);
  assert.doesNotMatch(videoTemplate, /data-vpn-status-button\s+data-vpn-diagnostics-button/);
  assert.doesNotMatch(readerTemplate, /data-vpn-status-button\s+data-vpn-diagnostics-button/);
});

test('late-mounted VPN controls resync to the current verdict', () => {
  assert.match(read('media-access-gate.js'), /syncUi:\s*\(\) => updateStatusButtons\(status\)/);
  assert.match(read('manga-list-route.js'), /MangaReaderMediaAccess\.syncUi\(\)/);
  assert.match(read('reader-saved-list-template.js'), /MangaReaderMediaAccess\.syncUi\(\)/);
  assert.match(spa, /gate\.syncUi\(\)/);
});
