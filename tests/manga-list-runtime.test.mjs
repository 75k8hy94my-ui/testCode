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

test('manga route loads the list runtime while Reader has no shelf runtime dependency', () => {
  const loader = read('manga-list-dependency-loader.js');
  const reader = read('reader.html');
  assert.match(loader, /manga-list-runtime\.js\?v=/);
  assert.match(read('manga-list-route.js'), /MangaListRuntimeFactory\.create\(/);
  assert.doesNotMatch(reader, /manga-list-runtime|MangaListRuntimeFactory/);
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

test('single-item folder opening uses the same injected reader strategy', () => {
  const source = read('manga-list-runtime.js');
  const start = source.indexOf('if (folderItems.length === 1)');
  const end = source.indexOf('\n        }', start);
  const body = source.slice(start, end);
  assert.match(body, /context\.openReader\(folderItems\[0\], folderItems\);/);
  assert.doesNotMatch(body, /rememberReaderReturnView|closeSavedList|setReadingListContext|flashStatus|openItem/);
});

test('runtime no longer names reader-viewer-only opening dependencies', () => {
  const source = read('manga-list-runtime.js');
  assert.doesNotMatch(source, /rememberReaderReturnView|closeSavedList|setReadingListContext|flashStatus|openItem/);
});
