import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = require('../manga-source-type.js');
const url = 'https://hitomi.la/reader/3904373.html';

test('dynamic remote galleries are not generic embedded pages', () => {
  assert.equal(source.isHitomiGalleryUrl(url), true);
  assert.equal(source.getEmbedUrl({ url }), '');
  assert.equal(source.getEmbedUrl({ url: 'https://hitomi.la/imageset/test-3904373.html' }), '');
  assert.equal(source.getEmbedUrl({ url: 'https://example.test/book.html' }), 'https://example.test/book.html');
  assert.equal(source.getEmbedUrl({ url: url + '#1' }), url + '#1');
  assert.equal(source.supportsPageRange(url), true);
  assert.equal(source.getSourceCandidates({ url })[0], url);
});

test('remote gallery covers are distinct from WEB/embed placeholders', () => {
  assert.notEqual(source.REMOTE_COVER_URL, source.EMBED_COVER_URL);
  assert.match(decodeURIComponent(source.REMOTE_COVER_URL), /外部画像リーダー/);
  assert.match(decodeURIComponent(source.EMBED_COVER_URL), /埋め込みページ/);
});
