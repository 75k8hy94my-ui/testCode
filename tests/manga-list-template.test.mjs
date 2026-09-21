import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-template.js', 'utf8');
const reader = fs.readFileSync('reader.html', 'utf8');
const sharedTemplate = fs.readFileSync('reader-saved-list-template.js', 'utf8');

function loadTemplate() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-template.js' });
  return context.MangaListTemplate;
}

const requiredIds = [
  'mangaListSection', 'smartListRow', 'historyListBtn', 'unreadListBtn',
  'syncedListBtn', 'transferBudgetBtn', 'listToolbar', 'shelfSearchInput',
  'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'editShelfBtn',
  'bulkEditBtn', 'filterBtn', 'shelfSortSelect', 'groupAuthorBtn', 'dashboard',
  'filterRow', 'filterSeriesInput', 'filterAuthorInput', 'filterTagsInput',
  'filterSourceInput', 'applyFilterBtn', 'clearFilterBtn', 'listNewFolderRow',
  'listNewFolderInput', 'listNewFolderConfirmBtn', 'savedListItems',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'exportImportRow', 'newBtn',
  'addCustomBtn', 'bulkDetectBtn', 'editShelfBtn', 'undoBulkEditBtn',
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

test('reader integrates the manga template before the shared saved-list template', () => {
  assert.equal((reader.match(/manga-list-template\.js\?v=[^"']+/g) || []).length, 1);
  assert.ok(reader.indexOf('manga-list-template.js?v=') < reader.indexOf('reader-saved-list-template.js'));
  assert.equal((sharedTemplate.match(/MangaListTemplate\.createMarkup\(\)/g) || []).length, 1);
  assert.equal((sharedTemplate.match(/id="mangaListSection"/g) || []).length, 0);
  assert.match(sharedTemplate, /id="videoListSection"/);
  assert.match(sharedTemplate, /document\.body\.insertAdjacentHTML/);
});
