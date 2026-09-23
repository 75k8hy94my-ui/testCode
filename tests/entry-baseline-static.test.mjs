import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

const pages = {
  manga: read('manga.html'),
  video: read('video.html'),
};
const spa = read('home-profile-spa.js');
const readerRouteRuntime = read('reader-route-runtime.js');
const reader = read('reader.html');
const readerTemplates = [
  'reader-saved-list-template.js', 'reader-author-list-template.js', 'reader-toc-template.js',
  'reader-mobile-nav-template.js', 'reader-feature-overlays-template.js',
].map(read).join('\n');
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
    'supabase-config.js', 'vault-session.js?v=20260813-vault-state', 'browser-storage.js',
    'vault-payload.js', 'backup-format.js?v=20260822-backup-scope-fix', 'home-dashboard.js?v=20260924-home-media-cards',
    'app-global-shell.js?v=20260924-theme-unified', 'app-desktop-rail.js',
    'profile-menu.js?v=20260924-theme-unified', 'feature-flags.js',
    'media-access-gate.js?v=20260922-vpn-tools',
    'manga-list-route.js?v=20260922-manga-route',
    'home-profile-spa.js?v=20260924-theme-unified',
  ]);
  assert.deepEqual(scriptSources(pages.video), [
    'supabase-config.js', 'vault-session.js?v=20260813-vault-state', 'browser-storage.js',
    'vault-payload.js', 'backup-format.js?v=20260822-backup-scope-fix', 'home-dashboard.js?v=20260924-home-media-cards',
    'app-global-shell.js?v=20260924-theme-unified', 'app-desktop-rail.js',
    'profile-menu.js?v=20260924-theme-unified', 'home-profile-spa.js?v=20260924-theme-unified',
  ]);
});

test('current route dispatcher keeps manga and video independent and preserves direct reader bootstrap', () => {
  assert.match(spa, /if\(name==='manga\.html'\)return'manga'/);
  assert.match(spa, /if\(name==='video\.html'\)return'video'/);
  assert.match(spa, /else if\(route==='manga'\)renderManga\(generation\)/);
  assert.match(spa, /else if\(route==='video'\)renderVideo\(generation\)/);
  assert.match(spa, /else if\(route==='reader'\)renderReader\(route,generation\)/);
  assert.match(spa, /fetch\('reader\.html\?v=20260916-reader'/);
  assert.match(spa, /ReaderRouteRuntimeFactory\.create\(/);
  assert.match(spa, /reader-route-runtime\.js\?v=20260922-route-runtime/);
  assert.match(readerRouteRuntime, /if \(route === 'manga' \|\| route === 'video'\) deps\.activate\(route\)/);
  assert.match(spa, /route==='video'\?'listTabVideo':'listTabManga'/);
});

test('current reader entry pruning remains reader-only while video uses its own surface', () => {
  assert.match(spa, /if\(route==='manga'\)\{remove\('#videoAddOverlay,#videoPlayerOverlay/);
  assert.doesNotMatch(spa, /else if\(route==='video'\)\{remove\('#mangaListSection/);
});

test('reader bootstrap reports loading failure instead of silently swallowing it', () => {
  assert.match(spa, /renderError:\(mount\)=>\{mount\.innerHTML=/);
  assert.match(readerRouteRuntime, /if \(generation === deps\.getGeneration\(\)\) deps\.renderError\(target, error\)/);
  assert.match(spa, /漫画を読み込めませんでした/);
});

test('authentication branches remain explicit in the current SPA bootstrap', () => {
  assert.match(spa, /if\(!session\|\|!session\.refresh_token\|\|!config\.url\|\|!config\.publishableKey\)\{showLogin\(\);return;\}/);
  assert.match(spa, /if\(!MangaVault\.loadActive\(\)\)\{showVault\(\);return;\}/);
  assert.match(spa, /await MangaVault\.refreshSession\(\)/);
  assert.match(spa, /catch\(_\)\{MangaVault\.saveSession\(null\);showLogin\(\);return;\}/);
});

test('vault saves use the existing payload builder and savePayload boundary', () => {
  assert.match(spa, /MangaVault\.savePayload\(MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
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

test('VPN diagnostics and manual designation controls remain part of the existing surface', () => {
  assert.match(readerTemplates, /data-vpn-status-button/);
  assert.match(readerTemplates, /data-vpn-diagnostics-button/);
  assert.match(vpn, /MANUAL_VPN_IPS_KEY/);
  assert.match(vpn, /MANUAL_NON_VPN_IPS_KEY/);
  assert.match(vpn, /function checkVpn\(/);
});

test('video bootstrap has one owner per page and keeps direct reader loading', () => {
  assert.match(spa, /video-data\.js\?v=20260918-video-data-no-window/);
  assert.match(spa, /video-library\.js\?v=20260918-video-library-no-window/);
  assert.match(spa, /video-routing-fix\.js\?v=20260918-video-routing-no-window/);
  assert.match(spa, /video-thumbnail-time\.js\?v=20260916-video-thumbnail/);
  assert.match(recommendations, /const page = String\(\(root\.location && root\.location\.pathname\) \|\| ''\)\.split\('\/'\)\.pop\(\);/);
  assert.match(recommendations, /if \(page !== 'reader\.html'\) return;/);
  assert.match(recommendations, /loadBrowserScript\('video-data\.js'\)/);
  assert.match(recommendations, /loadBrowserScript\('video-library\.js'\)/);
  assert.match(videoLibrary, /function init\(\)/);
  assert.match(videoLibrary, /DOMContentLoaded/);
});

test('current event registration points are recorded for later comparison', () => {
  assert.match(spa, /addEventListener\('click',intercept\)/);
  assert.match(spa, /addEventListener\('popstate',renderRoute\)/);
  assert.match(reader, /(?:addEventListener\(['"]popstate['"]|bindReaderGlobal\(\s*window,\s*['"]popstate['"])/);
  assert.match(videoLibrary, /addEventListener\(['"]popstate['"]/);
  assert.match(videoLibrary, /DOMContentLoaded/);
});
