import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import backup from '../backup-format.js';
const { createBackup, migrateBackup } = backup;

const defaultHomeCards = ['bookshelf', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];
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

test('versioned backup round-trips author cards and supplies video library, home and study defaults', () => {
  const data = { folders: [{ id: 'f' }], items: [], authorCards: [{ id: 'a', name: '作者' }], theme: 'light' };
  const result = createBackup(data, '2026-08-22T00:00:00.000Z');
  assert.deepEqual(migrateBackup(result), { folders: data.folders, items: [], videos: [], videoFolders: [], videoMeta: {}, authorCards: data.authorCards, mangaInfo: {}, toc: {}, lastPages: {}, theme: 'light', dashboardVisibility: { mobile: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false }, desktop: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false } }, homeCards: defaultHomeCards, study: emptyStudy });
});

test('backup v2 preserves video library, home cards and study while legacy v2 gets defaults', () => {
  const result = createBackup({ videoFolders: [{ id: 'vf1', name: '動画' }], videoMeta: { v1: { favorite: true } }, homeCards: ['study', 'bookshelf'], study: { preferences: { autoSpeak: true } } }, '2026-08-26T00:00:00Z');
  assert.deepEqual(result.data.videoFolders, [{ id: 'vf1', name: '動画' }]);
  assert.deepEqual(result.data.videoMeta, { v1: { favorite: true } });
  assert.deepEqual(result.data.homeCards, ['study', 'bookshelf']);
  assert.equal(result.data.study.preferences.autoSpeak, true);
  const legacy = migrateBackup({ format: 'manga-reader-backup', version: 2, exportedAt: '2026-08-25T00:00:00Z', data: {} });
  assert.deepEqual(legacy.videoFolders, []);
  assert.deepEqual(legacy.videoMeta, {});
  assert.deepEqual(legacy.homeCards, defaultHomeCards);
  assert.deepEqual(legacy.study, emptyStudy);
});

test('legacy raw payload migrates and future versions are rejected', () => {
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).authorCards, []);
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).videoFolders, []);
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).videoMeta, {});
  assert.deepEqual(migrateBackup({ folders: [], items: [] }).homeCards, defaultHomeCards);
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
