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

test('roppo state normalization removes malformed private data, deduplicates favorites, and caps recent items', () => {
  const recent = Array.from({ length: 60 }, (_, index) => ({ lawId: '129AC0000000089', articleKey: String(index + 1), viewedAt: `2026-09-04T00:${String(index).padStart(2, '0')}:00.000Z` }));
  const state = roppo.normalizeState({
    schemaVersion: 99,
    notes: {
      '129AC0000000089|1': { text: '基本原則', updatedAt: '2026-09-04T09:00:00.000Z' },
      'bad': { text: 42 },
      'empty': { text: '   ', updatedAt: 'x' }
    },
    favorites: ['129AC0000000089|1', '129AC0000000089|1', '', null],
    recent,
    preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089' }
  });
  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(Object.keys(state.notes), ['129AC0000000089|1']);
  assert.deepEqual(state.favorites, ['129AC0000000089|1']);
  assert.equal(state.recent.length, 50);
  assert.deepEqual(state.preferences, { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089' });
});

test('article storage keys are stable per law and article', () => {
  assert.equal(roppo.articleStorageKey('129AC0000000089', 'Article_90'), '129AC0000000089|Article_90');
});

test('article search matches article number, caption, and body text', () => {
  const articles = [
    { key: 'Article_90', number: '第九十条', caption: '公序良俗', bodyText: '公の秩序又は善良の風俗に反する法律行為は、無効とする。' },
    { key: 'Article_95', number: '第九十五条', caption: '錯誤', bodyText: '意思表示は、錯誤に基づくものであって…' }
  ];
  assert.deepEqual(roppo.searchArticles(articles, '90').map((item) => item.key), ['Article_90']);
  assert.deepEqual(roppo.searchArticles(articles, '公序良俗').map((item) => item.key), ['Article_90']);
  assert.deepEqual(roppo.searchArticles(articles, '錯誤').map((item) => item.key), ['Article_95']);
});
