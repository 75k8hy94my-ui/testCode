import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const root = new URL('../', import.meta.url);
function loadTarget() { const context = { module: { exports: {} }, URL }; vm.runInNewContext(fs.readFileSync(new URL('reader-target.js', root), 'utf8'), context); return context.module.exports; }
function memoryStorage(seed = {}) { const values = new Map(Object.entries(seed)); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }; }

test('item query is the sole route identity and resolves only a saved item', () => {
  const target = loadTarget();
  const item = { id: 'item-1', title: '作品' };
  const storage = memoryStorage({ mangaReaderSavedItems: JSON.stringify([item]) });
  const location = { href: 'https://example.test/reader.html?item=item-1' };
  assert.equal(target.itemIdFromLocation(location), 'item-1');
  assert.deepEqual(JSON.parse(JSON.stringify(target.resolveTarget({ locationLike: location, storage }).item)), item);
  assert.equal(target.itemIdFromLocation({ href: 'https://example.test/reader.html?url=https%3A%2F%2Fx.test%2F1.jpg' }), '');
  assert.equal(target.resolveTarget({ locationLike: { href: 'https://example.test/reader.html' }, storage }).kind, 'missing-id');
  assert.equal(target.resolveTarget({ locationLike: { href: 'https://example.test/reader.html?item=missing' }, storage }).kind, 'missing-item');
});

test('reader URL carries encoded item id and no SPA marker', () => {
  const target = loadTarget();
  assert.equal(target.buildReaderUrl('a b', 'reader.html'), 'reader.html?item=a%20b');
});

test('legacy URL target and transient launch handoff are absent', () => {
  const target = loadTarget();
  assert.equal(Object.hasOwn(target, 'prepareLaunch'), false);
  assert.equal(Object.hasOwn(target, 'readLegacyTarget'), false);
  assert.equal(Object.hasOwn(target, 'LAST_TARGET_KEY'), false);
});
