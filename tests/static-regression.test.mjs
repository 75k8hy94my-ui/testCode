import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const readFile = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const read = (name) => name === 'reader.html' ? ['reader.html', 'reader-saved-list-template.js', 'reader-author-list-template.js', 'reader-toc-template.js', 'reader-mobile-nav-template.js', 'reader-feature-overlays-template.js'].map(readFile).join('\n') : readFile(name);
const readReader = () => read('reader.html');

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
  const source = readReader();
  assert.match(source, /const FIRST_PAGE_PROBE_BUDGET_MS\s*=\s*15000/);
  assert.match(source, /findPageResult\(1, FIRST_PAGE_PROBE_BUDGET_MS\)/);
  assert.match(source, /const LOAD_TIMEOUT_MS\s*=\s*60000/);
});

test('directly entered URLs keep the save action visible until explicitly saved', () => {
  const source = readReader();
  const body = source.slice(source.indexOf('function hasUnsavedCurrentUrl'), source.indexOf('function updateSaveButtonVisibility'));
  assert.match(body, /if \(!currentItem\) return !!baseUrl && !currentlyCustom/);
});

test('bookshelf cover cache separates filename patterns and can recover stale sources', () => {
  const source = readReader();
  const body = source.slice(source.indexOf('function setupFeedImage'), source.indexOf('let bulkDetectRunning'));
  assert.match(body, /const cacheKey = \[folderUrl, String\(resolvedWidth\), JSON\.stringify\(pattern \|\| null\)/);
  assert.match(body, /coverSourceCache\.delete\(cacheKey\)/);
});

test('manga cards restore the manga screen route before opening a work', () => {
  const body = read('manga-list-runtime.js');
  assert.match(body, /if \(context\.getReaderScreen\(\) === 'video-list'\) context\.navigateReaderScreen\('saved-list', \{ replace: true \}\);/);
  assert.match(body, /switchListTab\('manga'\);[\s\S]*closeSavedList\(\);[\s\S]*openItem\(item, false\)/);
});

test('local reader routes committed bookshelf writes through storage boundary', () => {
  const source = read('local-reader.html');
  assert.match(source, /MangaReaderStorage\.safeWriteJson\('mangaReaderSavedFolders'/);
  assert.match(source, /MangaReaderStorage\.safeWriteJson\('mangaReaderSavedItems'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('mangaReaderSaved(?:Folders|Items)'/);
});

test('reader error UI builds candidate URLs as text nodes', () => {
  const source = readReader();
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
  const source = readReader();
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
  const source = readReader();
  const runtime = read('manga-list-runtime.js');
  const viewModel = read('manga-list-view-model.js');
  assert.match(source, /function shelfVisibleItems\(\)/);
  assert.match(source, /window\.MangaReaderFeatures && window\.MangaReaderFeatures\.localReader/);
  assert.match(source, /!item\.localSync/);
  assert.match(viewModel, /itemsList = visibleShelfItems\.filter\(\(it\) => !it\.folderId && !it\.series\)/);
  assert.match(runtime, /items:\s*context\.shelfVisibleItems\(\)/);
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
  for (const page of ['index.html', 'sync.html', 'reader.html', 'local-reader.html']) {
    const source = read(page);
    assert.match(source, /backdrop-filter/ , `${page} should define a glass surface`);
    assert.match(source, /@supports not \(\(backdrop-filter: blur\(1px\)\)/, `${page} should define a fallback`);
  }
  const spaCss = read('home-profile-shell.css') + read('app-global-shell.css');
  assert.match(spaCss, /backdrop-filter/);
  assert.match(spaCss, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
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

test('author cards use navigation instead of a redundant close button', () => {
  const source = read('reader.html');
  assert.doesNotMatch(source, /id=["']closeAuthorCardBtn["']/);
  assert.doesNotMatch(source, /els\.closeAuthorCardBtn/);
  assert.match(source, /mobileNavAuthor\.addEventListener\('click', \(\) => \{[\s\S]*openAuthorCards\(\)/);
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
  assert.match(source, /currentReaderScreen === 'video-list'\)\s*\{\s*switchListTab\('video'\);/);
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
  const readerOnly = readFile('reader.html');
  assert.match(source, /id="backupOverlay" class="screenView/);
  assert.match(source, /id="mobileNavBackup"[^>]*>バックアップ</);
  assert.match(source, /openReaderScreen\('backup'\)/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*#newBtn[\s\S]*display: none/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*#addCustomBtn[\s\S]*display: none/);
  assert.match(source, /@media \(max-width: 600px\)[\s\S]*#bulkDetectBtn[\s\S]*display: none/);
  assert.doesNotMatch(readerOnly, /id="backupExportBtn"[^>]*>バックアップ保存[\s\S]*id="mangaListSection"/);
});

test('bookshelf pagination follows the shelf content and paginates folders with items', () => {
  const source = read('reader.html');
  const runtime = read('manga-list-runtime.js');
  const viewModel = read('manga-list-view-model.js');
  assert.doesNotMatch(source, /\.bookshelf-pagination \{[^}]*position:\s*fixed/);
  assert.match(viewModel, /const folderEntries = folderCards\.map/);
  assert.match(viewModel, /const pagedEntries = folderEntries\.concat\(contentEntries\)/);
  assert.match(runtime, /context\.deriveViewModel\([\s\S]*pageSize:\s*config\.BOOKSHELF_PAGE_SIZE/);
  assert.match(runtime, /visibleFolderEntries\.forEach\(\(entry\) => frag\.appendChild\(buildFolderCard\(entry\.folder/);
  assert.match(source, /#savedListItems\.bookshelf \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[^}]*padding-bottom: calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(source, /savedListItems\.addEventListener\('touchstart'/);
  assert.match(source, /savedListItems\.addEventListener\('touchend'/);
  assert.match(source, /changeBookshelfPage\(dx < 0 \? 1 : -1\)/);
});

test('folder cards use one private operation dependency boundary without capturing mutable state', () => {
  const source = read('reader.html');
  const runtime = read('manga-list-runtime.js');
  assert.equal((source.match(/const mangaFolderCardDeps = Object\.freeze\(/g) || []).length, 1);
  const depsStart = source.indexOf('const mangaFolderCardDeps = Object.freeze(');
  const depsEnd = source.indexOf('\n  function buildFolderCard(', depsStart);
  const deps = source.slice(depsStart, depsEnd);
  assert.match(deps, /getVisibleItems: shelfVisibleItems/);
  assert.match(deps, /openItem/);
  assert.match(deps, /persistAll/);
  assert.match(deps, /persistFolders/);
  assert.match(deps, /renderSavedList/);
  assert.match(deps, /moveFolderInList/);
  assert.doesNotMatch(deps, /savedItems\s*[,=]|savedFolders\s*[,=]|currentFolderView\s*[,=]|currentSeriesView\s*[,=]|bookshelfPage\s*[,=]|localStorage|MangaVault|new Map|new Set|\[\]/);

  const buildStart = runtime.indexOf('function buildFolderCard(');
  const buildEnd = runtime.indexOf('\n    function buildBookCard(', buildStart);
  const build = runtime.slice(buildStart, buildEnd);
  assert.match(build, /context\.getVisibleItems\(\)/);
  assert.match(build, /context\.openItem\(folderItems\[0\], false\)/);
  assert.match(build, /context\.persistAll\(\)/);
  assert.match(build, /context\.renderList\(\)/);
  assert.match(build, /context\.moveFolderInList\(folder, folderList, -1\)/);
  assert.match(build, /context\.moveFolderInList\(folder, folderList, 1\)/);
  assert.equal((build.match(/context\.openItem\(folderItems\[0\], false\)/g) || []).length, 1);
  assert.equal((build.match(/context\.persistAll\(/g) || []).length, 1);
  assert.equal((build.match(/context\.moveFolderInList\(/g) || []).length, 2);
  assert.match(build, /e\.stopPropagation\(\)/);
  assert.match(build, /folder\.id === state\.recentlyClosedFolderId/);
});

test('manga list initialization has one synchronous private entry point', () => {
  const source = read('reader.html');
  assert.equal((source.match(/function initMangaList\(\)/g) || []).length, 1);
  assert.equal((source.match(/\binitMangaList\(\);/g) || []).length, 1);
  const initStart = source.indexOf('function initMangaList()');
  const initEnd = source.indexOf('\n  initMangaList();', initStart);
  const init = source.slice(initStart, initEnd);
  assert.match(init, /loadSaved\(\);\s*syncAuthorCardsFromSavedItems\(\);/);
  assert.doesNotMatch(init, /addEventListener|async|Promise|initialized|DOMContentLoaded|renderReaderScreen|renderSavedList/);

  const loadCall = source.indexOf('    loadSaved();', initStart);
  const syncCall = source.indexOf('    syncAuthorCardsFromSavedItems();', initStart);
  const entryCall = source.indexOf('  initMangaList();', initStart);
  const renderCall = source.indexOf('renderReaderScreen(getReaderScreenFromLocation());');
  assert.ok(loadCall < syncCall && syncCall < entryCall);
  assert.ok(entryCall < renderCall);
  assert.match(source, /function loadSaved\(\)\s*\{[\s\S]*?MangaListState\.load\(/);
  assert.match(source, /if \(savedItems\.length === 0\)[\s\S]*?persistItems\(\);/);
  assert.match(source, /if \(removeHistoryFolderRecord\(\)\) persistFolders\(\);/);
  assert.match(source, /savedVideos = JSON\.parse/);
});

test('manga list controller exposes only existing private boundaries', () => {
  const source = read('reader.html');
  assert.equal((source.match(/manga-list-controller\.js\?v=[^"']+/g) || []).length, 1);
  assert.equal((source.match(/MangaListControllerFactory\.create\(/g) || []).length, 1);
  assert.ok(source.indexOf('manga-list-controller.js?v=') < source.indexOf('MangaListControllerFactory.create('));
  assert.doesNotMatch(source, /const mangaListController = Object\.freeze\(/);
  assert.match(source, /const mangaListController = MangaListControllerFactory\.create\(\{[\s\S]*init:\s*initMangaList,[\s\S]*render:\s*renderSavedList,[\s\S]*open:\s*openSavedList,[\s\S]*activate\(\)\s*\{\s*switchListTab\('manga'\);\s*\}[\s\S]*getElements:\s*getMangaListElements/);
  assert.doesNotMatch(source, /window\.mangaListController|self\.mangaListController|globalThis\.mangaListController|export\s/);
});

test('manga tab activation no longer keeps the combined dependency object', () => {
  const source = read('reader.html');
  assert.doesNotMatch(source, /mangaTabActivationDeps/);
  assert.equal((source.match(/function activateMangaListTab\(\)/g) || []).length, 1);
});

test('manga surface activation uses an external factory while reader chrome stays local', () => {
  const source = read('reader.html');
  assert.equal((source.match(/manga-surface-activation\.js\?v=[^"']+/g) || []).length, 1);
  assert.equal((source.match(/MangaSurfaceActivationFactory\.create\(/g) || []).length, 1);
  assert.ok(source.indexOf('manga-surface-activation.js?v=') < source.indexOf('MangaSurfaceActivationFactory.create('));
  assert.equal((source.match(/const mangaSurfaceActivation =/g) || []).length, 1);
  assert.equal((source.match(/const readerMangaChromeDeps = Object\.freeze\(/g) || []).length, 1);
  assert.doesNotMatch(source, /mangaTabActivationDeps/);
  assert.match(source, /mangaSurfaceActivation\.activateMangaTab\(\);[\s\S]*readerMangaChromeDeps\.deactivateVideoTab\(\);[\s\S]*mangaSurfaceActivation\.activateMangaMobileNav\(\);[\s\S]*mangaSurfaceActivation\.showMangaSection\(\);[\s\S]*readerMangaChromeDeps\.hideVideoSection\(\);[\s\S]*readerMangaChromeDeps\.hideCloseButton\(\);/);
  assert.equal((source.match(/mangaSurfaceActivation\.(activateMangaTab|activateMangaMobileNav|showMangaSection)\(\);/g) || []).length, 3);
  assert.equal((source.match(/readerMangaChromeDeps\.(deactivateVideoTab|hideVideoSection|hideCloseButton)\(\);/g) || []).length, 3);
  assert.match(source, /const mangaListController = MangaListControllerFactory\.create\([\s\S]*activate\(\)\s*\{\s*switchListTab\('manga'\);/);
});

test('manga mobile navigation routes one open call through the controller', () => {
  const source = read('reader.html');
  assert.equal((source.match(/mangaListController\.open\(/g) || []).length, 1);
  assert.equal((source.match(/openSavedList\(false, false\)/g) || []).length, 0);
  const controller = source.indexOf('const mangaListController = MangaListControllerFactory.create(');
  const use = source.indexOf('mangaListController.open(false, false);');
  assert.ok(controller < use);
  assert.match(source.slice(use, use + 100), /mangaListController\.open\(false, false\); switchListTab\('manga'\)/);
});

test('manga paging routes one render call through the controller', () => {
  const source = read('reader.html');
  assert.equal((source.match(/mangaListController\.render\(\);/g) || []).length, 1);
  const changeStart = source.indexOf('function changeBookshelfPage(delta)');
  const changeEnd = source.indexOf('\n  const mangaListPaginationEvents', changeStart);
  const change = source.slice(changeStart, changeEnd);
  assert.match(change, /bookshelfPage = next;\s*mangaListController\.render\(\);/);
  assert.doesNotMatch(change, /renderSavedList\(\);/);
  assert.match(source, /MangaListControllerFactory\.create\([\s\S]*render:\s*renderSavedList/);
  assert.match(source, /manga-list-pagination-events\.js\?v=[^"']+/);
  assert.match(source, /MangaListPaginationEventsFactory\.create\(\{\s*onPageChange:\s*changeBookshelfPage/);
  assert.match(source, /mangaListPaginationEvents\.bind\(\{\s*prevButton:\s*mangaListEls\.bookshelfPrevBtn,\s*nextButton:\s*mangaListEls\.bookshelfNextBtn/);
  assert.match(source, /const cleanupMangaListPaginationEvents =/);
  assert.doesNotMatch(source, /els\.bookshelfPrevBtn\.addEventListener\('click'/);
  assert.doesNotMatch(source, /els\.bookshelfNextBtn\.addEventListener\('click'/);
});

test('manga sort routes the existing state and render order through one event boundary', () => {
  const source = read('reader.html');
  const sortStart = source.indexOf('function handleShelfSortChange(value)');
  const sortEnd = source.indexOf('\n  const mangaListSortEvents', sortStart);
  const action = source.slice(sortStart, sortEnd);
  assert.equal((source.match(/manga-list-sort-events\.js\?v=[^"']+/g) || []).length, 1);
  assert.match(source, /MangaListSortEventsFactory\.create\(\{\s*onSortChange:\s*handleShelfSortChange/);
  assert.match(source, /mangaListSortEvents\.bind\(\{\s*sortSelect:\s*els\.shelfSortSelect/);
  assert.match(source, /const cleanupMangaListSortEvents =/);
  assert.match(action, /shelfSort = value;\s*bookshelfPage = 1;\s*renderSavedList\(\);/);
  assert.doesNotMatch(source, /els\.shelfSortSelect\.addEventListener\('change'/);
});

test('manga search routes the existing input value and render order through one event boundary', () => {
  const source = read('reader.html');
  const searchStart = source.indexOf('function handleShelfSearchChange(value)');
  const searchEnd = source.indexOf('\n  const mangaListSearchEvents', searchStart);
  const action = source.slice(searchStart, searchEnd);
  assert.equal((source.match(/manga-list-search-events\.js\?v=[^"']+/g) || []).length, 1);
  assert.match(source, /MangaListSearchEventsFactory\.create\(\{\s*onSearchChange:\s*handleShelfSearchChange/);
  assert.match(source, /mangaListSearchEvents\.bind\(\{\s*searchInput:\s*els\.shelfSearchInput/);
  assert.match(source, /const cleanupMangaListSearchEvents =/);
  assert.match(action, /shelfSearchQuery = value;\s*bookshelfPage = 1;\s*renderSavedList\(\);/);
  assert.doesNotMatch(source, /els\.shelfSearchInput\.addEventListener\('input'/);
  assert.doesNotMatch(action, /trim\(|toLowerCase\(|toUpperCase\(/);
});

test('manga filter listeners call named actions without changing existing order', () => {
  const source = read('reader.html');
  const toggleStart = source.indexOf('function handleShelfFilterToggle()');
  const applyStart = source.indexOf('function handleShelfFilterApply()');
  const clearStart = source.indexOf('function handleShelfFilterClear()');
  assert.ok(toggleStart >= 0);
  assert.ok(applyStart > toggleStart);
  assert.ok(clearStart > applyStart);
  const toggle = source.slice(toggleStart, applyStart);
  const apply = source.slice(applyStart, clearStart);
  const clear = source.slice(clearStart, source.indexOf("els.zoneLeft.addEventListener('click', prevPage)", clearStart));
  assert.match(toggle, /els\.filterRow\.style\.display = els\.filterRow\.style\.display === 'none' \? 'flex' : 'none';/);
  assert.match(apply, /shelfFilters = \{ series: els\.filterSeriesInput\.value\.trim\(\), author: els\.filterAuthorInput\.value\.trim\(\), tags: els\.filterTagsInput\.value\.trim\(\), source: els\.filterSourceInput\.value\.trim\(\) \};\s*bookshelfPage = 1;\s*renderSavedList\(\);/);
  assert.match(clear, /shelfFilters = \{ series: '', author: '', tags: '', source: '' \};\s*bookshelfPage = 1;\s*els\.filterSeriesInput\.value = ''; els\.filterAuthorInput\.value = ''; els\.filterTagsInput\.value = ''; els\.filterSourceInput\.value = '';\s*renderSavedList\(\);/);
  assert.equal((source.match(/manga-list-filter-events\.js\?v=20260921-filter-events/g) || []).length, 1);
  assert.equal((source.match(/MangaListFilterEventsFactory\.create\(/g) || []).length, 1);
  assert.match(source, /onToggle: handleShelfFilterToggle/);
  assert.match(source, /onApply: handleShelfFilterApply/);
  assert.match(source, /onClear: handleShelfFilterClear/);
  assert.match(source, /mangaListFilterEvents\.bind\(\{[\s\S]*?filterButton: els\.filterBtn,[\s\S]*?applyButton: els\.applyFilterBtn,[\s\S]*?clearButton: els\.clearFilterBtn,[\s\S]*?\}\)/);
  assert.match(source, /const cleanupMangaListFilterEvents = mangaListFilterEvents\.bind/);
  assert.doesNotMatch(source, /els\.filterBtn\.addEventListener\('click', handleShelfFilterToggle\)/);
  assert.doesNotMatch(source, /els\.applyFilterBtn\.addEventListener\('click', handleShelfFilterApply\)/);
  assert.doesNotMatch(source, /els\.clearFilterBtn\.addEventListener\('click', handleShelfFilterClear\)/);
  assert.equal((source.match(/filterButton: els\.filterBtn/g) || []).length, 1);
  assert.equal((source.match(/applyButton: els\.applyFilterBtn/g) || []).length, 1);
  assert.equal((source.match(/clearButton: els\.clearFilterBtn/g) || []).length, 1);
});

test('manga smart list listeners use one callback boundary for safe static buttons', () => {
  const source = read('reader.html');
  assert.equal((source.match(/manga-list-smart-list-events\.js\?v=20260921-smart-list-events/g) || []).length, 1);
  assert.equal((source.match(/MangaListSmartListEventsFactory\.create\(/g) || []).length, 1);
  assert.match(source, /onHistory: handleHistoryListClick/);
  assert.match(source, /onUnread: handleUnreadListClick/);
  assert.match(source, /mangaListSmartListEvents\.bind\(\{[\s\S]*?historyButton: els\.historyListBtn,[\s\S]*?unreadButton: els\.unreadListBtn,[\s\S]*?\}\)/);
  assert.match(source, /const cleanupMangaListSmartListEvents = mangaListSmartListEvents\.bind/);
  assert.doesNotMatch(source, /els\.historyListBtn\.addEventListener\('click'/);
  assert.doesNotMatch(source, /els\.unreadListBtn\.addEventListener\('click'/);
  const historyStart = source.indexOf('function handleHistoryListClick()');
  const unreadStart = source.indexOf('function handleUnreadListClick()');
  assert.ok(historyStart >= 0 && unreadStart > historyStart);
  assert.match(source.slice(historyStart, unreadStart), /currentFolderView = HISTORY_FOLDER_ID;\s*currentSeriesView = null;\s*reorderMode = false;\s*renderSavedList\(\);/);
  assert.match(source.slice(unreadStart, source.indexOf('const mangaListSmartListEvents', unreadStart)), /currentFolderView = UNREAD_FOLDER_ID;\s*currentSeriesView = null;\s*reorderMode = false;\s*renderSavedList\(\);/);
});

test('manga list back navigation uses one private callback boundary', () => {
  const source = read('reader.html');
  assert.equal((source.match(/manga-list-navigation-events\.js\?v=20260921-navigation-events/g) || []).length, 1);
  assert.equal((source.match(/MangaListNavigationEventsFactory\.create\(/g) || []).length, 1);
  assert.match(source, /onBack: handleMangaListBack/);
  assert.match(source, /mangaListNavigationEvents\.bind\(\{\s*backButton: els\.listBackBtn,\s*\}\)/);
  assert.match(source, /const cleanupMangaListNavigationEvents = mangaListNavigationEvents\.bind/);
  assert.doesNotMatch(source, /els\.listBackBtn\.addEventListener\('click'/);
  const start = source.indexOf('function handleMangaListBack()');
  const end = source.indexOf('const mangaListNavigationEvents', start);
  assert.ok(start >= 0 && end > start);
  assert.match(source.slice(start, end), /if \(currentAuthorView\) \{\s*currentAuthorView = null;\s*\} else if \(currentFolderView === SERIES_FOLDER_ID && currentSeriesView\) \{\s*currentSeriesView = null;\s*\} else \{\s*currentFolderView = null;\s*currentSeriesView = null;\s*\}\s*reorderMode = false;\s*renderSavedList\(\);/);
});

test('manga folder creation listeners use named actions and one private boundary', () => {
  const source = read('reader.html');
  assert.equal((source.match(/manga-list-folder-events\.js\?v=20260921-folder-events/g) || []).length, 1);
  assert.equal((source.match(/MangaListFolderEventsFactory\.create\(/g) || []).length, 1);
  assert.match(source, /onCreateStart: handleMangaFolderCreateStart/);
  assert.match(source, /onCreateConfirm: handleMangaFolderCreateConfirm/);
  assert.match(source, /mangaListFolderEvents\.bind\(\{[\s\S]*?createButton: els\.listNewFolderBtn,[\s\S]*?confirmButton: els\.listNewFolderConfirmBtn,[\s\S]*?\}\)/);
  assert.match(source, /const cleanupMangaListFolderEvents = mangaListFolderEvents\.bind/);
  assert.doesNotMatch(source, /els\.listNewFolderBtn\.addEventListener\('click'/);
  assert.doesNotMatch(source, /els\.listNewFolderConfirmBtn\.addEventListener\('click'/);
  const start = source.indexOf('function handleMangaFolderCreateStart()');
  const confirm = source.indexOf('function handleMangaFolderCreateConfirm()');
  const boundary = source.indexOf('const mangaListFolderEvents', confirm);
  assert.ok(start >= 0 && confirm > start && boundary > confirm);
  assert.match(source.slice(start, confirm), /const showing = els\.listNewFolderRow\.style\.display === 'flex';[\s\S]*?if \(!showing\) els\.listNewFolderInput\.focus\(\);/);
  assert.match(source.slice(confirm, boundary), /const name = els\.listNewFolderInput\.value\.trim\(\);[\s\S]*?if \(!name\) return;[\s\S]*?savedFolders\.push\(\{ id: genId\('f'\), name: name \}\);[\s\S]*?persistAll\(\);[\s\S]*?renderSavedList\(\);/);
});

test('manga bulk static listeners use a callback boundary while overlay handlers stay local', () => {
  const source = read('reader.html');
  assert.equal((source.match(/manga-list-bulk-events\.js\?v=20260921-bulk-events/g) || []).length, 1);
  assert.equal((source.match(/MangaListBulkEventsFactory\.create\(/g) || []).length, 1);
  assert.match(source, /onEdit: handleMangaBulkEditClick/);
  assert.match(source, /onUndo: undoBulkEdit/);
  assert.match(source, /mangaListBulkEvents\.bind\(\{[\s\S]*?editButton: els\.bulkEditBtn,[\s\S]*?undoButton: els\.undoBulkEditBtn,[\s\S]*?\}\)/);
  assert.match(source, /const cleanupMangaListBulkEvents = mangaListBulkEvents\.bind/);
  assert.doesNotMatch(source, /els\.bulkEditBtn\.addEventListener\('click'/);
  assert.doesNotMatch(source, /els\.undoBulkEditBtn\.addEventListener\('click'/);
  assert.match(source, /els\.closeBulkEditBtn\.addEventListener\('click', closeBulkEditDialog\)/);
  assert.match(source, /els\.bulkEditOverlay\.addEventListener\('click'/);
  const start = source.indexOf('function handleMangaBulkEditClick()');
  const boundary = source.indexOf('const mangaListBulkEvents', start);
  assert.ok(start >= 0 && boundary > start);
  assert.match(source.slice(start, boundary), /if \(bulkEditMode\) openBulkEditDialog\(\);[\s\S]*?bulkEditMode = true; bulkSelectedIds\.clear\(\); updateBulkEditButton\(\); renderSavedList\(\);/);
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
  const links = read('home-profile-spa.js') + '\n' + read('links-page.js');
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
  for (const file of ['reader.html', 'home-profile-spa.js', 'local-reader.html']) {
    const source = read(file);
    assert.doesNotMatch(source, /<dialog\b|showModal\(\)/);
  }
});
