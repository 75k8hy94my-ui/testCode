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
  'mangaJsonImportDialog', 'mangaJsonImportRows', 'mangaJsonImportStatus', 'mangaJsonImportCancelButton', 'mangaJsonImportRegisterButton',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'exportImportRow', 'newBtn',
  'jsonImportButton', 'jsonImportFile', 'editShelfBtn', 'undoBulkEditBtn',
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

test('manga JSON import UI replaces momon bulk import and uses validated registration', () => {
  const markup = loadTemplate().createMarkup();
  assert.match(markup, /id="mangaJsonImportDialog" role="dialog" aria-modal="true"/);
  assert.match(markup, /id="mangaJsonImportStatus" role="status" aria-live="polite"/);
  assert.match(markup, /id="jsonImportFile" type="file" accept="\.json,application\/json"/);
  assert.doesNotMatch(markup, /momon:GA|bulkDetectBtn/);
  assert.match(route, /manga-json-import\.js\?v=/);
  assert.doesNotMatch(route, /manga-import-bridge\.js\?v=/);
  assert.match(route, /bind\(jsonFile, 'change'/);
  assert.match(route, /bind\(jsonRegister, 'click'/);
  assert.match(route, /persistItems: host\.persistItems/);
  assert.match(route, /persistAuthorCards: host\.persistAuthorCards/);
  assert.match(route, /render: renderList/);
  assert.match(route, /jsonController\.register\(\)/);
  assert.doesNotMatch(route, /localStorage\.setItem\([^)]*savedItems/);
  assert.doesNotMatch(fs.readFileSync('manga-json-import.js', 'utf8'), /innerHTML|insertAdjacentHTML/);
});
