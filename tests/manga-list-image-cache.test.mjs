import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const cache = fs.readFileSync('manga-list-image-cache.js', 'utf8');
const route = fs.readFileSync('manga-list-route.js', 'utf8');

test('manga image cache exposes only the local-cover cache boundary', () => {
  assert.match(cache, /MangaListImageCacheFactory/);
  assert.match(cache, /Object\.freeze\(\{ create \}\)/);
  assert.match(cache, /loadCachedLocalImage/);
  assert.match(cache, /mangaReaderImageCache/);
  assert.match(cache, /indexedDB\.open/);
  assert.doesNotMatch(cache, /reader\.html/);
  assert.doesNotMatch(cache, /document\.getElementById|querySelector/);
});

test('manga route loads and injects the shared local-cover cache', () => {
  assert.match(route, /manga-list-image-cache\.js\?v=/);
  assert.match(route, /MangaListImageCacheFactory\.create\(/);
  assert.match(route, /loadCachedLocalImage/);
  assert.match(route, /mangaReaderStorageTransferLimitDaily/);
  assert.match(route, /mangaReaderStorageTransferUsageDaily/);
});
