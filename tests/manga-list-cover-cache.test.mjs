import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CacheFactory = require('../manga-list-cover-cache.js');

test('cover source cache reuses successful sources and refreshes their LRU order', () => {
  const cache = CacheFactory.create({ maxSources: 2 });
  cache.rememberSource('book-1', 'https://img.test/one.jpg');
  cache.rememberSource('book-2', 'https://img.test/two.jpg');
  assert.equal(cache.getSource('book-1'), 'https://img.test/one.jpg');
  cache.rememberSource('book-3', 'https://img.test/three.jpg');
  assert.equal(cache.getSource('book-2'), '');
  assert.equal(cache.getSource('book-1'), 'https://img.test/one.jpg');
});

test('local cover object URLs are reused and revoked when the protected cache clears', () => {
  const revoked = [];
  const cache = CacheFactory.create({ urlApi: { revokeObjectURL(url) { revoked.push(url); } } });
  cache.rememberLocalCover('user-1|cover/a.jpg', 'blob:cover-a');
  assert.equal(cache.getLocalCover('user-1|cover/a.jpg'), 'blob:cover-a');
  cache.clear();
  assert.equal(cache.getLocalCover('user-1|cover/a.jpg'), '');
  assert.deepEqual(revoked, ['blob:cover-a']);
});

test('the protected cache clears cover sources as well as object URLs', () => {
  const cache = CacheFactory.create();
  cache.rememberSource('book-1', 'https://private.test/cover.jpg');
  cache.clear();
  assert.equal(cache.getSource('book-1'), '');
  assert.deepEqual(cache.snapshot(), { sources: 0, localCovers: 0 });
});
