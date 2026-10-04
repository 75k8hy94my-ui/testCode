import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const manga = read('manga.html');
const sandbox = read('manga-sandbox.html');
const spa = read('home-profile-spa.js');
const gate = read('media-access-gate.js');
const route = read('manga-list-route.js');
const dependencies = read('manga-list-dependency-loader.js');

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
  const mangaRoute = spa.slice(spa.indexOf('async function renderManga'), spa.indexOf('let lastVpnRouteStatus'));
  const videoRoute = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.ok(mangaRoute.indexOf('canLoadExternalMedia') < mangaRoute.indexOf('MangaListRouteFactory.create'));
  assert.ok(mangaRoute.indexOf('manga-list-dependency-loader.js') < mangaRoute.indexOf('ensureVpnGate()'));
  assert.ok(videoRoute.indexOf('canLoadExternalMedia') < videoRoute.indexOf('VideoListRouteFactory.create'));
  assert.doesNotMatch(mangaRoute.slice(0, mangaRoute.indexOf('MangaListRouteFactory.create')), /savedListItems|book-card|renderSavedList/);
  assert.doesNotMatch(videoRoute.slice(0, videoRoute.indexOf('VideoListRouteFactory.create')), /savedListItems|book-card|renderVideoList/);
  assert.match(spa, /manga-reader-vpn-status/);
});

test('same-origin shelf code preloads during VPN checking without running or exposing shelf data', () => {
  assert.ok(manga.indexOf('manga-list-dependency-loader.js') < manga.indexOf('media-access-gate.js'));
  const spaMangaRoute = spa.slice(spa.indexOf('async function renderManga'), spa.indexOf('let lastVpnRouteStatus'));
  assert.ok(spaMangaRoute.indexOf('manga-list-dependency-loader.js') < spaMangaRoute.indexOf('ensureVpnGate()'));
  assert.ok(spaMangaRoute.indexOf('canLoadExternalMedia') < spaMangaRoute.indexOf('MangaListRouteFactory.create'));
  assert.match(dependencies, /link\.rel = 'preload'/);
  assert.match(dependencies, /link\.as = 'script'/);
  assert.doesNotMatch(dependencies, /localStorage|fetch\(|MangaVault|HTMLImageElement|encrypted-asset-import\.js.*CORE/);
  assert.match(route, /dependencyLoader\.loadCore\(\)/);
  assert.ok(route.indexOf('dependencyLoader.loadCore()') > route.indexOf('async function start(input)'));
  assert.match(gate, /performance\?\.mark\?\.\('manga:vpn-allowed'\)/);
});

test('encrypted image import dependencies are lazy and loaded once from individual add', () => {
  const importNames = [
    'image-transfer-settings.js', 'image-remote-access.js', 'encrypted-asset-crypto.js',
    'encrypted-asset-cache.js', 'encrypted-asset-backend.js', 'encrypted-asset-storage.js',
    'encrypted-asset-sync.js', 'image-compression-profile.js', 'image-pyramid-builder.js',
    'image-photo-processor.js', 'encrypted-asset-reader.js', 'encrypted-asset-item.js',
    'encrypted-asset-import.js',
  ];
  const core = dependencies.slice(dependencies.indexOf('const coreGroup'), dependencies.indexOf('const encryptedImageImportGroups'));
  for (const name of importNames) assert.doesNotMatch(core, new RegExp(name.replace('.', '\\.')), name);
  for (const name of importNames) assert.match(dependencies, new RegExp(name.replace('.', '\\.')), name);
  assert.match(route, /void dependencyLoader\.ensureEncryptedImageImportDependencies\(\)/);
  const submit = route.slice(route.indexOf("bind(importForm, 'submit'"), route.indexOf("bindFactory(MangaListSearchEventsFactory"));
  assert.ok(submit.indexOf('await dependencyLoader.ensureEncryptedImageImportDependencies()') < submit.indexOf('EncryptedAssetCache.createCache()'));
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
