(()=>{
'use strict';

const STORAGE_KEY = 'mangaReaderRoppoState';
const MAX_RECENT = 50;
const LAW_CATALOG = Object.freeze({
  '321CONSTITUTION': Object.freeze({ id: '321CONSTITUTION', name: '日本国憲法', groupId: 'constitutional-law', lawNumber: '昭和二十一年憲法' }),
  '129AC0000000089': Object.freeze({ id: '129AC0000000089', name: '民法', groupId: 'civil-law', lawNumber: '明治二十九年法律第八十九号' }),
  '140AC0000000045': Object.freeze({ id: '140AC0000000045', name: '刑法', groupId: 'criminal-law', lawNumber: '明治四十年法律第四十五号' }),
  '408AC0000000109': Object.freeze({ id: '408AC0000000109', name: '民事訴訟法', groupId: 'civil-procedure', lawNumber: '平成八年法律第百九号' }),
  '323AC0000000131': Object.freeze({ id: '323AC0000000131', name: '刑事訴訟法', groupId: 'criminal-procedure', lawNumber: '昭和二十三年法律第百三十一号' }),
  '405AC0000000088': Object.freeze({ id: '405AC0000000088', name: '行政手続法', groupId: 'administrative-law', lawNumber: '平成五年法律第八十八号' }),
  '337AC0000000139': Object.freeze({ id: '337AC0000000139', name: '行政事件訴訟法', groupId: 'administrative-law', lawNumber: '昭和三十七年法律第百三十九号' }),
  '426AC0000000068': Object.freeze({ id: '426AC0000000068', name: '行政不服審査法', groupId: 'administrative-law', lawNumber: '平成二十六年法律第六十八号' }),
  '322AC0000000125': Object.freeze({ id: '322AC0000000125', name: '国家賠償法', groupId: 'administrative-law', lawNumber: '昭和二十二年法律第百二十五号' }),
  '417AC0000000086': Object.freeze({ id: '417AC0000000086', name: '会社法', groupId: 'company-law', lawNumber: '平成十七年法律第八十六号' })
});

const LAW_GROUPS = Object.freeze([
  Object.freeze({ id: 'constitutional-law', name: '憲法', lawIds: Object.freeze(['321CONSTITUTION']) }),
  Object.freeze({ id: 'civil-law', name: '民法', lawIds: Object.freeze(['129AC0000000089']) }),
  Object.freeze({ id: 'criminal-law', name: '刑法', lawIds: Object.freeze(['140AC0000000045']) }),
  Object.freeze({ id: 'civil-procedure', name: '民事訴訟法', lawIds: Object.freeze(['408AC0000000109']) }),
  Object.freeze({ id: 'criminal-procedure', name: '刑事訴訟法', lawIds: Object.freeze(['323AC0000000131']) }),
  Object.freeze({ id: 'administrative-law', name: '行政法', lawIds: Object.freeze(['405AC0000000088', '337AC0000000139', '426AC0000000068', '322AC0000000125']) }),
  Object.freeze({ id: 'company-law', name: '会社法', lawIds: Object.freeze(['417AC0000000086']) })
]);

const DEFAULT_STATE = Object.freeze({
  schemaVersion: 2,
  notes: Object.freeze({}),
  favorites: Object.freeze([]),
  recent: Object.freeze([]),
  preferences: Object.freeze({ selectedGroup: 'constitutional-law', selectedLawId: '321CONSTITUTION' })
});

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '').trim();
const articleKeyIsValid = (value) => typeof value === 'string' && value.split('|').length === 2 && !value.startsWith('|') && !value.endsWith('|');
const paragraphKeyIsValid = (value) => typeof value === 'string' && value.split('|').length === 3 && !value.split('|').some((part) => !part);

function normalizeState(value) {
  const source = isObject(value) ? value : {};
  const sourceVersion = Number(source.schemaVersion) || 1;
  const notes = {};
  if (isObject(source.notes)) {
    Object.entries(source.notes).forEach(([rawKey, note]) => {
      if (!isObject(note) || typeof note.text !== 'string' || !note.text.trim()) return;
      let key = rawKey;
      if (sourceVersion < 2 && articleKeyIsValid(rawKey)) key = `${rawKey}|1`;
      if (!paragraphKeyIsValid(key)) return;
      notes[key] = { text: note.text, updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : '' };
    });
  }
  const favorites = [];
  const seenFavorites = new Set();
  if (Array.isArray(source.favorites)) source.favorites.forEach((value) => {
    if (!articleKeyIsValid(value) || seenFavorites.has(value)) return;
    seenFavorites.add(value); favorites.push(value);
  });
  const recent = [];
  const seenRecent = new Set();
  if (Array.isArray(source.recent)) source.recent.forEach((entry) => {
    if (!isObject(entry)) return;
    const lawId = text(entry.lawId), articleKey = text(entry.articleKey);
    if (!LAW_CATALOG[lawId] || !articleKey) return;
    const key = `${lawId}|${articleKey}`;
    if (seenRecent.has(key)) return;
    seenRecent.add(key);
    recent.push({ lawId, articleKey, viewedAt: typeof entry.viewedAt === 'string' ? entry.viewedAt : '' });
  });
  const prefs = isObject(source.preferences) ? source.preferences : {};
  const selectedGroup = LAW_GROUPS.some((group) => group.id === prefs.selectedGroup) ? prefs.selectedGroup : DEFAULT_STATE.preferences.selectedGroup;
  const group = LAW_GROUPS.find((item) => item.id === selectedGroup);
  const selectedLawId = group && group.lawIds.includes(prefs.selectedLawId) ? prefs.selectedLawId : group.lawIds[0];
  return { schemaVersion: 2, notes, favorites, recent: recent.slice(0, MAX_RECENT), preferences: { selectedGroup, selectedLawId } };
}

function getRaw(storage, key) { return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null); }
function setRaw(storage, key, value) { if (storage.setItem) storage.setItem(key, value); else storage.set(key, value); }
function loadState(storage = globalThis.localStorage) {
  try { const raw = getRaw(storage, STORAGE_KEY); return raw == null ? normalizeState({}) : normalizeState(JSON.parse(raw)); }
  catch (_) { return normalizeState({}); }
}
function saveState(value, storage = globalThis.localStorage) {
  const normalized = normalizeState(value); setRaw(storage, STORAGE_KEY, JSON.stringify(normalized)); return normalized;
}
function articleStorageKey(lawId, articleKey) { return `${text(lawId)}|${text(articleKey)}`; }
function paragraphStorageKey(lawId, articleKey, paragraphNum) { return `${text(lawId)}|${text(articleKey)}|${text(paragraphNum) || '1'}`; }

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]+/g, '')
    .replace(/[（）()「」『』【】\[\]・,，.。]/g, '');
}
function searchArticles(articles, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return Array.isArray(articles) ? articles.slice() : [];
  if (!Array.isArray(articles)) return [];
  return articles.filter((article) => normalizeSearchText([
    article.key, article.number, article.caption, article.bodyText,
    ...(Array.isArray(article.paragraphs) ? article.paragraphs.map((paragraph) => paragraph.text) : [])
  ].filter(Boolean).join(' ')).includes(needle));
}

function addCalendarMonth(date) {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}
function isLawDataStale(metadata, now = new Date()) {
  const raw = metadata && metadata.lastSyncedAt;
  const last = raw ? new Date(raw) : null;
  if (!last || Number.isNaN(last.getTime())) return true;
  const current = now instanceof Date ? now : new Date(now);
  return current.getTime() >= addCalendarMonth(last).getTime();
}
function validateStaticLawData(value, expectedLawId = '') {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.articles) || !value.articles.length) return false;
  if (expectedLawId && value.lawId !== expectedLawId) return false;
  return value.articles.every((article) => isObject(article) && text(article.key) && text(article.number) && Array.isArray(article.paragraphs) && article.paragraphs.length && article.paragraphs.every((paragraph) => isObject(paragraph) && text(paragraph.num) && typeof paragraph.text === 'string'));
}

const api = { STORAGE_KEY, MAX_RECENT, LAW_CATALOG, LAW_GROUPS, DEFAULT_STATE, normalizeState, loadState, saveState, articleStorageKey, paragraphStorageKey, normalizeSearchText, searchArticles, isLawDataStale, validateStaticLawData };
if (typeof window !== 'undefined') window.MangaRoppo = api;
if (typeof module !== 'undefined') module.exports = api;
})();
