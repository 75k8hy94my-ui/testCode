import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../manga-list-state.js', import.meta.url), 'utf8');
const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
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
  assert.equal((reader.match(/manga-list-state\.js\?v=20260921-state-loader/g) || []).length, 1);
  assert.ok(reader.indexOf('manga-list-state.js') < reader.indexOf('function loadSaved'));
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

test('loadSaved keeps migration, video loading, and later side effects in reader.html', () => {
  assert.match(reader, /MangaListState\.load\(\{[\s\S]*?storage:\s*localStorage/);
  assert.match(reader, /LEGACY_SAVED_URLS_KEY/);
  assert.match(reader, /removeHistoryFolderRecord\(\)/);
  assert.match(reader, /SAVED_VIDEOS_KEY/);
  assert.match(reader, /persistItems\(\)/);
  assert.match(reader, /persistFolders\(\)/);
});
