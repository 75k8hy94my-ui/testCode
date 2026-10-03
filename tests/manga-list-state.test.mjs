import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../manga-list-state.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../manga-list-route.js', import.meta.url), 'utf8');
const context = {};
vm.runInNewContext(source, context);
const api = context.MangaListState;

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem() { throw new Error('write is forbidden'); },
    removeItem() { throw new Error('remove is forbidden'); }
  };
}

const keys = { savedItems: 'items', savedFolders: 'folders', authorCards: 'authors' };

test('manga list state exposes one read-only loading API without browser services', () => {
  assert.equal(typeof api?.load, 'function');
  assert.equal((source.match(/root\.MangaListState\s*=/g) || []).length, 1);
  assert.doesNotMatch(source, /document|localStorage|sessionStorage|MangaVault|MangaVaultPayload|Supabase|fetch|addEventListener|setTimeout|setItem|removeItem|clear\s*\(/);
  assert.match(route, /manga-list-state\.js\?v=/);
  assert.doesNotMatch(fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8'), /manga-list-state\.js/);
});

test('manga list state preserves stored arrays, order, and item fields without mutation', () => {
  const items = [{ id: 'i2', title: 'B', tags: ['x'] }, { id: 'i1', title: 'A' }];
  const folders = [{ id: 'f1', name: 'Folder' }];
  const authors = [{ name: 'Author' }];
  const raw = { items: JSON.stringify(items), folders: JSON.stringify(folders), authors: JSON.stringify(authors) };
  const result = api.load({ storage: storage(raw), keys });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { savedFolders: folders, savedItems: items, authorCards: authors });
  assert.deepEqual(JSON.parse(raw.items), items);
  assert.deepEqual(JSON.parse(JSON.stringify(result.savedItems.map((item) => item.id))), ['i2', 'i1']);
});

test('manga list state keeps existing empty and malformed JSON behavior', () => {
  const missing = api.load({ storage: storage(), keys });
  assert.deepEqual(JSON.parse(JSON.stringify(missing)), { savedFolders: [], savedItems: [], authorCards: [] });
  const malformed = api.load({ storage: storage({ items: '{', folders: 'null', authors: '"not-an-array"' }), keys });
  assert.equal(malformed.savedItems.length, 0);
  assert.equal(malformed.savedFolders, null);
  assert.equal(malformed.authorCards, 'not-an-array');
});

test('manga route owns list initialization and delegates data loading to state runtime', () => {
  assert.match(route, /stateRuntimeFactory: MangaListStateRuntimeFactory/);
  assert.match(route, /createStateDeps: \(\) => \(\{ load: data\.load/);
  assert.match(route, /removeHistoryFolder: \(loaded\) =>/);
  assert.match(route, /synchronizeAuthors/);
  assert.doesNotMatch(fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8'), /MangaListState|manga-list-state\.js/);
});
