import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { galleryIdFromUrl, validateUrls, create, isolatedPageLookup } = require('../reader-hitomi-source.js');
const sourceType = require('../manga-source-type.js');
const first = 'https://w2.gold-usergeneratedcontent.net/1795075201/2884/' + 'a'.repeat(64) + '.webp';
const second = 'https://a1.gold-usergeneratedcontent.net/1795075201/632/' + 'b'.repeat(64) + '.avif';

test('recognizes only supported gallery and reader URLs without a hash', () => {
  assert.equal(galleryIdFromUrl('https://hitomi.la/reader/3904373.html'), '3904373');
  assert.equal(galleryIdFromUrl('https://hitomi.la/imageset/%E3%82%B5%E3%82%A4%E3%83%B3-3904373.html'), '3904373');
  assert.equal(galleryIdFromUrl('https://www.hitomi.la/galleries/3904373.html'), '3904373');
  assert.equal(galleryIdFromUrl('https://hitomi.la/reader/3904373.html#1'), '');
  assert.equal(galleryIdFromUrl('https://hitomi.la.evil.invalid/reader/3904373.html'), '');
  assert.equal(galleryIdFromUrl('http://hitomi.la/reader/3904373.html'), '');
  assert.equal(galleryIdFromUrl('https://hitomi.la/reader/foo.html'), '');
  assert.equal(sourceType.isHitomiGalleryUrl('https://hitomi.la/reader/3904373.html'), true);
  assert.equal(sourceType.supportsPageRange('https://hitomi.la/reader/3904373.html'), true);
});

test('refuses non-CDN, malformed, duplicated or oversized image lists', () => {
  assert.deepEqual(validateUrls([first, second]), [first, second]);
  assert.throws(() => validateUrls(['https://example.com/pic.webp']), /画像URL/);
  assert.throws(() => validateUrls([first, first]), /画像URL/);
  assert.throws(() => validateUrls([]), /ページ一覧/);
  assert.throws(() => validateUrls(Array(2001).fill(first)), /ページ一覧/);
});

test('resolves pages dynamically on each call without modifying the item', async () => {
  const calls = [];
  const item = { url: 'https://hitomi.la/reader/3904373.html', pageRangeStart: 2, pageRangeEnd: 2 };
  const before = structuredClone(item);
  const resolver = create({ lookup: async (id) => { calls.push(id); return [first, second]; } });
  assert.equal(resolver.supports(item.url), true);
  assert.deepEqual(await resolver.resolve(item), [second]);
  assert.deepEqual(await resolver.resolve(item), [second]);
  assert.deepEqual(calls, ['3904373', '3904373']);
  assert.deepEqual(item, before);
  await assert.rejects(() => resolver.resolve({ ...item, pageRangeStart: 3, pageRangeEnd: 5 }), /開始ページ/);
});

test('opaque sandbox lookup accepts only its own response and cleans up', async () => {
  const messages = new Set();
  const frame = {
    contentWindow: {},
    attributes: {},
    style: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    remove() { this.removed = true; }
  };
  const win = {
    addEventListener(name, fn) { assert.equal(name, 'message'); messages.add(fn); },
    removeEventListener(name, fn) { messages.delete(fn); },
    setTimeout(fn) { this.timeout = fn; return 10; },
    clearTimeout() { this.timeout = null; }
  };
  const doc = {
    createElement(tag) { assert.equal(tag, 'iframe'); return frame; },
    body: { appendChild(value) {
      assert.equal(value, frame);
      assert.equal(value.attributes.sandbox, 'allow-scripts');
      assert.ok(!value.attributes.sandbox.includes('allow-same-origin'));
      assert.match(value.srcdoc, /ltn\.gold-usergeneratedcontent\.net/);
      assert.match(value.srcdoc, /galleries\/.*\.js/);
      queueMicrotask(() => {
        for (const cb of messages) cb({ source: frame.contentWindow, origin: 'https://evil.invalid', data: { channel: 'testcode-remote-gallery-v1', nonce: '', ok: true, data: [first] } });
        const nonce = /var nonce = "([^"]+)"/.exec(value.srcdoc)?.[1];
        for (const cb of messages) cb({ source: frame.contentWindow, origin: 'null', data: { channel: 'testcode-remote-gallery-v1', nonce, ok: true, data: [first, second] } });
      });
    } }
  };
  assert.deepEqual(await isolatedPageLookup('3904373', { documentRef: doc, windowRef: win }), [first, second]);
  assert.equal(frame.removed, true);
  assert.equal(messages.size, 0);
});

test('sandbox lookup immediately rejects an already aborted request', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => isolatedPageLookup('3904373', { signal: controller.signal }), { name: 'AbortError' });
});
