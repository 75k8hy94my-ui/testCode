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

test('imported manifest remains canonical and never invokes legacy discovery', async () => {
  let probes = 0;
  const pages = [
    'https://z2.momon-ga.me/galleries/1277143/1.webp',
    'https://z2.momon-ga.me/galleries/1277143/2.webp',
  ];
  const source = create({ legacyResolver: { resolve: async () => { probes += 1; throw new Error('legacy probe must not run'); } } });
  const result = await source.resolve({ id: 'imported', url: pages[0], pages: [...pages], pageManifest: { version: 1, pages: [...pages], splitSpreads: false } });
  assert.deepEqual(result.urls, pages);
  assert.equal(probes, 0);
});

test('pages-only legacy records remain readable without discovery', async () => {
  let probes = 0;
  const pages = ['https://example.test/book/1.jpg', 'https://example.test/book/2.jpg'];
  const source = create({ legacyResolver: { resolve: async () => { probes += 1; throw new Error('legacy probe must not run'); } } });
  const result = await source.resolve({ id: 'legacy-pages', pages });
  assert.deepEqual(result.urls, pages);
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
