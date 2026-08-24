import test from 'node:test';
import assert from 'node:assert/strict';
import payload from '../vault-payload.js';
const { DATA_KEYS, normalize, buildFromLocalStorage: buildFromStorage, applyToLocalStorage: applyToStorage } = payload;

test('normalizes legacy payload without authorCards', () => {
  const value = normalize({ folders: [{ id: 'f1' }], items: [{ id: 'i1' }] });
  assert.deepEqual(value, { folders: [{ id: 'f1' }], items: [{ id: 'i1' }], videos: [], authorCards: [], mangaInfo: {}, toc: {}, lastPages: {}, theme: 'dark', dashboardVisibility: { mobile: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false }, desktop: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false } } });
});

test('build and apply preserve every vault field', () => {
  const input = { folders: [{ id: 'f1' }], items: [{ id: 'i1' }], videos: [{ id: 'v1' }], authorCards: [{ id: 'a1', name: '作者' }], mangaInfo: { a: { count: 10 } }, toc: { a: [{ page: 1 }] }, lastPages: { a: { page: 3 } }, theme: 'light', dashboardVisibility: { mobile: { continue: true, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false }, desktop: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: true, favorites: false } } };
  const storage = new Map();
  applyToStorage(input, storage);
  assert.deepEqual(buildFromStorage(storage), input);
  assert.equal(DATA_KEYS.authorCards, 'mangaReaderAuthorCards');
  assert.equal(DATA_KEYS.dashboardVisibility, 'mangaReaderDashboardVisibility');
});

test('apply rolls back all device keys when storage fails partway through', () => {
  const values = new Map([
    ['mangaReaderSavedFolders', JSON.stringify([{ id: 'old-folder' }])],
    ['mangaReaderSavedItems', JSON.stringify([{ id: 'old-item' }])],
  ]);
  let writes = 0;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes += 1; if (writes === 2) throw new Error('quota'); values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  assert.throws(() => payload.applyToLocalStorage({ folders: [{ id: 'new-folder' }], items: [{ id: 'new-item' }] }, storage), /quota/);
  assert.deepEqual(JSON.parse(values.get('mangaReaderSavedFolders')), [{ id: 'old-folder' }]);
  assert.deepEqual(JSON.parse(values.get('mangaReaderSavedItems')), [{ id: 'old-item' }]);
});
