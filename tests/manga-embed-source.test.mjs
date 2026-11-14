import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const source = require('../manga-source-type.js');
const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('direct images are kept in the page-based reader, even with signed query strings', () => {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp']) {
    const url = 'https://images.example.test/manga/1.' + ext + '?token=test#page';
    assert.equal(source.isDirectImageUrl(url), true);
    assert.equal(source.getEmbedUrl({ url }), '');
  }
});

test('ordinary http(s) page URLs are embedded instead of treated as image directories', () => {
  for (const url of [
    'https://example.test/gallery/123',
    'https://example.test/book/reader.html?item=1',
    'https://example.test/gallery/',
    'http://example.test/gallery?id=123',
  ]) {
    assert.equal(source.getEmbedUrl({ id: 'a', url }), url);
  }
});

test('explicit page lists and encrypted/local works keep their existing reader behavior', () => {
  const url = 'https://example.test/gallery/123';
  assert.equal(source.getEmbedUrl({ url, pages: ['https://example.test/1.webp'] }), '');
  assert.equal(source.getEmbedUrl({ url, pageManifest: { version: 1, pages: ['https://example.test/1.webp'] } }), '');
  assert.equal(source.getEmbedUrl({ url, encryptedAssets: { pages: [{}] } }), '');
  assert.equal(source.getEmbedUrl({ url, localSync: true }), '');
});

test('unsafe or malformed iframe URLs are never used', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', '//example.test/a', 'https://user:password@example.test/a', 'bad url']) {
    assert.equal(source.getEmbedUrl({ url }), '');
  }
});

test('add page, reader and bookshelf load the shared source classifier', () => {
  assert.match(read('add.html'), /src="manga-source-type\.js\?/);
  assert.match(read('reader.html'), /src="manga-source-type\.js\?/);
  assert.match(read('manga-list-route.js'), /manga-source-type\.js\?/);
});

test('reader embeds page URLs with a source-link fallback, and bookshelf avoids image probing', () => {
  assert.match(read('reader-runtime.js'), /function mountEmbeddedPage\(url\)/);
  assert.match(read('reader-runtime.js'), /MangaSourceType\?\.getEmbedUrl\(item\)/);
  assert.match(read('reader-runtime.js'), /iframe\.src = url/);
  assert.match(read('reader-runtime.js'), /openSourceBtn/);
  assert.match(read('reader.html'), /id="openSourceBtn"/);
  assert.match(read('manga-list-host-runtime.js'), /MangaSourceType\?\.getEmbedUrl/);
  assert.match(read('manga-list-host-runtime.js'), /EMBED_COVER_URL/);
});
