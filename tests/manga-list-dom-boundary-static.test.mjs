import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const reader = read('reader.html');
const mangaListTemplate = read('manga-list-template.js');
const savedListTemplate = read('reader-saved-list-template.js');

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

test('manga list DOM references are centralized without video or reader-view elements', () => {
  const match = reader.match(/function getMangaListElements\(\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(match, 'getMangaListElements must exist');
  const boundary = match[1];
  for (const key of expectedKeys) assert.match(boundary, new RegExp(`\\b${key}:`), key);
  for (const id of expectedIds) assert.match(boundary, new RegExp(`\\b${id}: els\\.${id}\\b`), id);
  for (const forbidden of ['videoListItems', 'videoListEmpty', 'viewer', 'pageStage', 'settingsOverlay', 'backupOverlay', 'tocOverlay', 'authorCardOverlay']) {
    assert.doesNotMatch(boundary, new RegExp(`\\b${forbidden}\\b`), forbidden);
  }
});

test('renderSavedList uses the centralized manga list DOM object', () => {
  const start = reader.indexOf('function renderSavedList()');
  assert.notEqual(start, -1, 'renderSavedList must exist');
  assert.match(reader, /const mangaListEls = getMangaListElements\(\);/);
  assert.match(reader.slice(start, start + 16000), /mangaListEls/);
});

test('manga list DOM boundary ids belong to the manga template and does not create fallback elements', () => {
  for (const id of expectedIds) {
    const idPattern = new RegExp(`id=["']${id}["']`, 'g');
    assert.equal((mangaListTemplate.match(idPattern) || []).length, 1, id);
  }
  assert.match(reader, /manga-list-template\.js/);
  assert.match(reader, /reader-saved-list-template\.js/);
  assert.ok(reader.indexOf('manga-list-template.js') < reader.indexOf('reader-saved-list-template.js'));
  assert.equal((savedListTemplate.match(/MangaListTemplate\.createMarkup\(\)/g) || []).length, 1);
  assert.doesNotMatch(savedListTemplate, /id=["']mangaListSection["']/);
  assert.match(savedListTemplate, /id=["']savedListOverlay["']/);
  assert.match(savedListTemplate, /id=["']savedListPanel["']/);
  assert.match(savedListTemplate, /id=["']videoListSection["']/);
  for (const forbidden of ['videoListItems', 'videoListEmpty', 'videoLibraryApp', 'viewer', 'pageStage', 'tocOverlay', 'customAddOverlay', 'editItemOverlay', 'bulkEditOverlay', 'bulkDetectOverlay', 'authorCardOverlay']) {
    assert.doesNotMatch(mangaListTemplate, new RegExp(`\\b${forbidden}\\b`), forbidden);
  }
  const boundary = reader.match(/function getMangaListElements\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.doesNotMatch(boundary, /createElement|catch|setTimeout|return\s*;\s*\}/);
});
