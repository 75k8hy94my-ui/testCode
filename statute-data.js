(() => {
'use strict';

const LAW_CATALOG = Object.freeze([
  Object.freeze({ id: 'constitution', title: '憲法', shortTitle: '憲法', lawId: '321CONSTITUTION' }),
  Object.freeze({ id: 'civil', title: '民法', shortTitle: '民法', lawId: '129AC0000000089' }),
  Object.freeze({ id: 'companies', title: '会社法', shortTitle: '会社法', lawId: '417AC0000000086' }),
  Object.freeze({ id: 'penal', title: '刑法', shortTitle: '刑法', lawId: '140AC0000000045' }),
  Object.freeze({ id: 'civil-procedure', title: '民事訴訟法', shortTitle: '民訴法', lawId: '408AC0000000109' }),
  Object.freeze({ id: 'criminal-procedure', title: '刑事訴訟法', shortTitle: '刑訴法', lawId: '323AC0000000131' })
]);

const DB_NAME = 'manga-reader-statutes';
const DB_VERSION = 1;
const STORE_NAME = 'laws';
const API_BASE = 'https://laws.e-gov.go.jp/api/1/lawdata/';

function toAsciiDigits(value) {
  return String(value ?? '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10));
}

const KANJI_DIGITS = Object.freeze({ '〇':0, '零':0, '一':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9 });
const KANJI_UNITS = Object.freeze({ '十':10, '百':100, '千':1000 });
function kanjiNumberToInt(value) {
  const text = String(value || '');
  if (!text || !/^[〇零一二三四五六七八九十百千]+$/.test(text)) return null;
  if (![...text].some((char) => KANJI_UNITS[char])) {
    const digits = [...text].map((char) => KANJI_DIGITS[char]);
    return Number(digits.join(''));
  }
  let total = 0;
  let current = 0;
  for (const char of text) {
    if (Object.prototype.hasOwnProperty.call(KANJI_DIGITS, char)) current = KANJI_DIGITS[char];
    else if (KANJI_UNITS[char]) { total += (current || 1) * KANJI_UNITS[char]; current = 0; }
  }
  return total + current;
}

function normalizeArticlePart(value) {
  const text = toAsciiDigits(value).trim();
  if (/^\d+$/.test(text)) return String(Number(text));
  const kanji = kanjiNumberToInt(text);
  return kanji == null ? text : String(kanji);
}

function normalizeArticleQuery(value) {
  let text = toAsciiDigits(value).trim().replace(/\s+/g, '');
  text = text.replace(/^第/, '').replace(/条$/, '');
  const parts = text.split(/(?:条)?の|_/).filter(Boolean).map(normalizeArticlePart);
  if (!parts.length) return '';
  if (parts.every((part) => /^\d+$/.test(part))) return parts.join('_');
  return text.toLowerCase();
}

function normalizedArticleNum(article) {
  const raw = String(article && article.num || '').replace(/-/g, '_');
  const direct = raw.split('_').filter(Boolean).map(normalizeArticlePart).join('_');
  if (direct) return direct;
  return normalizeArticleQuery(article && article.title || '');
}

function searchArticles(law, query) {
  const articles = law && Array.isArray(law.articles) ? law.articles : [];
  const raw = String(query || '').trim();
  if (!raw) return articles.slice();
  const articleQuery = normalizeArticleQuery(raw);
  const needle = toAsciiDigits(raw).toLowerCase().replace(/\s+/g, '');
  return articles.filter((article) => {
    if (articleQuery && normalizedArticleNum(article) === articleQuery) return true;
    const haystack = toAsciiDigits([article.title, article.caption, article.text].filter(Boolean).join(' ')).toLowerCase().replace(/\s+/g, '');
    return haystack.includes(needle);
  });
}

function directChild(element, tagName) {
  return Array.from(element && element.children || []).find((child) => child.tagName === tagName) || null;
}

function normalizeText(value) {
  return String(value || '').replace(/[\t\r ]+/g, ' ').replace(/\n\s*/g, '\n').trim();
}

function articleToRecord(article) {
  const title = normalizeText(directChild(article, 'ArticleTitle')?.textContent || '');
  const caption = normalizeText(directChild(article, 'ArticleCaption')?.textContent || '');
  const paragraphs = Array.from(article.children || [])
    .filter((child) => child.tagName === 'Paragraph')
    .map((paragraph) => normalizeText(paragraph.textContent || ''))
    .filter(Boolean);
  return {
    num: String(article.getAttribute && article.getAttribute('Num') || normalizeArticleQuery(title) || title),
    title,
    caption,
    paragraphs,
    text: paragraphs.join('\n')
  };
}

function collectArticles(root) {
  const records = [];
  function walk(node) {
    for (const child of Array.from(node && node.children || [])) {
      if (child.tagName === 'Article') { records.push(articleToRecord(child)); continue; }
      walk(child);
    }
  }
  walk(root);
  return records;
}

function parseLawXml(xmlText, law) {
  if (typeof DOMParser === 'undefined') throw new Error('この環境では法令XMLを解析できません。');
  const doc = new DOMParser().parseFromString(String(xmlText || ''), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('e-Govの法令データを解析できませんでした。');
  const lawBody = doc.querySelector('Law > LawBody');
  const main = lawBody && directChild(lawBody, 'MainProvision');
  if (!main) throw new Error('法令本文が見つかりませんでした。');
  const title = normalizeText(directChild(lawBody, 'LawTitle')?.textContent || law.title);
  const lawNum = normalizeText(doc.querySelector('Law > LawNum')?.textContent || '');
  const articles = collectArticles(main);
  if (!articles.length) throw new Error('条文が見つかりませんでした。');
  return {
    id: law.id,
    title,
    shortTitle: law.shortTitle,
    lawId: law.lawId,
    lawNum,
    source: 'e-Gov 法令API',
    sourceUrl: `https://laws.e-gov.go.jp/law/${law.lawId}`,
    fetchedAt: new Date().toISOString(),
    articles
  };
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDBを利用できません。'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('法令キャッシュを開けませんでした。'));
  });
}

async function withStore(mode, work) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = work(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('法令キャッシュの処理に失敗しました。'));
      tx.onabort = () => reject(tx.error || new Error('法令キャッシュの処理が中断されました。'));
    });
  } finally { db.close(); }
}

async function getCachedLaw(id) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('法令キャッシュを読み込めませんでした。'));
    });
  } finally { db.close(); }
}

async function saveCachedLaw(record) {
  await withStore('readwrite', (store) => store.put(record));
  return record;
}

function getLaw(id) {
  return LAW_CATALOG.find((law) => law.id === id) || null;
}

async function fetchLaw(id, fetchImpl = globalThis.fetch) {
  const law = getLaw(id);
  if (!law) throw new Error('対象法令が見つかりません。');
  if (typeof fetchImpl !== 'function') throw new Error('法令データを取得できません。');
  const response = await fetchImpl(API_BASE + encodeURIComponent(law.lawId));
  if (!response.ok) throw new Error(`e-Govから法令を取得できませんでした (${response.status})`);
  return parseLawXml(await response.text(), law);
}

async function ensureLaw(id, options = {}) {
  if (!options.force) {
    const cached = await getCachedLaw(id).catch(() => null);
    if (cached && Array.isArray(cached.articles) && cached.articles.length) return { record: cached, cached: true };
  }
  const record = await fetchLaw(id, options.fetchImpl || globalThis.fetch);
  await saveCachedLaw(record);
  return { record, cached: false };
}

const api = { LAW_CATALOG, DB_NAME, STORE_NAME, API_BASE, normalizeArticleQuery, searchArticles, getLaw, parseLawXml, getCachedLaw, saveCachedLaw, fetchLaw, ensureLaw };
if (typeof window !== 'undefined') window.MangaStatutes = api;
if (typeof module !== 'undefined') module.exports = api;
})();
