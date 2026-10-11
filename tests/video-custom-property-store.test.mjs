import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../video-custom-properties.js');
const Store = require('../video-custom-property-store.js');
const definitionKey = 'mangaReaderVideoPropertyDefinitions';
const valuesKey = 'mangaReaderVideoPropertyValues';
const initial = {
  definitions: { schemaVersion: 1, properties: { rating: { id: 'rating', name: '評価', type: 'number', options: {} } } },
  values: { v1: { rating: 0 }, v2: { other: false } },
};

function vault({ marker = true, syncError = null } = {}) {
  return {
    markLocalChangesPending() { this.markCalls = (this.markCalls || 0) + 1; return marker; },
    async saveLocalChanges() { this.syncCalls = (this.syncCalls || 0) + 1; if (syncError) throw syncError; },
    async recordSyncDeletion(paths, remove) { this.deletionPaths = paths; await remove(); },
  };
}

test('pendingMarkerFailurePreventsPropertyWrites', async () => {
  const storage = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, JSON.stringify(initial.values)]]);
  const before = [...storage];
  await assert.rejects(Store.mutate({ storage, vault: vault({ marker: false }), recipe: ({ definitions, values }) => ({ definitions: { ...definitions, marker: true }, values }) }), /未同期/);
  assert.deepEqual([...storage], before);
});

test('storageFailureRollsBackBothKeys', async () => {
  const values = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, JSON.stringify(initial.values)]]);
  const before = new Map(values);
  let fail = true;
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { if (key === valuesKey && fail) { fail = false; throw new Error('quota'); } values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
  await assert.rejects(Store.mutate({ storage, vault: vault(), recipe: ({ definitions, values: current }) => ({ definitions: { ...definitions, marker: true }, values: { ...current, v1: { rating: 4 } } }) }), /quota/);
  assert.deepEqual(values, before);
});

test('syncFailureKeepsLocalValuesAndPendingState', async () => {
  const storage = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, JSON.stringify(initial.values)]]);
  const fakeVault = vault({ syncError: new Error('offline') });
  const result = await Store.mutate({ storage, vault: fakeVault, recipe: ({ definitions, values }) => ({ definitions, values: { ...values, v1: { rating: 4 } } }) });
  assert.equal(result.localSaved, true);
  assert.equal(result.synced, false);
  assert.match(result.syncError, /offline/);
  assert.equal(JSON.parse(storage.get(valuesKey)).v1.rating, 4);
  assert.equal(fakeVault.markCalls, 1);
  assert.equal(fakeVault.syncCalls, 1);
});

test('guestMutationsStayLocal', async () => {
  const storage = new Map();
  const fakeVault = vault();
  const result = await Store.mutate({ storage, guest: true, vault: fakeVault, recipe: () => ({ definitions: initial.definitions, values: initial.values }) });
  assert.equal(result.guest, true);
  assert.equal(result.synced, null);
  assert.equal(fakeVault.markCalls, undefined);
  assert.equal(fakeVault.syncCalls, undefined);
  assert.deepEqual(Store.read(storage), initial);
});

test('damagedValuesAreRetainedAndBlockTheirOwnOverwrite', async () => {
  const damaged = '{not-json';
  const storage = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, damaged]]);
  const result = await Store.mutate({ storage, guest: true, recipe: ({ definitions, values }) => ({ definitions: { ...definitions, marker: true }, values }) });
  assert.equal(result.localSaved, true);
  assert.equal(storage.get(valuesKey), damaged);
  await assert.rejects(Store.mutate({ storage, guest: true, recipe: ({ definitions, values }) => ({ definitions, values: { ...values, v1: { rating: 5 } } }) }), /元データは保持/);
  assert.equal(storage.get(valuesKey), damaged);
});

test('videoValueDeletionUsesJournalAndTombstone', async () => {
  const storage = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, JSON.stringify({ 'v1/a': initial.values.v1, v2: initial.values.v2 })]]);
  const fakeVault = vault();
  await Store.removeVideoValues({ storage, videoId: 'v1/a', vault: fakeVault, pointerPath: (collection, id) => `/${collection}/${id.replace('/', '~1')}` });
  assert.equal(fakeVault.deletionPaths, '/videoPropertyValues/v1~1a');
  assert.deepEqual(JSON.parse(storage.get(valuesKey)), { v2: { other: false } });
});

test('concurrentDifferentPropertyUpdatesKeepBothMaps', async () => {
  const storage = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, JSON.stringify({ v1: {} })]]);
  const queue = [];
  let tail = Promise.resolve();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request(_name, _options, callback) { const next = tail.then(callback); tail = next.catch(() => {}); return next; } } } });
  try {
    await Promise.all(['p1', 'p2'].map((propertyId) => Store.mutate({ storage, guest: true, recipe: async ({ definitions, values }) => {
      queue.push(propertyId);
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { definitions, values: { ...values, v1: { ...values.v1, [propertyId]: propertyId } } };
    } })));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
  assert.deepEqual(JSON.parse(storage.get(valuesKey)).v1, { p1: 'p1', p2: 'p2' });
  assert.deepEqual(queue, ['p1', 'p2']);
});

test('editorCommitWithoutPropertyChangesStaysMarkedForBackgroundSync', async () => {
  const storage = new Map([[definitionKey, JSON.stringify(initial.definitions)], [valuesKey, JSON.stringify({ v1: { rating: 0 } })]]);
  let committed = false;
  const fakeVault = vault();
  const result = await Store.mutate({
    storage, vault: fakeVault, pendingAlreadyMarked: true, sync: false,
    recipe: ({ definitions, values }) => ({ definitions, values }),
    commit: async () => { committed = true; },
  });
  assert.equal(committed, true);
  assert.equal(result.localSaved, true);
  assert.equal(result.synced, false);
  assert.equal(fakeVault.syncCalls, undefined);
});
