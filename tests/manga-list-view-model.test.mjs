import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const source = fs.existsSync(new URL('../manga-list-view-model.js', import.meta.url)) ? read('manga-list-view-model.js') : '';
const context = {};
if (source) vm.runInNewContext(source, context);
const derive = context.MangaListViewModel?.derive;
const route = read('manga-list-route.js');

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

test('view model is pure and loaded by the manga route runtime', () => {
  assert.match(route, /manga-list-view-model\.js\?v=/);
  assert.doesNotMatch(read('reader.html'), /manga-list-view-model|MangaListViewModel/);
  assert.doesNotMatch(source, /\b(document|window|localStorage|sessionStorage|MangaVault|Supabase|fetch|setTimeout|addEventListener)\b/);
  assert.equal((source.match(/root\.MangaListViewModel\s*=/g) || []).length, 1);
});


test('root bookshelf paginates pinned cards, folders, and works in one 25-card budget', () => {
  const shelf = Array.from({ length: 48 }, (_, n) => ({
    id: 'work-' + n, title: 'Work ' + n, addedAt: n, tags: [],
  }));
  const options = {
    ...input(), items: shelf, folderView: null,
    pageSize: 25, page: 1,
  };
  const first = derive(options);
  const second = derive({ ...options, page: 2 });
  const third = derive({ ...options, page: 3 });
  const entries = [...first.visibleEntries, ...second.visibleEntries, ...third.visibleEntries];
  assert.equal(first.totalPages, 3, '2 shortcuts + 2 folders + 48 works = 52 cards');
  assert.equal(first.visibleEntries.length, 25);
  assert.equal(second.visibleEntries.length, 25);
  assert.equal(third.visibleEntries.length, 2);
  assert.deepEqual(Array.from(first.visibleEntries.slice(0, 4), (x) => x.type),
    ['favorites', 'series', 'folder', 'folder']);
  assert.equal(entries.filter((x) => x.type === 'favorites').length, 1);
  assert.equal(entries.filter((x) => x.type === 'series').length, 1);
  assert.equal(entries.filter((x) => x.type === 'folder').length, 2);
  assert.equal(new Set(entries.filter((x) => x.type === 'item').map((x) => x.item.id)).size, 48);
});

test('series folders are paginated and are never repeated on every page', () => {
  const shelf = Array.from({ length: 19 }, (_, n) => ({
    id: 'series-' + n, title: 'Volume ' + n, series: 'Series ' + String(n).padStart(2, '0'),
    volume: 1, addedAt: n,
  }));
  const options = { ...input(), items: shelf, folderView: ids.series, seriesView: '',
    pageSize: 6, page: 1 };
  const pages = Array.from({ length: 4 }, (_, n) => derive({ ...options, page: n + 1 }));
  assert.ok(pages.every((x) => x.totalPages === 4));
  assert.deepEqual(pages.map((x) => x.visibleEntries.length), [6, 6, 6, 1]);
  assert.equal(new Set(pages.flatMap((x) => Array.from(x.visibleSeriesGroups, (g) => g.name))).size, 19);
  assert.ok(pages.every((x) => x.visibleEntries.every((e) => e.type === 'series-group')));
});

test('author-group cards and ungrouped works share a single pagination budget', () => {
  const shelf = [
    ...Array.from({ length: 10 }, (_, n) => ({
      id: 'author-' + n, title: 'A' + n, author: 'Author ' + n, folderId: 'folder', addedAt: n,
    })),
    ...Array.from({ length: 3 }, (_, n) => ({
      id: 'plain-' + n, title: 'P' + n, folderId: 'folder', addedAt: n + 100,
    })),
  ];
  const opts = { ...input(), items: shelf, groupByAuthor: true, pageSize: 5 };
  const pages = [1, 2, 3].map((page) => derive({ ...opts, page }));
  const entries = pages.flatMap((x) => x.visibleEntries);
  assert.ok(pages.every((x) => x.totalPages === 3));
  assert.deepEqual(pages.map((x) => x.visibleEntries.length), [5, 5, 3]);
  assert.equal(entries.filter((x) => x.type === 'author-group').length, 10);
  assert.equal(entries.filter((x) => x.type === 'item').length, 3);
  assert.equal(new Set(entries.map((x) => x.type === 'author-group' ? x.group.name : x.item.id)).size, 13);
  assert.equal(derive({ ...opts, page: 99 }).normalizedPage, 3);
});

test('mobile page navigation remains visible and all cards render from one page slice', () => {
  const css = read('manga-list.css');
  const runtime = read('manga-list-runtime.js');
  const route = read('manga-list-route.js');
  assert.doesNotMatch(css, /\.bookshelfPagerButton\s*\{\s*display:\s*none/);
  assert.match(css, /\.bookshelfPagerButton\s*\{\s*display:\s*inline-block/);
  assert.match(runtime, /items:\s*visibleEntries/);
  assert.match(runtime, /entry\.type === 'series-group'/);
  assert.match(runtime, /entry\.type === 'author-group'/);
  assert.match(runtime, /elements\.savedListItems\.appendChild\(elements\.bookshelfPagination\)/);
  assert.match(route, /onPageChange: \(delta\) => \{[\s\S]*scrollIntoView/);
});
