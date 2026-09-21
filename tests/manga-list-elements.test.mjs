import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-elements.js', 'utf8');
const keys = [
  'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
  'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
  'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
  'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
  'unreadListBtn', 'groupAuthorBtn', 'dashboard',
];

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-elements.js' });
  return context.MangaListElementsFactory;
}

function validSource() {
  return Object.fromEntries(keys.map((key) => [key, { id: key }]));
}

test('manga list elements factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  assert.equal(typeof factory.create, 'function');
});

test('manga list elements factory preserves the exact DOM reference contract', () => {
  const sourceObject = validSource();
  const boundary = loadFactory().create(sourceObject);
  assert.deepEqual(Object.keys(boundary), keys);
  assert.equal(Object.isFrozen(boundary), true);
  for (const key of keys) assert.equal(boundary[key], sourceObject[key], key);
  assert.equal(Object.prototype.hasOwnProperty.call(boundary, 'source'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(boundary, 'videoListSection'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(boundary, 'viewer'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(boundary, 'savedListOverlay'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(boundary, 'mobileNavManga'), false);
});

test('manga list elements factory rejects incomplete sources without fallback elements', () => {
  const factory = loadFactory();
  const typeError = (error) => error.name === 'TypeError';
  assert.throws(() => factory.create(), typeError);
  assert.throws(() => factory.create(null), typeError);
  for (const invalid of ['bad', [], 1]) assert.throws(() => factory.create(invalid), typeError);
  for (const key of keys) {
    const missing = validSource();
    delete missing[key];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key));
    for (const value of [undefined, null]) {
      const invalid = validSource();
      invalid[key] = value;
      assert.throws(() => factory.create(invalid), (error) => error.name === 'TypeError' && error.message.includes(key));
    }
  }
});

test('manga list elements factory has no DOM, storage, service, listener, or cache dependencies', () => {
  assert.doesNotMatch(source, /document|getElementById|querySelector|localStorage|sessionStorage|MangaVault|Supabase|VPN|addEventListener|setTimeout|setInterval|new Map|new Set/);
});
