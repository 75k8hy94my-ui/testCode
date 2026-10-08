import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-template.js', 'utf8');
const route = fs.readFileSync('manga-list-route.js', 'utf8');

function loadTemplate() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-template.js' });
  return context.MangaListTemplate;
}

const requiredIds = [
  'mangaListSection', 'smartListRow', 'historyListBtn', 'unreadListBtn',
  'transferBudgetBtn', 'listToolbar', 'shelfSearchInput',
  'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'editShelfBtn',
  'bulkEditBtn', 'filterBtn', 'shelfSortSelect', 'groupAuthorBtn', 'dashboard',
  'filterRow', 'filterSeriesInput', 'filterAuthorInput', 'filterTagsInput',
  'filterSourceInput', 'applyFilterBtn', 'clearFilterBtn', 'listNewFolderRow',
  'listNewFolderInput', 'listNewFolderConfirmBtn', 'savedListItems',
  'mangaImportDialog', 'mangaImportRows', 'mangaImportStatus', 'mangaImportCancelButton', 'mangaImportRegisterButton',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'exportImportRow', 'newBtn',
  'bulkDetectBtn', 'editShelfBtn', 'undoBulkEditBtn',
];

test('manga list template exposes one frozen markup API without side effects', () => {
  const template = loadTemplate();
  assert.ok(template);
  assert.deepEqual(Object.keys(template), ['createMarkup']);
  assert.equal(Object.isFrozen(template), true);
  assert.equal(typeof template.createMarkup, 'function');
  assert.equal(typeof template.createMarkup(), 'string');
  assert.doesNotMatch(source, /document|window|localStorage|MangaVault|Supabase|VPN|addEventListener|insertAdjacentHTML|appendChild|setTimeout/);
});

test('manga list template contains each required id once and no non-manga surfaces', () => {
  const markup = loadTemplate().createMarkup();
  for (const id of requiredIds) {
    assert.equal((markup.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length, 1, id);
  }
  for (const excluded of [
    'videoListSection', 'videoListToolbar', 'videoListItems', 'videoListEmpty',
    'videoLibraryApp', 'videoLibrarySheet', 'videoAddOverlay', 'viewer',
    'controls', 'readProgressBar', 'pageStage', 'imgWrap', 'pageSlider',
    'tocOverlay', 'zoneLeft', 'zoneRight', 'zoneMid', 'firstBtn', 'nextBtn',
    'prevBtn', 'lastBtn', 'savedListOverlay', 'savedListPanel', 'modalOverlay',
    'mobileBottomNav',
  ]) {
    assert.doesNotMatch(markup, new RegExp(`id=["']${excluded}["']`), excluded);
  }
});

test('encrypted image entry is separate from the manga template', () => {
  const markup = loadTemplate().createMarkup();
  assert.doesNotMatch(markup, /encryptedImageAddForm|encryptedImageAddDialog|addCustomBtn/);
  assert.doesNotMatch(route, /bind\(addEncryptedImages, 'click'/);
  assert.match(fs.readFileSync('images.html','utf8'), /id="imageUploadForm"/);
  assert.match(fs.readFileSync('images.js','utf8'), /EncryptedAssetImport\.create/);
});

test('manga route mounts the manga template and Reader has no shelf template dependency', () => {
  assert.match(route, /manga-list-template\.js\?v=/);
  assert.doesNotMatch(fs.readFileSync('reader.html', 'utf8'), /manga-list-template|reader-saved-list-template/);
});

test('momon import template provides an accessible review dialog and route wires the typed bridge and batch service', () => {
  const markup = loadTemplate().createMarkup();
  assert.match(markup, /id="mangaImportDialog" role="dialog" aria-modal="true"/);
  assert.match(markup, /id="mangaImportStatus" role="status" aria-live="polite"/);
  assert.match(route, /manga-import-bridge\.js\?v=/);
  assert.match(route, /manga-import-dialog\.js\?v=/);
  assert.match(route, /manga-import-batch\.js\?v=/);
  assert.match(route, /bind\(bulkDetect, 'click'/);
  assert.match(route, /bind\(mangaImportRegister, 'click'/);
  assert.match(route, /persistItems: host\.persistItems/);
  assert.match(route, /persistAuthorCards: host\.persistAuthorCards/);
  assert.match(route, /render: renderList/);
  assert.match(route, /windowRef\.confirm\(/);
  assert.match(route, /requestQueuedCandidates\(\)/);
  assert.match(route, /importBatch\.register\(selection\)/);
  assert.match(route, /removeQueuedCandidates\(result\.registeredQueueIds\)/);
  assert.doesNotMatch(route, /localStorage\.setItem\([^)]*savedItems/);
  assert.doesNotMatch(fs.readFileSync('manga-import-dialog.js', 'utf8'), /innerHTML|insertAdjacentHTML/);
});
