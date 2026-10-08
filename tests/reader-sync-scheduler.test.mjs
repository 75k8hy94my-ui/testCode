import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { create } = require('../reader-sync-scheduler.js');

test('close-time flush immediately saves a debounced change and cancels its timer', async () => {
  const timers = new Map();
  let nextId = 0;
  const saves = [];
  const scheduler = create({
    save: async () => { saves.push('saved'); },
    canSync: () => true,
    setTimer: (fn) => { const id = ++nextId; timers.set(id, fn); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  scheduler.schedule();
  assert.equal(timers.size, 1);
  assert.equal(await scheduler.flush(), true);
  assert.deepEqual(saves, ['saved']);
  assert.equal(timers.size, 0);
  assert.equal(scheduler.hasPending(), false);
  scheduler.destroy();
});

test('a new progress change during an in-flight sync is saved in order', async () => {
  let release;
  const saves = [];
  const scheduler = create({
    save: () => { saves.push(saves.length + 1); return saves.length === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(); },
    canSync: () => true,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  scheduler.schedule();
  const firstFlush = scheduler.flush();
  await Promise.resolve();
  scheduler.schedule();
  const secondFlush = scheduler.flush();
  release();
  assert.equal(await firstFlush, true);
  assert.equal(await secondFlush, true);
  assert.deepEqual(saves, [1, 2]);
  scheduler.destroy();
});

test('failed sync remains pending and can be retried without dropping local progress', async () => {
  let attempts = 0;
  const scheduler = create({
    save: () => { if (++attempts === 1) throw new Error('remote unavailable'); },
    canSync: () => true,
    setTimer: () => 1,
    clearTimer: () => {},
  });
  scheduler.schedule();
  await assert.rejects(scheduler.flush(), /remote unavailable/);
  assert.equal(scheduler.hasPending(), true);
  assert.equal(await scheduler.flush(), true);
  assert.equal(scheduler.hasPending(), false);
  scheduler.destroy();
});

test('VPN denial prevents cloud sync and destroy cancels a pending timer', async () => {
  let allowed = true;
  const timers = new Map();
  let called = 0;
  const scheduler = create({
    save: () => { called++; },
    canSync: () => allowed,
    setTimer: (fn) => { timers.set(1, fn); return 1; },
    clearTimer: (id) => timers.delete(id),
  });
  scheduler.schedule();
  allowed = false;
  await assert.rejects(scheduler.flush(), /VPN/);
  assert.equal(called, 0);
  assert.equal(scheduler.hasPending(), true);
  allowed = true;
  assert.equal(await scheduler.flush(), true);
  scheduler.schedule();
  scheduler.destroy();
  assert.equal(timers.size, 0);
  assert.equal(called, 1);
});
