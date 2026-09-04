(()=>{
'use strict';
const HOME_LAYOUT_KEY = 'mangaReaderHomeCards';
const HOME_LAYOUT_STATUTES_MIGRATION_KEY = 'mangaReaderHomeCardsStatutesV1';
const DEFAULT_CARD_IDS = ['bookshelf', 'index-search', 'statutes', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];
const CARD_CATALOG = Object.freeze({
  bookshelf: Object.freeze({ id: 'bookshelf', title: '本棚', subtitle: '保存した漫画・資料を開く', kind: 'internal', href: 'reader.html#screen=saved-list', badge: 'APP' }),
  'index-search': Object.freeze({ id: 'index-search', title: '索引検索', subtitle: '教科書の事項・判例・条文索引を横断検索', kind: 'internal', href: 'index-search.html', badge: 'INDEX' }),
  statutes: Object.freeze({ id: 'statutes', title: '六法', subtitle: '主要6法の条文を読み、条文ごとにメモする', kind: 'internal', href: 'statutes.html', badge: 'LAW' }),
  study: Object.freeze({ id: 'study', title: '司法試験学習', subtitle: '科目・論証・過去問・復習', kind: 'internal', href: 'study.html', badge: 'STUDY' }),
  quiz: Object.freeze({ id: 'quiz', title: '定義クイズ', subtitle: '定義を思い出す練習を始める', kind: 'internal', href: 'study.html?view=quiz', badge: 'QUIZ' }),
  links: Object.freeze({ id: 'links', title: 'リンク管理', subtitle: '学習・資料リンクをまとめて開く', kind: 'internal', href: 'links.html', badge: 'APP' }),
  egov: Object.freeze({ id: 'egov', title: 'e-Gov 法令', subtitle: '現行法令・改正履歴を公式情報で確認', kind: 'official', href: 'https://laws.e-gov.go.jp/', badge: '公式' }),
  courts: Object.freeze({ id: 'courts', title: '裁判所 判例', subtitle: '裁判例検索・最近の最高裁判例を確認', kind: 'official', href: 'https://www.courts.go.jp/hanrei/', badge: '公式' }),
  'moj-exam': Object.freeze({ id: 'moj-exam', title: '法務省 司法試験', subtitle: '試験日程・問題・結果などの公式情報', kind: 'official', href: 'https://www.moj.go.jp/jinji/shihoushiken/jinji08_00025.html', badge: '公式' })
});
const isKnownCard = (id) => Object.prototype.hasOwnProperty.call(CARD_CATALOG, id);
function normalizeLayout(value) {
  if (!Array.isArray(value)) return DEFAULT_CARD_IDS.slice();
  const seen = new Set();
  const normalized = [];
  value.forEach((raw) => {
    const id = String(raw || '');
    if (!isKnownCard(id) || seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  if (value.length && !normalized.length) return DEFAULT_CARD_IDS.slice();
  return normalized;
}
function addCard(layout, id) {
  const normalized = normalizeLayout(layout);
  if (!isKnownCard(id) || normalized.includes(id)) return normalized;
  return normalized.concat(id);
}
function insertStatutes(layout) {
  const normalized = normalizeLayout(layout);
  if (normalized.includes('statutes')) return normalized;
  const index = normalized.indexOf('index-search');
  const result = normalized.slice();
  result.splice(index >= 0 ? index + 1 : Math.min(1, result.length), 0, 'statutes');
  return result;
}
function removeCard(layout, id) {
  return normalizeLayout(layout).filter((cardId) => cardId !== id);
}
function moveCard(layout, id, direction) {
  const normalized = normalizeLayout(layout);
  const index = normalized.indexOf(id);
  const delta = direction < 0 ? -1 : direction > 0 ? 1 : 0;
  const nextIndex = index + delta;
  if (index < 0 || !delta || nextIndex < 0 || nextIndex >= normalized.length) return normalized;
  const result = normalized.slice();
  [result[index], result[nextIndex]] = [result[nextIndex], result[index]];
  return result;
}
function hiddenCardIds(layout) {
  const visible = new Set(normalizeLayout(layout));
  return Object.keys(CARD_CATALOG).filter((id) => !visible.has(id));
}
function getRaw(storage, key) {
  return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null);
}
function setRaw(storage, key, value) {
  if (storage.setItem) storage.setItem(key, value);
  else storage.set(key, value);
}
function loadLayout(storage = globalThis.localStorage) {
  try {
    const raw = getRaw(storage, HOME_LAYOUT_KEY);
    if (raw == null) return DEFAULT_CARD_IDS.slice();
    let layout = normalizeLayout(JSON.parse(raw));
    if (getRaw(storage, HOME_LAYOUT_STATUTES_MIGRATION_KEY) !== '1') {
      layout = insertStatutes(layout);
      setRaw(storage, HOME_LAYOUT_KEY, JSON.stringify(layout));
      setRaw(storage, HOME_LAYOUT_STATUTES_MIGRATION_KEY, '1');
    }
    return layout;
  } catch (_) {
    return DEFAULT_CARD_IDS.slice();
  }
}
function saveLayout(layout, storage = globalThis.localStorage) {
  const normalized = normalizeLayout(layout);
  setRaw(storage, HOME_LAYOUT_KEY, JSON.stringify(normalized));
  setRaw(storage, HOME_LAYOUT_STATUTES_MIGRATION_KEY, '1');
  return normalized;
}
const api = { HOME_LAYOUT_KEY, HOME_LAYOUT_STATUTES_MIGRATION_KEY, DEFAULT_CARD_IDS, CARD_CATALOG, normalizeLayout, addCard, insertStatutes, removeCard, moveCard, hiddenCardIds, loadLayout, saveLayout };
if (typeof window !== 'undefined') window.MangaReaderHome = api;
if (typeof module !== 'undefined') module.exports = api;
})();
