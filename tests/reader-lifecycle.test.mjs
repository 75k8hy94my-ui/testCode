import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { create } = require('../reader-lifecycle.js');

test('destroy removes listeners, timers and owned resources, and is idempotent', () => {
  const removed = []; const cleared = []; const destroyed = [];
  const lifecycle = create({ clearTimeout: (id) => cleared.push(id) });
  const target = { addEventListener() {}, removeEventListener: (...args) => removed.push(args) };
  lifecycle.listen(target, 'keydown', () => {});
  lifecycle.listen(target, 'scroll', () => {});
  lifecycle.timer(15);
  lifecycle.own({ destroy: () => destroyed.push('encrypted renderer') });
  lifecycle.own({ destroy: () => destroyed.push('image loader') });
  lifecycle.destroy(); lifecycle.destroy();
  assert.equal(removed.length, 2);
  assert.deepEqual(cleared, [15]);
  assert.deepEqual(destroyed.sort(), ['encrypted renderer', 'image loader']);
});

test('async result registered with a destroyed lifecycle is disposed without use', async () => {
  const disposed = [];
  const lifecycle = create(); lifecycle.destroy();
  const resource = { destroy: () => disposed.push(true) };
  assert.equal(lifecycle.own(resource), false);
  assert.deepEqual(disposed, [true]);
});
