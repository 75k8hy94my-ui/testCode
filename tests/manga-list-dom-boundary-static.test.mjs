import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const route = read('manga-list-route.js');
const runtime = read('manga-list-runtime.js');
const mangaListTemplate = read('manga-list-template.js');

const expectedKeys = [
  'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
  'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
  'unreadListBtn', 'groupAuthorBtn', 'dashboard',
];

const expectedIds = [
  'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
  'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
  'unreadListBtn', 'groupAuthorBtn', 'dashboard',
];

test('manga list DOM references are centralized in the manga route and exclude Reader elements', () => {
  assert.match(route, /manga-list-dom-resolver\.js/);
  assert.match(route, /manga-list-elements\.js/);
  assert.match(route, /resolver: MangaListDomResolver, elementsFactory: MangaListElementsFactory/);
  assert.doesNotMatch(read('reader.html'), /manga-list-dom-resolver|manga-list-elements|manga-list-template/);
});

test('renderSavedList uses the centralized manga list DOM object', () => {
  assert.match(route, /runtime\.renderSavedList\(\)/);
  assert.match(runtime, /function renderSavedList\(direction = 0\)/);
  assert.match(runtime, /const elements = context\.getElements\(\)/);
});

test('manga list DOM boundary ids belong to the manga template and does not create fallback elements', () => {
  for (const id of expectedIds) {
    const idPattern = new RegExp(`id=["']${id}["']`, 'g');
    assert.equal((mangaListTemplate.match(idPattern) || []).length, 1, id);
  }
  assert.match(route, /manga-list-template\.js/);
  assert.match(route, /manga-list-elements\.js/);
  assert.match(route, /manga-list-dom-resolver\.js/);
  assert.doesNotMatch(read('reader.html'), /savedListOverlay|videoListSection|authorCardOverlay|settingsOverlay|backupOverlay/);
  for (const forbidden of ['videoListItems', 'videoListEmpty', 'videoLibraryApp', 'viewer', 'pageStage', 'tocOverlay', 'customAddOverlay', 'editItemOverlay', 'bulkEditOverlay', 'bulkDetectOverlay', 'authorCardOverlay']) {
    assert.doesNotMatch(mangaListTemplate, new RegExp(`\\b${forbidden}\\b`), forbidden);
  }
  assert.doesNotMatch(route, /reader-saved-list-template/);
});
