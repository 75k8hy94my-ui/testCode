import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create, createLegacyResolver } = require('../reader-page-source.js');

test('saved page manifest is used directly without image loader discovery', async () => {
  let probes = 0;
  const source = create({ probe: async () => { probes++; } });
  const result = await source.resolve({ id: 'a', pages: ['one.jpg', 'two.jpg'] });
  assert.deepEqual(result.urls, ['one.jpg', 'two.jpg']);
  assert.equal(probes, 0);
});

test('legacy discovery is isolated and stores a versioned manifest once', async () => {
  const calls = [];
  const resolver = createLegacyResolver({ probe: async (url) => url.endsWith('/01.jpg') || url.endsWith('/02.jpg'), extensions: ['jpg'] });
  const source = create({ legacyResolver: resolver });
  const item = { id: 'old', url: 'https://example.test/book/01.jpg' };
  const first = await source.resolve(item);
  assert.equal(first.migrated, true);
  assert.equal(first.manifest.version, 1);
  assert.equal(first.urls.length, 2);
  const second = await source.resolve(first.item);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.urls, first.urls);
  assert.deepEqual(calls, []);
});
