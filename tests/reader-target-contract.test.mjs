import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

function loadTarget() {
  const context = { module: { exports: {} }, URL, Date };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'reader-target.js'), 'utf8'), context);
  return context.module.exports;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('reader launch handoff is short-lived, item-addressed, and one-shot', () => {
  const target = loadTarget();
  const storage = memoryStorage();
  const item = { id: 'item-1', title: '作品', encryptedAssets: { schemaVersion: 1, pages: [] } };

  assert.equal(target.prepareLaunch(item, storage, 1000), true);
  const launch = target.readLaunch(storage, 1001);
  assert.equal(launch.itemId, 'item-1');
  assert.equal(launch.item.title, '作品');

  const consumed = target.consumeLaunch('item-1', storage, 1001);
  assert.equal(consumed.id, 'item-1');
  assert.equal(consumed.title, '作品');
  assert.equal(target.readLaunch(storage, 1001), null);
});

test('reader launch handoff rejects mismatched and stale routes', () => {
  const target = loadTarget();
  const storage = memoryStorage();

  target.prepareLaunch({ id: 'item-1', title: 'one' }, storage, 1000);
  assert.equal(target.consumeLaunch('item-2', storage, 1001), null);
  assert.equal(target.readLaunch(storage, 1001), null);

  target.prepareLaunch({ id: 'item-3', title: 'three' }, storage, 1000);
  assert.equal(target.readLaunch(storage, 1000 + target.LAUNCH_MAX_AGE_MS + 1), null);
});

test('reader launch snapshot is optional when sessionStorage cannot accept it', () => {
  const target = loadTarget();
  const brokenStorage = {
    getItem() { return null; },
    setItem() { throw new Error('quota'); },
    removeItem() {},
  };
  assert.equal(target.prepareLaunch({ id: 'item-1' }, brokenStorage, 1000), false);
});
