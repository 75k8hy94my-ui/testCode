import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Data from '../video-data.js';
import Payload from '../vault-payload.js';

const readSource = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = readSource('video-library.js');
const migration = source.slice(source.indexOf('  let urlMigrationRunning'), source.indexOf('  function effectiveVideo'));
const { videos, videoMeta, videoMarkers, videoPropertyValues } = Payload.DATA_KEYS;

function fixture({ guest = false, duringJournal, failKey } = {}) {
  const old = { id: 'old', url: 'https://media.example/v.mp4?old', addedAt: 1 };
  const keeper = { id: 'keep', url: 'https://media.example/v.mp4?new', addedAt: 2 };
  const storage = new Map([
    [videos, JSON.stringify([old, keeper])],
    [videoMeta, JSON.stringify({ old: { title: 'Original' } })],
    [videoMarkers, JSON.stringify({ old: [{ id: 'm', seconds: 2 }] })],
    [videoPropertyValues, JSON.stringify({ old: { rating: 4 } })],
  ]);
  const journal = [];
  let attempts = 0;
  let syncs = 0;
  const errors = [];
  const localStorage = {
    setItem(key, raw) { if (key === failKey) throw new Error('quota'); storage.set(key, raw); },
    getItem(key) { return storage.get(key) ?? null; },
    removeItem(key) { storage.delete(key); },
  };
  const window = {
    MangaVaultPayload: Payload,
    TestCodeGuest: { isActive: () => guest },
    MangaVault: {
      async recordGuardedSyncDeletion(paths, validate, commit) {
        if (attempts++ === 0) await duringJournal?.(storage);
        if (!validate([])) return false;
        commit();
        journal.push(...paths);
        return true;
      },
    },
  };
  const context = vm.createContext({
    window, localStorage, Data, canReadProtectedData: () => true,
    isListMounted: () => false, loadLibraryState() {}, setStatus() {},
    scheduleVaultSync() { syncs++; },
    console: { error(_message, failure) { errors.push(failure.message); } },
  });
  vm.runInContext(readSource('browser-storage.js'), context);
  vm.runInContext(migration, context);
  return { storage, old, keeper, journal, errors, migrate: context.migrateExistingVideoUrls,
    get attempts() { return attempts; }, get syncs() { return syncs; } };
}

test('migration replans after a concurrent add, metadata edit, marker edit and property edit', async () => {
  let allowJournal;
  let journalStarted;
  const waiting = new Promise(resolve => { journalStarted = resolve; });
  const blocked = new Promise(resolve => { allowJournal = resolve; });
  const app = fixture({ duringJournal: () => { journalStarted(); return blocked; } });
  const operation = app.migrate();
  await waiting;
  const added = { id: 'added', url: 'https://media.example/added.mp4', addedAt: 3 };
  app.storage.set(videos, JSON.stringify([app.old, app.keeper, added]));
  app.storage.set(videoMeta, JSON.stringify({ old: { title: 'Edited while waiting' }, added: { favorite: true } }));
  app.storage.set(videoMarkers, JSON.stringify({ old: [{ id: 'new-marker', seconds: 9 }] }));
  app.storage.set(videoPropertyValues, JSON.stringify({ old: { rating: 8 }, added: { rating: 2 } }));
  allowJournal();
  await operation;

  assert.deepEqual(JSON.parse(app.storage.get(videos)).map(video => video.id), ['keep', 'added']);
  assert.equal(JSON.parse(app.storage.get(videoMeta)).keep.title, 'Edited while waiting');
  assert.equal(JSON.parse(app.storage.get(videoMeta)).added.favorite, true);
  assert.deepEqual(JSON.parse(app.storage.get(videoMarkers)), { keep: [{ id: 'new-marker', seconds: 9 }] });
  assert.deepEqual(JSON.parse(app.storage.get(videoPropertyValues)), { keep: { rating: 8 }, added: { rating: 2 } });
  assert.deepEqual(app.journal, ['/videos/old', '/videoMeta/old', '/videoMarkers/old', '/videoPropertyValues/old']);
  assert.equal(app.attempts, 2);
  assert.equal(app.syncs, 1);
});

test('migration never revives a keeper deleted while journal encryption was pending', async () => {
  const app = fixture({ duringJournal(storage) { storage.set(videos, JSON.stringify([app.old])); } });
  await app.migrate();

  assert.deepEqual(JSON.parse(app.storage.get(videos)), [app.old]);
  assert.deepEqual(app.journal, []);
  assert.equal(app.syncs, 0);
});

test('guest consolidation restores all four raw records on a partial write and has no journal', async () => {
  const app = fixture({ guest: true, failKey: videoMarkers });
  const before = [...app.storage];
  await app.migrate();
  assert.deepEqual([...app.storage], before);
  assert.deepEqual(app.errors, ['quota']);
  assert.deepEqual(app.journal, []);
  assert.equal(app.syncs, 0);
});

test('rollback leaves a different writer’s exact bytes intact after a later storage failure', () => {
  const values = new Map([['first', '1'], ['second', '2']]);
  const window = {};
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, raw) {
      if (key === 'second') throw new Error('quota');
      values.set(key, raw);
      if (key === 'first' && raw === '3') values.set(key, '4');
    },
    removeItem: key => values.delete(key),
  };
  vm.runInNewContext(readSource('browser-storage.js'), { window, localStorage });
  const batch = window.MangaReaderStorage;
  assert.throws(() => batch.writeBatch(batch.snapshot(['first', 'second']), [['first', 3], ['second', 5]]), /quota/);
  assert.deepEqual([...values], [['first', '4'], ['second', '2']]);
});
