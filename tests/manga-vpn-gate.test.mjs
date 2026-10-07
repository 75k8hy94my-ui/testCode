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

test('manga and video route shells mount regardless of VPN verdict', () => {
  assert.match(spa, /function renderVpnGate\(/);
  assert.match(spa, /dataset\.vpnStatusButton='1'/);
  assert.match(spa, /dataset\.vpnRecheckButton='1'/);
  assert.match(spa, /dataset\.vpnDiagnosticsButton='1'/);
  assert.match(spa, /className='glassBtn vpnDiagnosticsButton'/);
  assert.doesNotMatch(spa.slice(spa.indexOf('function renderVpnGate'), spa.indexOf('async function ensureVpnGate')), /button\.dataset\.vpnStatusButton='1'.*button\.dataset\.vpnDiagnosticsButton='1'/s);
  const mangaRoute = spa.slice(spa.indexOf('async function renderManga'), spa.indexOf('let lastVpnRouteStatus'));
  const videoRoute = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.match(mangaRoute, /MangaListRouteFactory\.create/);
  assert.match(videoRoute, /VideoListRouteFactory\.create/);
  assert.doesNotMatch(mangaRoute, /gate\.getStatus\(\)==='pending'\|\|gate\.getStatus\(\)==='checking'|!gate\.canLoadExternalMedia\(\)/);
  assert.doesNotMatch(videoRoute, /gate\.getStatus\(\)==='pending'\|\|gate\.getStatus\(\)==='checking'|!gate\.canLoadExternalMedia\(\)/);
  assert.match(spa, /manga-reader-vpn-status/);
  assert.match(mangaRoute, /MangaReaderMediaAccess\.syncUi|gate\.syncUi/);
});

test('VPN status changes refresh a mounted manga or video shell', () => {
  assert.match(spa, /document\.addEventListener\('manga-reader-vpn-status',handleVpnStatusChange\)/);
  assert.match(spa, /if\(route!=='manga'&&route!=='video'\)return/);
  assert.match(spa, /next==='pending'\|\|next==='checking'[\s\S]*lastVpnRouteAccess!==route\+':allowed'/);
  assert.match(spa, /if\(marker===lastVpnRouteAccess\)return/);
  assert.match(spa, /renderRoute\(\)/);
});

test('bookshelf scripts are fetched concurrently with ordered classic-script execution', () => {
  const route = read('manga-list-route.js');
  assert.match(route, /script\.async = false/);
  assert.match(route, /Promise\.all\(SCRIPT_URLS\.map\(\(\[src, id\]\) => loadScript\(src, id, documentRef\)\)\)/);
});

test('VPN gate exposes status changes without changing its verdict contract', () => {
  assert.match(gate, /function emitStatus\(\)/);
  assert.match(gate, /manga-reader-vpn-status/);
  assert.match(gate, /getStatus/);
  assert.match(gate, /applyFinalStatus\(allowed\)/);
  assert.match(gate, /setAllowedForTesting\(allowed\)/);
  assert.match(gate, /canReadProtectedData/);
});

test('standalone bookshelf CSS covers the primary manga surfaces', () => {
  const css = read('manga-list.css');
  for (const selector of ['book-card', 'book-cover', 'folder-card', 'listToolbar', 'smartListRow', 'filter-row', 'bookshelf-pagination']) {
    assert.match(css, new RegExp(`\\.${selector}|#${selector}`), selector);
  }
});

test('bookshelf and video surfaces expose separate VPN recheck and diagnostics controls', () => {
  const mangaRoute = read('manga-list-route.js');
  const videoTemplate = read('video-list-template.js');
  for (const source of [mangaRoute, videoTemplate]) {
    assert.match(source, /vpnRecheckButton|data-vpn-recheck-button|vpnRecheckButton/);
    assert.match(source, /vpnDiagnosticsButton|data-vpn-diagnostics-button/);
    assert.match(source, /vpnStatusButton|data-vpn-status-button/);
  }
  assert.doesNotMatch(read('manga-list-template.js'), /data-vpn-header="manga-list"/);
  assert.doesNotMatch(videoTemplate, /data-vpn-status-button\s+data-vpn-diagnostics-button/);
});

test('late-mounted VPN controls resync to the current verdict', () => {
  assert.match(read('media-access-gate.js'), /syncUi:\s*\(\) => updateStatusButtons\(status\)/);
  assert.match(read('manga-list-route.js'), /MangaReaderMediaAccess\.syncUi\(\)/);
  assert.match(spa, /gate\.syncUi\(\)/);
});

test('VPN blocked gate uses high-contrast text and actions', () => {
  const css = read('home-profile-shell.css');
  assert.match(css, /\.vpnRouteGate h2[\s\S]*color:#f8fafc/);
  assert.match(css, /\.vpnRouteGate \.profileLead[\s\S]*color:#b8c2d1/);
  assert.match(css, /vpnStatusButton\[data-vpn-state="blocked"\][\s\S]*background:#35191d[\s\S]*color:#ffb4b4/);
});
