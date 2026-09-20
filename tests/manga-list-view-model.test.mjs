import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const source = fs.existsSync(new URL('../manga-list-view-model.js', import.meta.url)) ? read('manga-list-view-model.js') : '';
const context = {};
if (source) vm.runInNewContext(source, context);
const derive = context.MangaListViewModel?.derive;
const reader = read('reader.html');

const ids = { favorites: 'favorites', unread: 'unread', synced: 'synced', history: 'history', series: 'series' };
const items = [
  { id: 'a', title: 'Beta', folderId: 'folder', addedAt: 1, author: 'A', tags: ['x'] },
  { id: 'b', title: 'Alpha', folderId: 'folder', addedAt: 2, author: 'B', tags: ['y'] },
  { id: 'c', title: 'Gamma', folderId: 'other', addedAt: 3, author: 'A', localSync: true, tags: [] }
];
const input = () => ({
  items, folders: [{ id: 'folder', name: 'Folder' }, { id: 'other', name: 'Other' }], authorCards: [], videos: [],
  folderView: 'folder', seriesView: '', authorView: '', filters: { series: '', author: '', tags: '', source: '' },
  searchQuery: '', sort: 'addedAt', reorderMode: false, groupByAuthor: false, bulkEditMode: false,
  page: 1, pageSize: 2, ids, searchText: (item) => `${item.title} ${(item.tags || []).join(' ')}`,
  title: (item) => item.title, unreadItems: items
});

test('view model exposes one pure derive API and does not mutate inputs', () => {
  assert.equal(typeof derive, 'function');
  const before = JSON.stringify(items);
  const result = derive(input());
  assert.equal(JSON.stringify(items), before);
  assert.deepEqual(Array.from(result.visibleItems, (item) => item.id), ['b', 'a']);
  assert.equal(result.totalPages, 1);
});

test('reorder mode preserves source order while ordinary sorting remains available', () => {
  const ordinary = derive({ ...input(), sort: 'title-asc' });
  const manual = derive({ ...input(), sort: 'title-asc', reorderMode: true });
  assert.deepEqual(Array.from(ordinary.itemsList, (item) => item.id), ['b', 'a']);
  assert.deepEqual(Array.from(manual.itemsList, (item) => item.id), ['a', 'b']);
});

test('view model filters folders, search, and pages without duplication', () => {
  const result = derive({ ...input(), searchQuery: 'Alpha', pageSize: 1, page: 9 });
  assert.deepEqual(Array.from(result.itemsList, (item) => item.id), ['b']);
  assert.deepEqual(Array.from(result.visibleItems, (item) => item.id), ['b']);
  assert.equal(result.normalizedPage, 1);
  assert.equal(new Set(result.visibleItems.map((item) => item.id)).size, result.visibleItems.length);
});

test('view model is pure and loaded once before the reader inline script', () => {
  assert.equal((reader.match(/manga-list-view-model\.js\?v=20260921-view-model-self/g) || []).length, 1);
  assert.ok(reader.indexOf('manga-list-view-model.js') < reader.indexOf('function renderSavedList'));
  assert.doesNotMatch(source, /\b(document|window|localStorage|sessionStorage|MangaVault|Supabase|fetch|setTimeout|addEventListener)\b/);
  assert.equal((source.match(/root\.MangaListViewModel\s*=/g) || []).length, 1);
});
