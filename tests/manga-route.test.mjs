import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const route = fs.readFileSync('manga-list-route.js', 'utf8');
const spa = fs.readFileSync('home-profile-spa.js', 'utf8');
const manga = fs.readFileSync('manga.html', 'utf8');

test('manga shelf launches the standalone Reader document from its document boundary', () => {
  assert.match(route, /MangaListEntryFactory\.create\(/);
  assert.doesNotMatch(route, /fetch\(\s*['"]reader\.html/);
  assert.doesNotMatch(route, /fetch\s*\(/);
  assert.match(spa, /renderManga\(/);
  assert.match(spa, /route === 'manga'|route==='manga'/);
  assert.doesNotMatch(spa, /reader\.html|renderReader|iframe/);
  assert.match(route, /location\.assign\(url\)/);
  assert.match(manga, /manga-list-route\.js\?v=/);
});

test('manga route skips protected store reads and legacy migration without VPN access', () => {
  const load = route.slice(route.indexOf('load() {'), route.indexOf('wasLegacyMigrated()'));
  assert.ok(load.indexOf('if (!canReadProtectedData())') < load.indexOf('MangaListState.load'));
  assert.match(route, /persistVideos\(\) \{ if \(canReadProtectedData\(\)\) safeWriteJson\(keys\.savedVideos/);
  assert.match(route, /vpnProtectedDataNotice/);
  assert.match(route, /control\.disabled = !canReadProtectedData\(\)/);
});

test('manga mutation callbacks remain protected while image uploads move out', () => {
  const extensionImport = route.slice(route.indexOf("bind(bulkDetect, 'click'"), route.indexOf("bind(mangaImportRegister, 'click'"));
  const registerImport = route.slice(route.indexOf("bind(mangaImportRegister, 'click'"), route.indexOf('bindFactory(MangaListSearchEventsFactory'));
  assert.match(extensionImport, /if \(!canReadProtectedData\(\)\)/);
  assert.match(registerImport, /if \(!canReadProtectedData\(\)\)/);
  assert.doesNotMatch(route, /bind\(importForm, 'submit'/);
  assert.match(route, /!item\.encryptedAssets\?\.pages\?\.length/);
});

test('manga route loads the shared runtime pieces without reader or video entry assets', () => {
  for (const name of [
    'manga-list-entry.js',
    'manga-list-template.js',
    'manga-list-mount.js',
    'manga-list-runtime-context.js',
    'manga-list-host-runtime.js',
    'manga-list-image-cache.js',
    'manga-list-runtime.js',
  ]) assert.match(route, new RegExp(name.replace('.', '\\.') + '\\?v='));
  assert.doesNotMatch(route, /reader-saved-list-template|video-data\.js|video-library\.js/);
});

test('manga route reuses the existing list event factories', () => {
  for (const name of [
    'manga-list-search-events.js',
    'manga-list-sort-events.js',
    'manga-list-filter-events.js',
    'manga-list-folder-events.js',
    'manga-list-smart-list-events.js',
    'manga-list-pagination-events.js',
    'manga-list-navigation-events.js',
    'manga-list-bulk-events.js',
  ]) assert.match(route, new RegExp(name.replace('.', '\\.') + '\\?v='));
  assert.match(route, /bindFactory\(MangaListSearchEventsFactory/);
  assert.match(route, /bindFactory\(MangaListPaginationEventsFactory/);
  assert.match(route, /bindFactory\(MangaListNavigationEventsFactory/);
  assert.match(route, /factory\.create\(deps\)\.bind\(factoryElements\)/);
});

test('manga shell keeps the existing shared authentication and vault bootstrap', () => {
  assert.match(manga, /supabase-config\.js/);
  assert.match(manga, /vault-session\.js/);
  assert.match(manga, /browser-storage\.js/);
  assert.match(manga, /vault-payload\.js/);
  assert.match(manga, /feature-flags\.js/);
  assert.match(manga, /media-access-gate\.js\?v=20261008-vpn-data/);
  assert.match(manga, /home-profile-spa\.js\?v=/);
});

test('manga route startup failure and stale renders clean only their own runtime', () => {
  assert.match(spa, /async function renderManga\(generation\)\{/);
  assert.match(spa, /let routeRuntime=null;/);
  assert.match(spa, /mangaRouteRuntime=routeRuntime;/);
  assert.match(spa, /generation!==renderGeneration\|\|mangaRouteRuntime!==routeRuntime/);
  assert.match(spa, /cleanupMangaRoute\(routeRuntime\)/);
  assert.match(spa, /function cleanupMangaRoute\(runtime=mangaRouteRuntime\)/);
});

test('manga route owns its stylesheet so SPA entry path cannot change shelf layout', () => {
  assert.match(route, /const STYLESHEET_URL = 'manga-list\.css\?v=20261009-desktop-liquid-pager'/);
  assert.match(route, /function ensureStylesheet\(documentRef\)/);
  assert.match(route, /Promise\.all\(\[ensureStylesheet\(documentRef\), loadDependencies\(documentRef\)\]\)/);
  assert.match(route, /dataset\.mangaListRouteStyle = '1'/);
});

test('manga route lifecycle is instance-local and cancellation-safe', () => {
  assert.doesNotMatch(route, /let dependencyPromise = null;\s*let activeEntry = null;/);
  assert.match(route, /const windowRef = deps\.windowRef;\s*const mediaAccess = deps\.mediaAccess \|\| windowRef\.MangaReaderMediaAccess;\s*const canReadProtectedData/);
  assert.match(route, /let activeEntry = null;\s*let lifecycle = 0;/);
  assert.match(route, /const token = \+\+lifecycle;/);
  assert.match(route, /if \(token !== lifecycle\) return null;/);
  assert.match(route, /function cleanup\(\) \{\s*lifecycle \+= 1;/);
});

test('VPN recheck hides protected records immediately when an allowed route becomes checking', () => {
  assert.match(spa, /function handleVpnStatusChange\(event\)/);
  assert.match(spa, /lastVpnRouteAccess=route\+':blocked'[\s\S]*renderRoute\(\)/);
  assert.match(spa, /lastVpnRouteAccess=route\+':'\+\(gate&&gate\.canReadProtectedData/);
});


test('failed-image rollback can be retried after VPN access returns', () => {
  assert.match(route, /mangaReaderPendingEncryptedAssetCleanup/);
  assert.match(route, /const discardOrQueue = async/);
  assert.match(route, /void retryPendingCleanup/);
  assert.match(route, /EncryptedAssetSync.discardImportedAsset/);
});
