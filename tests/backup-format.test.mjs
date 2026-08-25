import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import backup from '../backup-format.js';
const { createBackup, migrateBackup } = backup;

const emptyStudy = {
  schemaVersion: 1,
  subjects: [
    { id: 'constitutional-law', name: '憲法' }, { id: 'administrative-law', name: '行政法' },
    { id: 'civil-law', name: '民法' }, { id: 'commercial-law', name: '商法' },
    { id: 'civil-procedure', name: '民事訴訟法' }, { id: 'criminal-law', name: '刑法' },
    { id: 'criminal-procedure', name: '刑事訴訟法' }, { id: 'labor-law', name: '労働法' }
  ],
  genres: [], definitions: [], recentAttempts: [], progress: {}, pendingGradings: [], pendingSyncOps: [], appliedOperationIds: [],
  gamification: { xp: 0, streak: 0, lastStudyDate: null }, preferences: { autoSpeak: false }
};

test('versioned backup round-trips author cards and supplies empty study', () => {
  const data = { folders: [{ id: 'f' }], items: [], authorCards: [{ id: 'a', name: '作者' }], theme: 'light' };
  const result = createBackup(data, '2026-08-22T00:00:00.000Z');
  assert.deepEqual(migrateBackup(result), { folders: data.folders, items: [], videos: [], authorCards: data.authorCards, mangaInfo: {}, toc: {}, lastPages: {}, theme: 'light', dashboardVisibility: { mobile: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false }, desktop: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false } }, study: emptyStudy });
});

test('backup v2 preserves study and legacy v2 without study gets an empty study', () => {
  const result = createBackup({ study: { preferences: { autoSpeak: true } } }, '2026-08-26T00:00:00Z');
  assert.equal(result.data.study.preferences.autoSpeak, true);
  const legacy = migrateBackup({ format: 'manga-reader-backup', version: 2, exportedAt: '2026-08-25T00:00:00Z', data: {} });
  assert.deepEqual(legacy.study, emptyStudy);
});

test('legacy raw payload migrates and future versions are rejected', () => {
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).authorCards, []);
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).study, emptyStudy);
  assert.throws(() => migrateBackup({ format: 'manga-reader-backup', version: 99, data: {} }));
});

test('backup and vault payload browser scripts can load together', () => {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(new URL('../vault-payload.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../backup-format.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.window.MangaVaultPayload.normalize, 'function');
  assert.equal(typeof context.window.MangaReaderBackup.createBackup, 'function');
});
