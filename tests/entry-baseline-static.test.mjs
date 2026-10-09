import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const pages = {
  manga: read('manga.html'),
  video: read('video.html'),
};
const spa = read('home-profile-spa.js');
const reader = read('reader.html');
const vault = read('vault-session.js');
const payload = read('vault-payload.js');
const vpn = read('media-access-gate.js');
const videoLibrary = read('video-library.js');
const recommendations = read('recommendations.js');

function scriptSources(html) {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((match) => match[1]);
}

test('current entry pages keep their static bootstrap script baselines', () => {
  assert.deepEqual(scriptSources(pages.manga), [
    'supabase-config.js', 'vault-session.js?v=20261006-passkey-reset', 'browser-storage.js',
    'vault-payload.js', 'backup-format.js?v=20260822-backup-scope-fix', 'home-dashboard.js?v=20260924-home-media-cards',
    'app-global-shell.js?v=20261003-reader-spa', 'app-desktop-rail.js',
    'profile-avatar.js?v=20261008-profile-avatar', 'profile-menu.js?v=20261008-profile-avatar', 'feature-flags.js',
    'media-access-gate.js?v=20261008-vpn-data',
    'manga-list-route.js?v=20261009-desktop-liquid-pager',
    'mobile-bottom-nav.js?v=20260925-instagram-drag-lock', 'home-profile-spa.js?v=20261009-sync-save-feedback',
  ]);
  assert.deepEqual(scriptSources(pages.video), [
    'supabase-config.js', 'vault-session.js?v=20261006-passkey-reset', 'browser-storage.js',
    'vault-payload.js', 'backup-format.js?v=20260822-backup-scope-fix', 'home-dashboard.js?v=20260924-home-media-cards',
    'app-global-shell.js?v=20261003-reader-spa', 'app-desktop-rail.js',
    'profile-avatar.js?v=20261008-profile-avatar', 'profile-menu.js?v=20261008-profile-avatar', 'mobile-bottom-nav.js?v=20260925-instagram-drag-lock', 'home-profile-spa.js?v=20261009-sync-save-feedback',
  ]);
});

test('manga and video use app-shell routes while Reader stays a standalone document', () => {
  assert.match(spa, /if\(name==='manga\.html'\)return'manga'/);
  assert.match(spa, /if\(name==='video\.html'\)return'video'/);
  assert.match(spa, /else if\(route==='manga'\)renderManga\(generation\)/);
  assert.match(spa, /else if\(route==='video'\)renderVideo\(generation\)/);
  assert.doesNotMatch(spa, /reader\.html|renderReader|iframe/);
  assert.match(spa, /if\(!SPA_PAGES\.includes\(name\)\)\{location\.href=target\.href;return;\}/);
  assert.match(reader, /class="auth-pending"/);
  assert.match(reader, /reader-target\.js\?v=20261004-reader-item-route/);
});

test('manga and video mount through their own route runtimes', () => {
  const mangaRoute = spa.slice(spa.indexOf('async function renderManga'), spa.indexOf('function renderRoute'));
  const videoRoute = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.match(mangaRoute, /MangaListRouteFactory\.create\(/);
  assert.match(videoRoute, /VideoListRouteFactory\.create\(/);
  assert.doesNotMatch(videoRoute, /MangaListRouteFactory|fetch\(['"]reader\.html/);
  assert.doesNotMatch(mangaRoute, /VideoListRouteFactory|video-data\.js/);
});

test('manga and video route startup failures render visible recovery messages', () => {
  const mangaRoute = spa.slice(spa.indexOf('async function renderManga'), spa.indexOf('function renderRoute'));
  const videoRoute = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderManga'));
  assert.match(mangaRoute, /catch\(_\)\{[\s\S]*漫画一覧を読み込めませんでした/);
  assert.match(videoRoute, /catch\(_\)\{[\s\S]*動画一覧を読み込めませんでした/);
});

test('authentication branches remain explicit in the current SPA bootstrap', () => {
  assert.match(spa, /if\(!session\|\|!session\.refresh_token\|\|!config\.url\|\|!config\.publishableKey\)\{showLogin\(\);return;\}/);
  assert.match(spa, /if\(!MangaVault\.loadActive\(\)\)\{showVault\(\);return;\}/);
  assert.match(spa, /await MangaVault\.ensureSession\(\)/);
  assert.match(spa, /catch\(error\)\{if\(typeof MangaVault\.isSessionAuthError==='function'&&MangaVault\.isSessionAuthError\(error\)\)MangaVault\.saveSession\(null\);showLogin\(\);return;\}/);
});

test('vault saves use the existing payload builder and savePayload boundary', () => {
  assert.match(spa, /const payload=MangaVaultPayload\.buildFromLocalStorage\(\);if\(!canSyncProtectedData\(\)\)return;await MangaVault\.savePayload\(payload\)/);
  assert.match(videoLibrary, /MangaVault\.savePayload\(MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.match(reader, /MangaVault\.savePayload\(/);
  assert.match(vault, /rpc\/update_manga_reader_vault/);
  assert.match(vault, /expected_revision/);
  assert.match(vault, /new_payload/);
});

test('legacy storage keys and manual VPN keys remain literal in the current payload source', () => {
  for (const key of [
    'mangaReaderSavedItems', 'mangaReaderSavedFolders', 'mangaReaderVideos',
    'mangaReaderVideoFolders', 'mangaReaderVideoMeta', 'mangaReaderAuthorCards',
    'mangaReaderStudy', 'mangaReaderIndexSearchSettings',
    'testCode.manualVpnIps', 'testCode.manualNonVpnIps',
  ]) assert.match(payload, new RegExp(key.replaceAll('.', '\\.'), 'g'), key);
});

test('VPN guard installation appears before automatic initial check and covers protected media types', () => {
  assert.ok(vpn.lastIndexOf('installGuards();') < vpn.lastIndexOf('checkVpn({ external: false })'));
  for (const ctor of ['HTMLImageElement', 'HTMLMediaElement', 'HTMLIFrameElement', 'HTMLSourceElement']) {
    assert.match(vpn, new RegExp(`patchSrcProperty\\(root\\.${ctor}\\)`));
  }
  assert.match(vpn, /function applyFinalStatus\(allowed\)/);
  assert.match(vpn, /if\s*\(status\s*===\s*['"]allowed['"]\)\s*\{[\s\S]*restoreBlockedElements\(\)/);
  assert.match(vpn, /else\s*\{[\s\S]*blockExistingExternalMedia\(\)/);
});

test('VPN checks and manual designations remain available to protected reader media', () => {
  assert.match(reader, /media-access-gate\.js/);
  assert.match(vpn, /MANUAL_VPN_IPS_KEY/);
  assert.match(vpn, /MANUAL_NON_VPN_IPS_KEY/);
  assert.match(vpn, /function checkVpn\(/);
});

test('video bootstrap has one owner per page and does not load on the Reader document', () => {
  assert.match(spa, /video-list-route\.js\?v=20261009-sync-save-feedback/);
  const videoRoute = fs.readFileSync(new URL('../video-list-route.js', import.meta.url), 'utf8');
  assert.match(videoRoute, /video-thumbnail-renderer\.js\?v=20261008-shared-thumbnails/);
  assert.match(videoRoute, /video-library\.js\?v=20261009-sync-save-feedback/);
  assert.match(recommendations, /const page = String\(\(root\.location && root\.location\.pathname\) \|\| ''\)\.split\('\/'\)\.pop\(\);/);
  assert.doesNotMatch(reader, /recommendations\.js|video-data\.js|video-library\.js/);
  assert.match(recommendations, /loadBrowserScript\('video-data\.js'\)/);
  assert.match(recommendations, /loadBrowserScript\('video-library\.js'\)/);
  assert.match(videoLibrary, /function init\(access\)/);
  assert.match(videoLibrary, /DOMContentLoaded/);
});

test('Reader stays independent from the SPA history router', () => {
  assert.match(spa, /addEventListener\('click',intercept\)/);
  assert.match(spa, /addEventListener\('popstate',renderRoute\)/);
  assert.doesNotMatch(reader, /popstate|hashchange|ReaderShell/);
  assert.match(videoLibrary, /addEventListener\(['"]popstate['"]/);
  assert.match(videoLibrary, /DOMContentLoaded/);
});
