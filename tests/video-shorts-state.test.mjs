import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const State = require('../video-shorts-state.js');

function activeQueue() {
  return [{ videoId: 'v1', startSeconds: 10, endSeconds: 40, entryType: 'random-short', tier: 1, generation: 2 }];
}

function makeState({ values = {}, guest = true, allowed = true, vault = null, now = () => 1000 } = {}) {
  const storage = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
  const api = State.create({
    storage,
    canReadProtectedData: () => allowed,
    isGuestMode: () => guest,
    vault,
    now,
    setTimeoutRef: (callback) => { callback(); return 1; },
    clearTimeoutRef() {},
  });
  return { api, storage };
}

test('normalizes queue entries and clamps index, current time, and revision safely', () => {
  const state = State.normalize({
    schemaVersion: 1,
    queue: [...activeQueue(), { videoId: '', startSeconds: -1, endSeconds: 3, entryType: 'bad', tier: 9 }],
    currentIndex: 20,
    currentTime: 80,
    knownVideoIds: ['v1', '', 'v1'],
    generation: 2,
    updatedAt: 10,
    revision: -2,
  });
  assert.deepEqual(state.queue, activeQueue());
  assert.equal(state.currentIndex, 0);
  assert.equal(state.currentTime, 40);
  assert.deepEqual(state.knownVideoIds, ['v1']);
  assert.equal(state.revision, 0);
});

test('newly observed video IDs clear the old queue and playback position exactly once', () => {
  const { api } = makeState({ values: { mangaReaderVideoShortsState: {
    schemaVersion: 1, queue: activeQueue(), currentIndex: 0, currentTime: 24,
    knownVideoIds: ['v1'], generation: 2, updatedAt: 50, revision: 3,
  } } });
  assert.equal(api.observeVideos(['v1']), false);
  assert.equal(api.load().queue.length, 1);
  assert.equal(api.observeVideos(['v1', 'v2']), true);
  assert.deepEqual(api.load().queue, []);
  assert.equal(api.load().currentIndex, 0);
  assert.equal(api.load().currentTime, 0);
  assert.equal(api.load().generation, 3);
  assert.deepEqual(api.load().knownVideoIds, ['v1', 'v2']);
  assert.equal(api.observeVideos(['v1', 'v2']), false);
});

test('rejects a stale queue snapshot without replacing a newer local revision', () => {
  const { api } = makeState({ values: { mangaReaderVideoShortsState: {
    schemaVersion: 1, queue: activeQueue(), currentIndex: 0, currentTime: 30,
    knownVideoIds: ['v1'], generation: 2, updatedAt: 500, revision: 8,
  } } });
  const stale = { ...api.load(), currentTime: 12, updatedAt: 300, revision: 4 };
  assert.equal(api.save(stale, { sync: false }).currentTime, 30);
  assert.equal(api.load().revision, 8);
});

test('accepts a newer queue revision and advances it when saving', () => {
  const { api } = makeState({ values: { mangaReaderVideoShortsState: {
    schemaVersion: 1, queue: activeQueue(), currentIndex: 0, currentTime: 30,
    knownVideoIds: ['v1'], generation: 2, updatedAt: 500, revision: 8,
  } } });
  const newer = { ...api.load(), currentTime: 24, updatedAt: 700, revision: 9 };
  const saved = api.save(newer, { sync: false });
  assert.equal(saved.currentTime, 24);
  assert.equal(saved.revision, 10);
  assert.equal(api.load().revision, 10);
});

test('signed-in writes mark Vault changes pending and schedule one background sync', async () => {
  const scheduled = [];
  let marks = 0;
  let syncs = 0;
  const storage = new Map();
  const api = State.create({
    storage,
    canReadProtectedData: () => true,
    isGuestMode: () => false,
    now: () => 100,
    vault: {
      markLocalChangesPending: () => { marks += 1; return true; },
      loadActive: () => true,
      saveLocalChanges: async () => { syncs += 1; },
    },
    setTimeoutRef: (callback) => { scheduled.push(callback); return scheduled.length; },
    clearTimeoutRef() {},
  });
  const saved = api.save({ ...api.load(), queue: activeQueue(), currentIndex: 0, currentTime: 18 }, { sync: true });
  assert.equal(saved.currentTime, 18);
  assert.equal(marks, 1);
  assert.equal(scheduled.length, 1);
  await scheduled[0]();
  assert.equal(syncs, 1);
});

test('guest reset is local-only and starts a fresh generation from the saved video IDs', () => {
  let syncs = 0;
  const { api, storage } = makeState({
    values: {
      mangaReaderVideoShortsState: { schemaVersion: 1, queue: activeQueue(), currentIndex: 0, currentTime: 30, knownVideoIds: ['old'], generation: 2, updatedAt: 100, revision: 3 },
      mangaReaderVideos: [{ id: 'v1' }, { id: 'v2' }],
    },
    guest: true,
    vault: { markLocalChangesPending: () => { syncs += 1; return true; }, saveLocalChanges: async () => { syncs += 1; } },
  });
  const reset = api.reset({ guest: true });
  assert.equal(reset.queue.length, 0);
  assert.equal(reset.currentTime, 0);
  assert.equal(reset.generation, 3);
  assert.deepEqual(reset.knownVideoIds, ['v1', 'v2']);
  assert.equal(JSON.parse(storage.get('mangaReaderVideoShortsState')).queue.length, 0);
  assert.equal(syncs, 0);
});

test('does not expose or mutate queue state when protected access is denied', () => {
  const { api, storage } = makeState({ allowed: false, values: { mangaReaderVideoShortsState: { schemaVersion: 1, queue: activeQueue(), currentIndex: 0, currentTime: 20, knownVideoIds: ['v1'], generation: 2, updatedAt: 50, revision: 3 } } });
  assert.equal(api.load(), null);
  assert.equal(api.save({ queue: [] }), null);
  assert.equal(api.reset(), null);
  assert.equal(storage.has('mangaReaderVideoShortsState'), true);
});
