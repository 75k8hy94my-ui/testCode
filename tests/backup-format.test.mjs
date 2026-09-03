import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import backup from '../backup-format.js';
const { createBackup, migrateBackup } = backup;

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
  genres: [], definitions: [], recentAttempts: [], progress: {}, pendingGradings: [], pendingSyncOps: [], appliedOperationIds: [],
  gamification: { xp: 0, streak: 0, lastStudyDate: null }, preferences: { autoSpeak: false }
};
const indexBook = {
  schemaVersion: 1,
  book: { title: '基本民法', authors: ['著者'], subjects: ['民法'] },
  matterEntries: [{ term: '錯誤', pages: ['20'] }],
  caseEntries: [{ court:'最高裁判所', date:'1997-12-18', reporter:'民集', volume:'51', issue:'10', reportPage:'4247', citationText:'最判平成9年12月18日・民集51巻10号4247頁', pages:['30'] }],
  statuteEntries: [{ statute:'民法', article:'95', paragraph:null, item:null, citationText:'民法95条', pages:['21'] }]
};

test('backup v3 round-trips existing vault data, index settings, and portable legal index books', () => {
  const data = { folders: [{ id: 'f' }], items: [], authorCards: [{ id: 'a', name: '作者' }], theme: 'light', indexSearchSettings: { ...defaultIndexSearchSettings, activeKind:'case' } };
  const result = createBackup(data, '2026-09-04T00:00:00.000Z', [indexBook]);
  assert.equal(result.version, 3);
  assert.equal(result.indexBooks.length, 1);
  const migrated = migrateBackup(result);
  assert.deepEqual(migrated.folders, data.folders);
  assert.deepEqual(migrated.authorCards, data.authorCards);
  assert.equal(migrated.theme, 'light');
  assert.equal(migrated.indexSearchSettings.activeKind, 'case');
  assert.deepEqual(migrated.indexBooks, [indexBook]);
});

test('fresh backup defaults include the new home card, search settings, empty study and no index books', () => {
  const result = migrateBackup(createBackup({ folders: [], items: [] }, '2026-09-04T00:00:00Z'));
  assert.deepEqual(result.videoFolders, []);
  assert.deepEqual(result.videoMeta, {});
  assert.deepEqual(result.homeCards, defaultHomeCards);
  assert.deepEqual(result.study, emptyStudy);
  assert.deepEqual(result.indexSearchSettings, defaultIndexSearchSettings);
  assert.deepEqual(result.indexBooks, []);
});

test('legacy backup v2 remains importable and contains zero index books', () => {
  const legacy = migrateBackup({ format: 'manga-reader-backup', version: 2, exportedAt: '2026-08-25T00:00:00Z', data: { homeCards:['study','bookshelf'], videoFolders:[{id:'vf1'}] } });
  assert.deepEqual(legacy.homeCards, ['study','bookshelf']);
  assert.deepEqual(legacy.videoFolders, [{id:'vf1'}]);
  assert.deepEqual(legacy.indexSearchSettings, defaultIndexSearchSettings);
  assert.deepEqual(legacy.indexBooks, []);
});

test('legacy raw payload migrates with defaults and future versions are rejected', () => {
  const legacy = migrateBackup({ folders: [], items: [] });
  assert.deepEqual(legacy.authorCards, []);
  assert.deepEqual(legacy.videoFolders, []);
  assert.deepEqual(legacy.videoMeta, {});
  assert.deepEqual(legacy.homeCards, defaultHomeCards);
  assert.deepEqual(legacy.study, emptyStudy);
  assert.deepEqual(legacy.indexSearchSettings, defaultIndexSearchSettings);
  assert.deepEqual(legacy.indexBooks, []);
  assert.throws(() => migrateBackup({ format: 'manga-reader-backup', version: 99, data: {} }));
});

test('backup strips chunk ids, revisions, ciphertext and unknown index fields from portable index books', () => {
  const dirty = { ...indexBook, chunkId:'secret-chunk-id', bookId:'book-id', revision:9, payload:{ciphertext:'x'}, unknown:'x' };
  const result = createBackup({}, '2026-09-04T00:00:00Z', [dirty]);
  assert.deepEqual(result.indexBooks, [indexBook]);
  assert.equal('chunkId' in result.indexBooks[0], false);
  assert.equal('bookId' in result.indexBooks[0], false);
  assert.equal('revision' in result.indexBooks[0], false);
  assert.equal('payload' in result.indexBooks[0], false);
});

test('backup and vault payload browser scripts can load together', () => {
  const context = vm.createContext({ window: {}, console });
  vm.runInContext(fs.readFileSync(new URL('../vault-payload.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../backup-format.js', import.meta.url), 'utf8'), context);
  assert.equal(typeof context.window.MangaVaultPayload.normalize, 'function');
  assert.equal(typeof context.window.MangaReaderBackup.createBackup, 'function');
});
