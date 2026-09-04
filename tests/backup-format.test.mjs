import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import backup from '../backup-format.js';
const { VERSION, createBackup, migrateBackup, migrateBackupPackage } = backup;

const defaultHomeCards = ['bookshelf', 'index-search', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];
const defaultIndexSearchSettings = { matchModes: { exact: true, partial: true, and: true, fuzzy: true }, activeKind: 'all', selectedSubjects: [], selectedBookIds: [] };
const emptyStudy = {
  schemaVersion: 1,
  subjects: [
    { id: 'constitutional-law', name: '憲法' }, { id: 'administrative-law', name: '行政法' },
    { id: 'civil-law', name: '民法' }, { id: 'commercial-law', name: '商法' },
    { id: 'civil-procedure', name: '民事訴訟法' }, { id: 'criminal-law', name: '刑法' },
    { id: 'criminal-procedure', name: '刑事訴訟法' }, { id: 'labor-law', name: '労働法' }
  ],
  genres: [], definitions: [], arguments: [], argumentDrafts: {}, argumentProgress: {}, recentAttempts: [], progress: {}, pendingGradings: [], pendingSyncOps: [], appliedOperationIds: [],
  gamification: { xp: 0, streak: 0, lastStudyDate: null }, preferences: { autoSpeak: false }
};

const indexBook = {
  type: 'index-book', version: 1,
  bookId: 'book-secret-id', chunkId: 'chunk-secret-id',
  schemaVersion: 1,
  book: { title: '基本民法', authors: ['著者A'], subjects: ['民法'] },
  matterEntries: [{ term: '債権者代位権', pages: ['123'] }],
  caseEntries: [{ court: '最高裁', date: '1997-12-18', reporter: '民集', volume: '51', issue: '10', reportPage: '4247', citationText: '', pages: ['312'] }],
  statuteEntries: [{ statute: '民法', article: '423', paragraph: '', item: '', citationText: '民法423条', pages: ['205'] }]
};

test('versioned backup round-trips author cards and supplies video library, home, study and index-search defaults', () => {
  const data = { folders: [{ id: 'f' }], items: [], authorCards: [{ id: 'a', name: '作者' }], theme: 'light' };
  const result = createBackup(data, '2026-08-22T00:00:00.000Z');
  assert.equal(VERSION, 3);
  assert.deepEqual(result.indexBooks, []);
  assert.deepEqual(migrateBackup(result), { folders: data.folders, items: [], videos: [], videoFolders: [], videoMeta: {}, authorCards: data.authorCards, mangaInfo: {}, toc: {}, lastPages: {}, theme: 'light', dashboardVisibility: { mobile: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false }, desktop: { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false } }, homeCards: defaultHomeCards, study: emptyStudy, indexSearchSettings: defaultIndexSearchSettings, statuteNotes: {} });
});

test('backup v3 preserves current study arguments, drafts and argument progress', () => {
  const study = {
    ...emptyStudy,
    arguments: [{ id: 'arg-1', title: '債権者代位権', body: '論証本文' }],
    argumentDrafts: { 'arg-1': { body: '下書き' } },
    argumentProgress: { 'arg-1': { rank: 'A', updatedAt: '2026-09-04T00:00:00Z' } }
  };
  const result = createBackup({ folders: [], items: [], study }, '2026-09-04T00:00:00Z');
  assert.deepEqual(result.data.study.arguments, study.arguments);
  assert.deepEqual(result.data.study.argumentDrafts, study.argumentDrafts);
  assert.deepEqual(result.data.study.argumentProgress, study.argumentProgress);
  assert.deepEqual(migrateBackupPackage(result).data.study, study);
});

test('backup v3 preserves portable index books but strips device and sync identities', () => {
  const result = createBackup({ folders: [], items: [] }, '2026-09-04T00:00:00Z', [indexBook]);
  assert.equal(result.version, 3);
  assert.equal(result.indexBooks.length, 1);
  assert.equal(result.indexBooks[0].book.title, '基本民法');
  assert.equal(result.indexBooks[0].matterEntries[0].term, '債権者代位権');
  assert.equal('bookId' in result.indexBooks[0], false);
  assert.equal('chunkId' in result.indexBooks[0], false);
  assert.equal('type' in result.indexBooks[0], false);
  const serialized = JSON.stringify(result.indexBooks[0]);
  assert.equal(serialized.includes('book-secret-id'), false);
  assert.equal(serialized.includes('chunk-secret-id'), false);

  const migrated = migrateBackupPackage(result);
  assert.equal(migrated.indexBooks.length, 1);
  assert.deepEqual(migrated.indexBooks[0], result.indexBooks[0]);
  assert.deepEqual(migrated.data.folders, []);
});

test('backup v3 preserves portable index-search preferences but clears selected book identities', () => {
  const preferences = { matchModes: { exact: true, partial: false, and: true, fuzzy: false }, activeKind: 'case', selectedSubjects: ['民法', '民訴'], selectedBookIds: ['book-a'] };
  const expected = { ...preferences, selectedBookIds: [] };
  const result = createBackup({ folders: [], items: [], indexSearchSettings: preferences }, '2026-09-04T00:00:00Z');
  assert.deepEqual(result.data.indexSearchSettings, expected);
  assert.deepEqual(migrateBackupPackage(result).data.indexSearchSettings, expected);
});

test('reader-only migration refuses to silently discard index books from a v3 complete backup', () => {
  const result = createBackup({ folders: [], items: [] }, '2026-09-04T00:00:00Z', [indexBook]);
  assert.throws(() => migrateBackup(result), /索引検索/);
  assert.equal(migrateBackupPackage(result).indexBooks.length, 1);
});

test('backup v2 remains importable and migrates with no index books', () => {
  const legacy = migrateBackupPackage({ format: 'manga-reader-backup', version: 2, exportedAt: '2026-08-25T00:00:00Z', data: { videoFolders: [{ id: 'vf1' }], homeCards: ['study', 'bookshelf'] } });
  assert.deepEqual(legacy.indexBooks, []);
  assert.deepEqual(legacy.data.videoFolders, [{ id: 'vf1' }]);
  assert.deepEqual(legacy.data.homeCards, ['study', 'bookshelf']);
  assert.deepEqual(legacy.data.study, emptyStudy);
  assert.deepEqual(legacy.data.indexSearchSettings, defaultIndexSearchSettings);
  assert.deepEqual(legacy.data.statuteNotes, {});
});

test('legacy raw payload migrates with no index books and future versions are rejected', () => {
  const legacy = migrateBackupPackage({ folders: [], items: [] });
  assert.deepEqual(legacy.indexBooks, []);
  assert.deepEqual(legacy.data.authorCards, []);
  assert.deepEqual(legacy.data.videoFolders, []);
  assert.deepEqual(legacy.data.videoMeta, {});
  assert.deepEqual(legacy.data.homeCards, defaultHomeCards);
  assert.deepEqual(legacy.data.study, emptyStudy);
  assert.deepEqual(legacy.data.indexSearchSettings, defaultIndexSearchSettings);
  assert.deepEqual(legacy.data.statuteNotes, {});
  assert.throws(() => migrateBackupPackage({ format: 'manga-reader-backup', version: 99, data: {} }));
  assert.throws(() => migrateBackup({ format: 'manga-reader-backup', version: 99, data: {} }));
});

test('backup v3 preserves statuteNotes with tags and update timestamps', () => {
  const statuteNotes = {
    'kenpo:13': { text: '個人の尊重、幸福追求権', updatedAt: 1725400000000, tags: ['憲法', '人権'] }
  };
  const result = createBackup({ folders: [], items: [], statuteNotes }, '2026-09-04T00:00:00Z');
  assert.deepEqual(result.data.statuteNotes, statuteNotes);
  const migrated = migrateBackupPackage(result);
  assert.deepEqual(migrated.data.statuteNotes, statuteNotes);
});

test('malformed v3 indexBooks are rejected at package boundary', () => {
  assert.throws(() => migrateBackupPackage({ format: 'manga-reader-backup', version: 3, data: {}, indexBooks: {} }), /indexBooks/);
  assert.throws(() => createBackup({}, '2026-09-04T00:00:00Z', [{}]), /index book/i);
});

test('backup and vault payload browser scripts can load together', () => {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(new URL('../vault-payload.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../backup-format.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.window.MangaVaultPayload.normalize, 'function');
  assert.equal(typeof context.window.MangaReaderBackup.createBackup, 'function');
  assert.equal(typeof context.window.MangaReaderBackup.migrateBackupPackage, 'function');
});
