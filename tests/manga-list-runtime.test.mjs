import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('manga list runtime module exposes the four context-aware operations', () => {
  const source = read('manga-list-runtime.js');
  const context = { self: {} };
  vm.runInNewContext(source, context, { filename: 'manga-list-runtime.js' });
  assert.deepEqual(Object.keys(context.self.MangaListRuntimeFactory), ['create']);
  const runtime = context.self.MangaListRuntimeFactory.create(new Proxy({}, { get: () => () => {} }));
  assert.deepEqual(Object.keys(runtime), [
    'renderSavedList',
    'buildBookCard',
    'buildFolderCard',
    'handleMangaCardOpen'
  ]);
  assert.equal(Object.isFrozen(context.self.MangaListRuntimeFactory), true);
  assert.equal(Object.isFrozen(runtime), true);
});

test('reader loads and delegates the four runtime implementations', () => {
  const reader = read('reader.html');
  assert.equal((reader.match(/manga-list-runtime\.js\?v=[^"']+/g) || []).length, 1);
  assert.match(reader, /MangaListRuntimeFactory\.create\(/);
  assert.doesNotMatch(reader, /function renderSavedListWithContext\(context\)/);
  assert.doesNotMatch(reader, /function buildBookCardWithContext\(context,/);
  assert.doesNotMatch(reader, /function buildFolderCardWithContext\(context,/);
  assert.doesNotMatch(reader, /function handleMangaCardOpenWithContext\(context,/);
});

test('shared runtime has no direct reader or global DOM dependency', () => {
  const source = read('manga-list-runtime.js');
  assert.doesNotMatch(source, /\b(?:window|document|mangaListEls|MangaListViewModel|MangaListRenderer|renderSavedListWithContext|buildBookCardWithContext|buildFolderCardWithContext|handleMangaCardOpenWithContext)\b/);
});

test('card opening delegates the entire reader strategy to openReader', () => {
  const source = read('manga-list-runtime.js');
  const start = source.indexOf('function handleMangaCardOpen(');
  const end = source.indexOf('\n    function buildFolderCard(', start);
  const body = source.slice(start, end);
  assert.match(body, /return context\.openReader\(item, list\);/);
  assert.doesNotMatch(body, /getReaderScreen|rememberReaderReturnView|navigateReaderScreen|switchListTab|closeSavedList|setReadingListContext|flashStatus|openItem/);
});
