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
  for (const html of [pages.manga, pages.video]) {
    const sources = scriptSources(html);
    for (const name of ['guest-mode.js', 'vault-sync-merge.js', 'vault-session.js', 'vault-payload.js', 'home-profile-spa.js']) {
      assert.equal(sources.filter(source => source.split('?')[0] === name).length, 1, name + ' must load once');
    }
    const index = name => sources.findIndex(source => source.split('?')[0] === name);
    assert.ok(index('vault-sync-merge.js') < index('vault-session.js'));
    assert.ok(index('vault-session.js') < index('vault-payload.js'));
    assert.ok(index('vault-payload.js') < index('home-profile-spa.js'));
    assert.ok(sources.some(source => /^home-profile-spa\.js\?v=\d{8}-[\w-]+$/.test(source)));
  }
});
test('every Vault entry loads the diff-sync dependency before its Vault session', () => {
  const pagesWithVault = fs.readdirSync(new URL('..', import.meta.url)).filter(name => name.endsWith('.html'));
  let found = 0;
  for (const name of pagesWithVault) {
    const html = read(name);
    if (!html.includes('vault-session.js')) continue;
    const sources = scriptSources(html).map(src => src.replace(/^\.\.\//, '').split('?')[0]);
    const merge = sources.indexOf('vault-sync-merge.js');
    const session = sources.indexOf('vault-session.js');
    assert.ok(merge >= 0 && session > merge, name + ' loads merge before vault session');
    const conflict = sources.indexOf('vault-conflict-ui.js');
    if (conflict >= 0) assert.ok(conflict > session, name + ' loads conflict UI after session');
    const payload = sources.indexOf('vault-payload.js');
    if (payload >= 0) assert.ok(payload > session, name + ' loads payload after session');
    found++;
  }
  assert.ok(found > 0);
});
test('VPN loss preserves pending home edits for retry after access returns', () => {
  assert.match(spa, /markLocalChangesPending\(\)/);
  assert.match(spa, /syncDirty=true;syncDirtyMessage=okMessage\|\|syncDirtyMessage/);
  assert.match(spa, /next==='allowed'&&syncDirty&&!syncRunning\)\{[\s\S]*MangaVault\.syncLatest\(\)/);
  assert.doesNotMatch(spa, /if\(next!==['"]allowed['"]\)\{syncDirty=false/);
});

test('manga cloud sync failures are visible while retaining the local save', () => {
  const route = read('manga-list-route.js');
  assert.match(route, /端末には保存済みですが、クラウド同期に失敗しました/);
  assert.match(route, /notice\.setAttribute\('role', 'status'\)/);
});

test('manga and video use app-shell routes while Reader stays a standalone document', () => {
  assert.match(spa, /if\(name==='manga\.html'\)return'manga'/);
  assert.match(spa, /if\(name==='video\.html'\)return'video'/);
  assert.match(spa, /else if\(route==='manga'\)renderManga\(generation\)/);
  assert.match(spa, /else if\(route==='video'\)renderVideo\(generation\)/);
  assert.doesNotMatch(spa, /reader\.html|renderReader|iframe/);
  assert.match(spa, /if\(!SPA_PAGES\.includes\(name\)\)\{location\.href=target\.href;return true;\}/);
  assert.match(reader, /class="auth-pending"/);
  assert.match(reader, /reader-target\.js\?v=[\w-]+/);
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
  assert.match(spa, /catch\(error\)\{[\s\S]*MangaVault\.saveSession\(null\)[\s\S]*showLogin\(\);[\s\S]*return;/);
});

test('ordinary vault sync requests use the local-storage save queue', () => {
  assert.match(spa, /await MangaVault\.saveLocalChanges\(\)/);
  assert.match(videoLibrary, /MangaVault\.saveLocalChanges\(\)/);
  assert.match(reader, /MangaVault\.saveLocalChanges\(\)/);
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
  assert.match(spa, /video-list-route\.js\?v=[\w-]+/);
  const videoRoute = fs.readFileSync(new URL('../video-list-route.js', import.meta.url), 'utf8');
  assert.match(videoRoute, /video-thumbnail-renderer\.js\?v=[\w-]+/);
  assert.match(videoRoute, /video-card\.js\?v=[\w-]+/);
  assert.match(videoRoute, /manga-list-pagination-events\.js\?v=[\w-]+/);
  assert.match(videoRoute, /video-library-pagination\.js\?v=[\w-]+/);
  assert.match(videoRoute, /video-library\.js\?v=[\w-]+/);
  assert.match(recommendations, /const page = String\(\(root\.location && root\.location\.pathname\) \|\| ''\)\.split\('\/'\)\.pop\(\);/);
  assert.doesNotMatch(reader, /recommendations\.js|video-data\.js|video-library\.js/);
  assert.match(recommendations, /loadBrowserScript\('video-data\.js\?v=[\w-]+'\)/);
  assert.match(recommendations, /loadBrowserScript\('video-library\.js\?v=[\w-]+'\)/);
  assert.match(videoLibrary, /function init\(access\)/);
  assert.match(videoLibrary, /DOMContentLoaded/);
});

test('Reader stays independent from the SPA history router', () => {
  assert.match(spa, /addEventListener\('click',intercept\)/);
  assert.match(spa, /addEventListener\('popstate',handleRoutePopstate\)/);
  assert.doesNotMatch(reader, /popstate|hashchange|ReaderShell/);
  assert.match(videoLibrary, /addEventListener\(['"]popstate['"]/);
  assert.match(videoLibrary, /DOMContentLoaded/);
});

