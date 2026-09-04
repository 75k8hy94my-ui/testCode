import test from 'node:test';
import assert from 'node:assert/strict';
import roppo from '../roppo-data.js';

const GROUP_IDS = ['constitutional-law', 'civil-law', 'criminal-law', 'civil-procedure', 'criminal-procedure', 'administrative-law', 'company-law'];
const ALL_MEMOS_VISIBLE = { requirements: true, effects: true, definitions: true, purpose: true };

test('roppo catalog exposes the agreed seven legal groups and replaces commercial law with company law', () => {
  assert.deepEqual(roppo.LAW_GROUPS.map((group) => group.id), GROUP_IDS);
  assert.equal(roppo.LAW_GROUPS.some((group) => group.id === 'commercial-law'), false);
  assert.equal(roppo.LAW_CATALOG['417AC0000000086'].name, '会社法');
});

test('administrative-law group contains the core administrative statutes', () => {
  const admin = roppo.LAW_GROUPS.find((group) => group.id === 'administrative-law');
  assert.deepEqual(admin.lawIds, ['405AC0000000088', '337AC0000000139', '426AC0000000068', '322AC0000000125']);
});

test('roppo state keeps structured paragraph notes, discards legacy text notes, and preserves global memo visibility', () => {
  const recent = Array.from({ length: 60 }, (_, index) => ({ lawId: '129AC0000000089', articleKey: String(index + 1), viewedAt: `2026-09-04T00:${String(index).padStart(2, '0')}:00.000Z` }));
  const state = roppo.normalizeState({
    schemaVersion: 2,
    notes: {
      '129AC0000000089|Article_1|P_1': { text: '旧自由記述', updatedAt: '2026-09-04T09:00:00.000Z' },
      '129AC0000000089|Article_2|P_2': { requirements: '意思表示', effects: '取消し得る', definitions: '', purpose: '表意者保護', updatedAt: '2026-09-04T10:00:00.000Z' },
      '129AC0000000089|Article_3|P_1': { requirements: ' ', effects: '', definitions: '', purpose: '' }
    },
    favorites: ['129AC0000000089|Article_1', '129AC0000000089|Article_1', '', null],
    recent,
    preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089', memoVisibility: { requirements: true, effects: false, definitions: true, purpose: false } }
  });
  assert.equal(state.schemaVersion, 3);
  assert.equal(state.notes['129AC0000000089|Article_1|P_1'], undefined);
  assert.deepEqual(state.notes['129AC0000000089|Article_2|P_2'], { requirements: '意思表示', effects: '取消し得る', definitions: '', purpose: '表意者保護', updatedAt: '2026-09-04T10:00:00.000Z' });
  assert.equal(state.notes['129AC0000000089|Article_3|P_1'], undefined);
  assert.deepEqual(state.favorites, ['129AC0000000089|Article_1']);
  assert.equal(state.recent.length, 50);
  assert.deepEqual(state.preferences, { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089', memoVisibility: { requirements: true, effects: false, definitions: true, purpose: false } });
});

test('memo visibility defaults every category to visible and survives save/load', () => {
  const state = roppo.normalizeState({ preferences: { selectedGroup: 'civil-law', selectedLawId: '129AC0000000089', memoVisibility: { requirements: false, effects: 'bad' } } });
  assert.deepEqual(state.preferences.memoVisibility, { requirements: false, effects: true, definitions: true, purpose: true });
  const storage = new Map();
  const saved = roppo.saveState(state, storage);
  assert.deepEqual(roppo.loadState(storage).preferences.memoVisibility, saved.preferences.memoVisibility);
  assert.deepEqual(roppo.normalizeState({}).preferences.memoVisibility, ALL_MEMOS_VISIBLE);
});

test('article and paragraph storage keys are stable', () => {
  assert.equal(roppo.articleStorageKey('129AC0000000089', 'Article_90'), '129AC0000000089|Article_90');
  assert.equal(roppo.paragraphStorageKey('129AC0000000089', 'Article_90', '2'), '129AC0000000089|Article_90|P_2');
});

test('article search matches article number, caption, and paragraph text', () => {
  const articles = [
    { key: 'Article_90', number: '第90条', caption: '（公序良俗）', paragraphs: [{ number: '1', text: '公の秩序又は善良の風俗に反する法律行為は、無効とする。' }] },
    { key: 'Article_95', number: '第95条', caption: '（錯誤）', paragraphs: [{ number: '1', text: '意思表示は、錯誤に基づくものであって…' }] }
  ];
  assert.deepEqual(roppo.searchArticles(articles, '90').map((item) => item.key), ['Article_90']);
  assert.deepEqual(roppo.searchArticles(articles, '公序良俗').map((item) => item.key), ['Article_90']);
  assert.deepEqual(roppo.searchArticles(articles, '意思表示').map((item) => item.key), ['Article_95']);
});

test('statutory paragraph formatting trims source indentation and preserves semantic line breaks', () => {
  assert.equal(roppo.formatParagraphText('未成年者が法律行為をするには、その法定代理人の同意を得なければならない。\n                        ただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。'), '未成年者が法律行為をするには、その法定代理人の同意を得なければならない。\nただし、単に権利を得、又は義務を免れる法律行為については、この限りでない。');
  assert.equal(roppo.formatParagraphText('被保佐人が次に掲げる行為をするには、その保佐人の同意を得なければならない。\n一\n                        \n                          元本を領収し、又は利用すること。'), '被保佐人が次に掲げる行為をするには、その保佐人の同意を得なければならない。\n一　元本を領収し、又は利用すること。');
});

test('roppo header helper hides the descriptive line and visible update date', () => {
  const sub = { hidden: false }; const dataStatus = { hidden: false };
  const doc = { querySelector: (selector) => selector === '.header .sub' ? sub : null, getElementById: (id) => id === 'dataStatus' ? dataStatus : null };
  roppo.hideHeaderMeta(doc); assert.equal(sub.hidden, true); assert.equal(dataStatus.hidden, true);
});

test('law data becomes stale exactly one calendar month after the recorded sync', () => {
  const metadata = { lastSyncedAt: '2026-08-04T12:00:00.000Z' };
  assert.equal(roppo.isLawDataStale(metadata, new Date('2026-09-04T11:59:59.000Z')), false);
  assert.equal(roppo.isLawDataStale(metadata, new Date('2026-09-04T12:00:00.000Z')), true);
  assert.equal(roppo.isLawDataStale({}, new Date('2026-09-04T12:00:00.000Z')), true);
});
