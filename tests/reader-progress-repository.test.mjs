import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create } = require('../reader-progress-repository.js');
function storage(seed = {}) { const data = new Map(Object.entries(seed)); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data }; }

test('progress repository migrates legacy item progress and writes only canonical last-page map', () => {
  const local = storage(); const writes = [];
  const repo = create({ storage: local, scheduleSync: () => writes.push('sync') });
  assert.deepEqual(repo.load('book-1', { readingProgress: { page: 7, updatedAt: 20 } }), { page: 7, wasLast: false, updatedAt: 20 });
  repo.commit('book-1', 8, 10, 30);
  const map = JSON.parse(local.getItem('mangaReaderLastPage'));
  assert.equal(map['item:book-1'].page, 8);
  assert.equal(map['item:book-1'].updatedAt, 30);
  assert.equal(map['item:book-1'].wasLast, false);
  assert.deepEqual(writes, ['sync', 'sync']);
});

test('older commit cannot overwrite newer stored progress', () => {
  const local = storage({ mangaReaderLastPage: JSON.stringify({ 'item:x': { page: 9, wasLast: false, updatedAt: 50 } }) });
  const repo = create({ storage: local });
  assert.equal(repo.commit('x', 3, 9, 40), false);
  assert.equal(JSON.parse(local.getItem('mangaReaderLastPage'))['item:x'].page, 9);
});

