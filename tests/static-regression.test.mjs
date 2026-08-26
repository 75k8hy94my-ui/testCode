import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

function loadRecommendationPicker() {
  const context = { window: {} };
  vm.runInNewContext(read('recommendations.js'), context);
  return context.window.MangaReaderRecommendations;
}

test('recommendation picker rotates fallback works and excludes disabled local manga', () => {
  const picker = loadRecommendationPicker();
  const items = [
    { id: 'current', title: '読了作品', lastReadAt: '2026-08-25T10:00:00Z' },
    { id: 'first', title: 'いつもの作品', favorite: true, updatedAt: 30 },
    { id: 'local', title: '無効なローカル漫画', localSync: true, updatedAt: 40 },
    { id: 'second', title: '別の作品', updatedAt: 20 },
  ];
  const options = { currentId: 'current', history: ['first'], localReaderEnabled: false };
  assert.equal(picker.chooseFallback(items, options).id, 'second');
  assert.equal(picker.chooseFallback(items, { ...options, history: ['first', 'second'] }).id, 'first');
  assert.equal(picker.chooseFallback(items, { ...options, history: [] }).id, 'first');
});

test('reader prioritizes fast visible image loading over background detection', () => {
  const source = read('reader.html');
  assert.match(source, /const FIRST_PAGE_PROBE_BUDGET_MS\s*=\s*15000/);
  assert.match(source, /findPageResult\(1, FIRST_PAGE_PROBE_BUDGET_MS\)/);
  assert.match(source, /const LOAD_TIMEOUT_MS\s*=\s*60000/);
});

test('directly entered URLs keep the save action visible until explicitly saved', () => {
  const source = read('reader.html');
  const body = source.slice(source.indexOf('function hasUnsavedCurrentUrl'), source.indexOf('function updateSaveButtonVisibility'));
  assert.match(body, /if \(!currentItem\) return !!baseUrl && !currentlyCustom/);
});

test('bookshelf cover cache separates filename patterns and can recover stale sources', () => {
  const source = read('reader.html');
  const body = source.slice(source.indexOf('function setupFeedImage'), source.indexOf('let bulkDetectRunning'));
  assert.match(body, /const cacheKey = \[folderUrl, String\(resolvedWidth\), JSON\.stringify\(pattern \|\| null\)/);
  assert.match(body, /coverSourceCache\.delete\(cacheKey\)/);
});

test('manga cards restore the manga screen route before opening a work', () => {
  const source = read('reader.html');
  const body = source.slice(source.indexOf('if (!reorderMode && !bulkEditMode)'), source.indexOf('function normalizeAuthorLinks'));
  assert.match(body, /if \(currentReaderScreen === 'video-list'\) navigateReaderScreen\('saved-list', \{ replace: true \}\);/);
  assert.match(body, /switchListTab\('manga'\);[\s\S]*closeSavedList\(\);[\s\S]*openItem\(item, false\)/);
});

test('local reader routes committed bookshelf writes through storage boundary', () => {
  const source = read('local-reader.html');
  assert.match(source, /MangaReaderStorage\.safeWriteJson\('mangaReaderSavedFolders'/);
  assert.match(source, /MangaReaderStorage\.safeWriteJson\('mangaReaderSavedItems'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('mangaReaderSaved(?:Folders|Items)'/);
});

test('reader error UI builds candidate URLs as text nodes', () => {
  const source = read('reader.html');
  const functionBody = source.slice(source.indexOf('function showFirstPageLoadError'), source.indexOf('function findPageUrl'));
  assert.match(functionBody, /replaceChildren\(\)/);
  assert.match(functionBody, /code\.textContent\s*=\s*baseUrl/);
  assert.doesNotMatch(functionBody, /innerHTML\s*=.*baseUrl/);
});

test('sync UI has no persistent passphrase control and payload includes author cards', () => {
  const source = read('sync.html');
  assert.doesNotMatch(source, /id=["']savePassphrase["']/);
  assert.match(read('vault-payload.js'), /authorCards/);
});

test('reader dashboard includes recent-read and random sections', () => {
  const source = read('reader.html');
  assert.match(source, /\['recent-read', '最近読んだ'/);
  assert.match(source, /\['random', 'ランダム'/);
  assert.match(source, /mangaReaderDashboardVisibility/);
});

test('passkey flow gives a local IP a clear RP ID error', () => {
  const source = read('vault-session.js');
  assert.match(source, /127\.0\.0\.1では登録できません/);
  assert.match(source, /function passkeyRpId/);
});

test('local reader is disabled behind a reversible feature flag', () => {
  assert.match(read('feature-flags.js'), /localReader:\s*false/);
  assert.match(read('reader.html'), /MangaReaderFeatures\.localReader/);
  assert.match(read('local-reader.html'), /ローカル漫画機能は現在停止中です/);
});

test('disabled local manga stays out of bookshelf views without deleting it', () => {
  const source = read('reader.html');
  assert.match(source, /function shelfVisibleItems\(\)/);
  assert.match(source, /window\.MangaReaderFeatures && window\.MangaReaderFeatures\.localReader/);
  assert.match(source, /!item\.localSync/);
  assert.match(source, /itemsList = visibleShelfItems\.filter\(\(it\) => !it\.folderId && !it\.series\)/);
});

test('narrow bookshelf controls wrap instead of clipping', () => {
  const source = read('reader.html');
  assert.match(source, /@media \(max-width: 390px\)/);
  assert.match(source, /#exportImportRow, #listToolbar \{ flex-wrap: wrap/);
  assert.match(source, /#shelfSearchInput \{ flex: 1 1 100%/);
  assert.match(source, /dashboard-row/);
  assert.match(source, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(source, /#shelfSortSelect \{ flex: 1 1 100%/);
});

test('select controls follow the active theme', () => {
  const source = read('reader.html');
  assert.match(source, /select \{ color-scheme: dark; \}/);
  assert.match(source, /html\[data-theme="light"\].*select.*background: #fff/);
});

test('mobile bottom navigation is wired and transfer budget is feature-flagged off', () => {
  const source = read('reader.html');
  assert.match(source, /id="mobileBottomNav"/);
  assert.match(source, /id="mobileNavMore"/);
  assert.match(source, /id="mobileUtilityMenu"/);
  assert.match(source, /mobileNavBackup.*バックアップ/);
  assert.match(source, /--glass-light-x/);
  assert.match(source, /pointermove.*updateGlassLight/);
  assert.match(source, /transferBudgetBtn\.hidden = true/);
  assert.match(read('feature-flags.js'), /transferBudget:\s*false/);
});

test('navigation icons are inline and consistently styled', () => {
  const source = read('reader.html');
  assert.equal((source.match(/class="mobileNavGlyph mobileNavGlyph/g) || []).length, 3);
  assert.match(source, /mobileNavGlyphManga[\s\S]*<path[^>]*d="M24 58/);
  assert.match(source, /mobileNavGlyphVideo[\s\S]*<rect[^>]*x="26"[^>]*y="48"/);
  assert.match(source, /mobileNavGlyphMore[\s\S]*<circle[^>]*cx="55"[^>]*cy="100"/);
  assert.match(source, /\.mobileNavGlyph path, \.mobileNavGlyph rect \{ fill: none; stroke: currentColor/);
  assert.doesNotMatch(source, /vector-effect: non-scaling-stroke/);
});

test('mobile bottom navigation uses Liquid Glass styling', () => {
  const source = read('reader.html');
  assert.match(source, /backdrop-filter: blur\(38px\) saturate\(180%\) contrast\(106%\)/);
  assert.match(source, /#mobileBottomNav::before/);
  assert.match(source, /#mobileBottomNav::after/);
  assert.match(source, /inset 0 1px 0 rgba\(255,255,255/);
  assert.match(source, /\.mobileNavGlyph \{ width: 19px; height: 19px/);
  assert.match(source, /\.mobileNavGlyphMore circle \{ fill: currentColor; stroke: none; \}/);
  assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.match(source, /\.mobileBottomNavBtn\.active.*background: rgba\(255,255,255,.14\)/);
  assert.match(source, /id="liquidRefraction"/);
  assert.match(source, /@supports \(backdrop-filter: url\(#liquidRefraction\)\)/);
  assert.match(source, /pointerdown[\s\S]*glass-pressed/);
});

test('reader surfaces share the Liquid Glass treatment', () => {
  const source = read('reader.html');
  assert.match(source, /#topbar, #controls[\s\S]*backdrop-filter: blur\(28px\) saturate\(190%\) contrast\(106%\)/);
  assert.match(source, /\.modalOverlay \{ background: rgba\(10,12,17,.42\);[\s\S]*backdrop-filter: blur\(22px\) saturate\(145%\)/);
  assert.match(source, /\.listTab \{[\s\S]*backdrop-filter: blur\(12px\) saturate\(150%\)/);
  assert.match(source, /\.saved-item \{[\s\S]*background: var\(--bg-soft\)/);
  assert.match(source, /input, select, textarea \{ border-color: var\(--border\) !important; background: var\(--panel-2\)/);
});

test('all app pages provide Liquid Glass and a no-backdrop fallback', () => {
  for (const page of ['index.html', 'sync.html', 'reader.html', 'links.html', 'local-reader.html']) {
    const source = read(page);
    assert.match(source, /backdrop-filter/ , `${page} should define a glass surface`);
    assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/, `${page} should define a fallback`);
  }
});

test('mobile bottom navigation remains above reader overlays', () => {
  const source = read('reader.html');
  assert.match(source, /#mobileBottomNav \{\s*display: flex; position: fixed/);
  assert.match(source, /z-index: 100/);
  assert.doesNotMatch(source, /showModal\(\)/);
});

test('reader mode repurposes the mobile Liquid Glass controls', () => {
  const source = read('reader.html');
  assert.match(source, /setMobileReaderMode\(true\)/);
  assert.match(source, /setMobileReaderMode\(false\)/);
  assert.match(source, /mobileReaderMode\) \{ els\.prevBtn\.click\(\); return; \}/);
  assert.match(source, /mobileReaderMode\) \{ els\.nextBtn\.click\(\); return; \}/);
  assert.match(source, /body\.reader-mobile-mode #controls \{ display: none !important; \}/);
});

test('reader Liquid Glass controls hide and show with the reader bars', () => {
  const source = read('reader.html');
  assert.match(source, /reader-bars-hidden/);
  assert.match(source, /syncMobileReaderBarsVisibility\(\)/);
  assert.match(source, /function hideBars\(\)[\s\S]*syncMobileReaderBarsVisibility\(\)/);
  assert.match(source, /function toggleBars\(\)[\s\S]*syncMobileReaderBarsVisibility\(\)/);
});

test('author card creation remains reachable above the fixed bottom navigation', () => {
  const source = read('reader.html');
  assert.match(source, /#authorCardPanel \{ padding-bottom: calc\(96px \+ max\(18px, env\(safe-area-inset-bottom\)\)\); \}/);
});

test('mobile author cards use the bottom navigation instead of a close button', () => {
  const source = read('reader.html');
  assert.match(source, /#closeAuthorCardBtn\s*\{\s*display:\s*none !important;/);
  assert.match(source, /mobileNavAuthor\.addEventListener\('click', \(\) => \{[\s\S]*openAuthorCards\(\)/);
  assert.doesNotMatch(source, /currentReaderScreen === 'author-cards'[\s\S]*closeAuthorCards\(\)/);
  assert.match(source, /#authorCardPanel\s*\{[^}]*padding-bottom: calc\(128px \+ max\(18px, env\(safe-area-inset-bottom\)\)\)/);
});

test('author card creation control appears before the card list', () => {
  const source = read('reader.html');
  assert.ok(source.indexOf('id="authorCardCreateActions"') < source.indexOf('id="authorCardList"'));
  assert.ok(source.indexOf('id="authorCardEditor"') < source.indexOf('id="authorCardList"'));
});

test('saved list does not duplicate manga and video navigation in its header', () => {
  const source = read('reader.html');
  assert.doesNotMatch(source, /id="listTabManga"/);
  assert.doesNotMatch(source, /id="listTabVideo"/);
  assert.doesNotMatch(source, /id="listTabLinks"/);
  assert.doesNotMatch(source, /id="authorCardsBtn"/);
  assert.match(source, /mobileNavManga\.addEventListener/);
  assert.match(source, /mobileNavVideo\.addEventListener/);
  assert.match(source, /id="mobileNavLinks"/);
});

test('video list has its own history-backed screen route', () => {
  const source = read('reader.html');
  assert.match(source, /'video-list': els\.savedListOverlay/);
  assert.match(source, /currentReaderScreen === 'video-list'\) switchListTab\('video'\)/);
  assert.match(source, /openReaderScreen\('video-list'\)/);
  assert.match(source, /closeReaderScreen\(currentReaderScreen === 'video-list' \? 'video-list' : 'saved-list'\)/);
});

test('shared manga and video screen elements are not hidden by alias iteration', () => {
  const source = read('reader.html');
  assert.match(source, /const visible = !!currentReaderScreen && element === readerScreenElements\[currentReaderScreen\]/);
  assert.match(source, /element\.classList\.toggle\('show', visible\)/);
});

test('video screen hides the manga close button', () => {
  const source = read('reader.html');
  assert.match(source, /els\.closeListBtn\.style\.display = 'none';/);
});

test('saved list screen also has no redundant close button', () => {
  const source = read('reader.html');
  assert.match(source, /openReaderScreen\('saved-list'\);[\s\S]*els\.closeListBtn\.style\.display = 'none';/);
});

test('utility menu does not include a redundant theme switcher', () => {
  const source = read('reader.html');
  assert.doesNotMatch(source, /id="mobileNavTheme"/);
  assert.doesNotMatch(source, /els\.mobileNavTheme/);
});

test('dashboard sections are user-configurable from a history-backed settings screen', () => {
  const source = read('reader.html');
  assert.match(source, /id="settingsOverlay" class="screenView/);
  assert.match(source, /id="mobileNavSettings"/);
  assert.match(source, /mangaReaderDashboardVisibility/);
  for (const label of ['続きから読む', '最近追加', '最近読んだ', '未読', 'ランダム', 'お気に入り']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /openReaderScreen\('settings'\)/);
});

test('backup actions live on their own utility screen and mobile hides heavy actions', () => {
  const source = read('reader.html');
  assert.match(source, /id="backupOverlay" class="screenView/);
  assert.match(source, /id="mobileNavBackup"[^>]*>バックアップ</);
  assert.match(source, /openReaderScreen\('backup'\)/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*#newBtn[\s\S]*display: none/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*#addCustomBtn[\s\S]*display: none/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*#bulkDetectBtn[\s\S]*display: none/);
  assert.doesNotMatch(source, /id="backupExportBtn"[^>]*>バックアップ保存[\s\S]*id="mangaListSection"/);
});

test('bookshelf pagination follows the shelf content and paginates folders with items', () => {
  const source = read('reader.html');
  assert.doesNotMatch(source, /\.bookshelf-pagination \{[^}]*position:\s*fixed/);
  assert.match(source, /const folderEntries = folderCards\.map/);
  assert.match(source, /const pagedEntries = folderEntries\.concat\(contentEntries\)/);
  assert.match(source, /visibleFolderEntries\.forEach\(\(entry\) => frag\.appendChild\(buildFolderCard\(entry\.folder/);
  assert.match(source, /#savedListItems\.bookshelf \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[^}]*padding-bottom: calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(source, /savedListItems\.addEventListener\('touchstart'/);
  assert.match(source, /savedListItems\.addEventListener\('touchend'/);
  assert.match(source, /changeBookshelfPage\(dx < 0 \? 1 : -1\)/);
});

test('image requests stop after a short timeout instead of retrying indefinitely', () => {
  const source = read('reader.html');
  assert.match(source, /const LOAD_TIMEOUT_MS = 60000/);
  assert.match(source, /const IMAGE_PROBE_BUDGET_MS = 60000/);
  assert.match(source, /const failedPreloadUrls = new Set\(\)/);
  assert.match(source, /failedPreloadUrls\.add\(url\)/);
  assert.match(source, /coverFailedCache\.add\(cacheKey\)/);
  assert.match(source, /画像の読み込みがタイムアウトしました/);
});

test('auth refresh cannot leave the whole reader hidden indefinitely', () => {
  const source = read('reader.html');
  assert.match(source, /const AUTH_REFRESH_TIMEOUT_MS = 5000/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /finally\(\(\) => clearTimeout\(timer\)\)/);
});

test('mobile Liquid Glass navigation does not span nearly the full viewport', () => {
  const source = read('reader.html');
  assert.match(source, /#mobileBottomNav \{[\s\S]*width: min\(360px, calc\(100vw - 32px\)\)/);
});

test('mobile bookshelf control spacing stays compact', () => {
  const source = read('reader.html');
  assert.match(source, /#smartListRow \{ padding-bottom: 4px; margin-bottom: 4px; \}/);
  assert.match(source, /#savedListItems\.bookshelf \.bookshelf-pagination \{ margin-top: 0 !important; margin-bottom: 0 !important; \}/);
});

test('navigable reader screens use history-backed screen views', () => {
  const source = read('reader.html');
  assert.match(source, /class="[^"]*\bscreenView\b[^"]*"/);
  assert.match(source, /history\.pushState/);
  assert.match(source, /addEventListener\(['"]popstate['"]/);
  for (const id of ['savedListOverlay', 'saveDialogOverlay', 'customAddOverlay', 'editItemOverlay', 'authorCardOverlay', 'tocOverlay', 'bulkEditOverlay', 'bulkDetectOverlay', 'videoAddOverlay', 'videoPlayerOverlay']) {
    assert.doesNotMatch(source, new RegExp(`<dialog[^>]+id="${id}"`));
  }
});

test('link and local-reader editors use history-backed screen views', () => {
  const links = read('links.html');
  const localReader = read('local-reader.html');
  for (const [source, key] of [[links, 'link-edit'], [localReader, 'crop-editor']]) {
    assert.match(source, /class="[^"]*\bscreenView\b[^"]*"/);
    assert.match(source, /history\.pushState/);
    assert.match(source, /addEventListener\(['"]popstate['"]/);
    assert.match(source, new RegExp(key));
  }
  assert.doesNotMatch(links, /<dialog[^>]+id="editDialog"/);
});

test('screen navigation does not rely on native dialog overlays', () => {
  for (const file of ['reader.html', 'links.html', 'local-reader.html']) {
    const source = read(file);
    assert.doesNotMatch(source, /<dialog\b|showModal\(\)/);
  }
});


test('Home layout loads before vault payload on existing protected pages', () => {
  for (const page of ['sync.html', 'reader.html', 'study.html']) {
    const source = read(page);
    assert.ok(source.indexOf('home-layout.js') >= 0, page + ' should load home-layout.js');
    assert.ok(source.indexOf('home-layout.js') < source.indexOf('vault-payload.js'), page + ' must load Home layout first');
  }
});
