import test from 'node:test';
import assert from 'node:assert/strict';
import roppo from '../roppo-data.js';

const GROUP_IDS = ['constitutional-law', 'civil-law', 'criminal-law', 'civil-procedure', 'criminal-procedure', 'administrative-law', 'company-law'];

test('roppo catalog exposes the agreed seven legal groups and replaces commercial law with company law', () => {
  assert.deepEqual(roppo.LAW_GROUPS.map((group) => group.id), GROUP_IDS);
  assert.equal(roppo.LAW_GROUPS.some((group) => group.id === 'commercial-law'), false);
  assert.equal(roppo.LAW_CATALOG['417AC0000000086'].name, '会社法');
});

test('administrative-law group contains the core administrative statutes', () => {
  const admin = roppo.LAW_GROUPS.find((group) => group.id === 'administrative-law');
  assert.deepEqual(admin.lawIds, ['405AC0000000088', '337AC0000000139', '426AC0000000068', '322AC0000000125']);
});

test('schema v1 article notes migrate to paragraph 1 while malformed data is discarded', () => {
  const state = roppo.normalizeState({
    schemaVersion: 1,
    notes: {
      '129AC0000000089|Article_95': { text: '錯誤のメモ', updatedAt: '2026-09-04T09:00:00.000Z' },
      'bad': { text: 42 }
    },
    favorites: ['129AC0000000089|Article_95', '129AC0000000089|Article_95'],
    recent: [{ lawId: '129AC0000000089', articleKey: 'Article_95', viewedAt: '2026-09-04T09:00:00.000Z' }],
    preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089' }
  });
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(state.notes, {
    '129AC0000000089|Article_95|1': { text: '錯誤のメモ', updatedAt: '2026-09-04T09:00:00.000Z' }
  });
  assert.deepEqual(state.favorites, ['129AC0000000089|Article_95']);
});

test('schema v2 paragraph notes remain paragraph scoped and recent items are capped', () => {
  const recent = Array.from({ length: 60 }, (_, index) => ({ lawId: '129AC0000000089', articleKey: `Article_${index + 1}`, viewedAt: `2026-09-04T00:${String(index).padStart(2, '0')}:00.000Z` }));
  const state = roppo.normalizeState({
    schemaVersion: 2,
    notes: {
      '129AC0000000089|Article_95|1': { text: '1項', updatedAt: '' },
      '129AC0000000089|Article_95|2': { text: '2項', updatedAt: '' }
    },
    recent,
    preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089' }
  });
  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(Object.keys(state.notes), ['129AC0000000089|Article_95|1', '129AC0000000089|Article_95|2']);
  assert.equal(state.recent.length, 50);
});

test('paragraph storage keys are stable per law article and paragraph', () => {
  assert.equal(roppo.paragraphStorageKey('129AC0000000089', 'Article_95', 2), '129AC0000000089|Article_95|2');
});

test('law data becomes stale one calendar month after last sync', () => {
  const metadata = { lastSyncedAt: '2026-08-04T12:00:00.000Z' };
  assert.equal(roppo.isLawDataStale(metadata, new Date('2026-09-04T11:59:59.000Z')), false);
  assert.equal(roppo.isLawDataStale(metadata, new Date('2026-09-04T12:00:00.000Z')), true);
  assert.equal(roppo.isLawDataStale({}, new Date('2026-09-04T12:00:00.000Z')), true);
});

test('article search matches normalized article number, official caption, and paragraph text', () => {
  const articles = [
    { key: 'Article_90', number: '第90条', caption: '公序良俗', paragraphs: [{ num: '1', text: '公の秩序又は善良の風俗に反する法律行為は、無効とする。' }], bodyText: '公の秩序又は善良の風俗に反する法律行為は、無効とする。' },
    { key: 'Article_95', number: '第95条', caption: '錯誤', paragraphs: [{ num: '1', text: '意思表示は、錯誤に基づくものであって…' }], bodyText: '意思表示は、錯誤に基づくものであって…' }
  ];
  assert.deepEqual(roppo.searchArticles(articles, '90').map((item) => item.key), ['Article_90']);
  assert.deepEqual(roppo.searchArticles(articles, '公序良俗').map((item) => item.key), ['Article_90']);
  assert.deepEqual(roppo.searchArticles(articles, '錯誤').map((item) => item.key), ['Article_95']);
});
