import test from 'node:test';
import assert from 'node:assert/strict';
import Status from '../index-search-sync-status.js';

const chunkA = '11111111-1111-4111-8111-111111111111';
const base = { chunkId: chunkA, revision: 1, updatedAt: 'now', deletedAt: null, payload: {}, pendingAction: null };

test('deriveChunkStatus follows deleted/conflict/syncing/error/pending/synced precedence', () => {
  assert.equal(Status.deriveChunkStatus({ record: { ...base, deletedAt: 'x' }, syncingIds: new Set(), conflicts: new Map(), errors: new Map() }), 'deleted');
  assert.equal(Status.deriveChunkStatus({ record: { ...base, pendingAction: 'upsert' }, syncingIds: new Set(), conflicts: new Map([[chunkA, {}]]), errors: new Map([[chunkA, new Error('x')]]) }), 'conflict');
  assert.equal(Status.deriveChunkStatus({ record: { ...base, pendingAction: 'upsert' }, syncingIds: new Set([chunkA]), conflicts: new Map(), errors: new Map([[chunkA, new Error('x')]]) }), 'syncing');
  assert.equal(Status.deriveChunkStatus({ record: { ...base, pendingAction: 'upsert' }, syncingIds: new Set(), conflicts: new Map(), errors: new Map([[chunkA, new Error('x')]]) }), 'error');
  assert.equal(Status.deriveChunkStatus({ record: { ...base, pendingAction: 'upsert' }, syncingIds: new Set(), conflicts: new Map(), errors: new Map() }), 'pending');
  assert.equal(Status.deriveChunkStatus({ record: base, syncingIds: new Set(), conflicts: new Map(), errors: new Map() }), 'synced');
});

test('aggregateStatus counts per-book states and prioritizes conflict then error then syncing then pending', () => {
  const result = Status.aggregateStatus(['synced', 'pending', 'conflict', 'error', 'syncing']);
  assert.equal(result.state, 'conflict');
  assert.deepEqual(result.counts, { synced: 1, pending: 1, syncing: 1, conflict: 1, error: 1, deleted: 0 });
});

test('retry backoff is exactly 2s,5s,15s,30s,30s and conflict does not schedule', () => {
  const delays = [];
  let nextId = 1;
  const controller = Status.createRetryController({
    run: async () => {},
    isOnline: () => true,
    setTimer: (_fn, ms) => { delays.push(ms); return nextId++; },
    clearTimer: () => {}
  });
  for (let i = 0; i < 5; i += 1) controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordFailure({ retryable: false, hasConflict: true });
  assert.deepEqual(delays, [2000, 5000, 15000, 30000, 30000]);
});

test('offline cancels pending retry and online requests immediate run', async () => {
  let online = true;
  let runs = 0;
  const cleared = [];
  let timerFn = null;
  const controller = Status.createRetryController({
    run: async () => { runs += 1; },
    isOnline: () => online,
    setTimer: (fn) => { timerFn = fn; return 44; },
    clearTimer: (id) => cleared.push(id)
  });
  controller.recordFailure({ retryable: true, hasConflict: false });
  online = false;
  controller.onOffline();
  assert.deepEqual(cleared, [44]);
  assert.equal(timerFn instanceof Function, true);
  online = true;
  await controller.onOnline();
  assert.equal(runs, 1);
});

test('manual request cancels delay and coalesces one extra run while active', async () => {
  let release;
  let runs = 0;
  const cleared = [];
  const run = async () => {
    runs += 1;
    if (runs === 1) await new Promise((resolve) => { release = resolve; });
  };
  const controller = Status.createRetryController({
    run,
    isOnline: () => true,
    setTimer: () => 77,
    clearTimer: (id) => cleared.push(id)
  });
  controller.recordFailure({ retryable: true, hasConflict: false });
  const first = controller.requestNow();
  const second = controller.requestNow();
  assert.deepEqual(cleared, [77]);
  release();
  await Promise.all([first, second]);
  assert.equal(runs, 2);
});

test('success resets the backoff to 2 seconds', () => {
  const delays = [];
  const controller = Status.createRetryController({
    run: async () => {}, isOnline: () => true,
    setTimer: (_fn, ms) => { delays.push(ms); return delays.length; }, clearTimer: () => {}
  });
  controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordFailure({ retryable: true, hasConflict: false });
  controller.recordSuccess();
  controller.recordFailure({ retryable: true, hasConflict: false });
  assert.deepEqual(delays, [2000, 5000, 2000]);
});
