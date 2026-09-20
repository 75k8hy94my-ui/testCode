import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const reader = read('reader.html');
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

test('manga list DOM boundary ids exist in reader.html and does not create fallback elements', () => {
  for (const id of expectedIds) assert.match(reader + savedListTemplate, new RegExp(`id=["']${id}["']`), id);
  const boundary = reader.match(/function getMangaListElements\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.doesNotMatch(boundary, /createElement|catch|setTimeout|return\s*;\s*\}/);
});
