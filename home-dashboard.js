(()=>{
'use strict';
const HOME_LAYOUT_KEY = 'mangaReaderHomeCards';
const LEGACY_DEFAULT_CARD_IDS = ['bookshelf'];
const DEFAULT_CARD_IDS = ['bookshelf'];
const CARD_CATALOG = Object.freeze({
  bookshelf: Object.freeze({ id: 'bookshelf', title: '本棚', subtitle: '保存した漫画・資料を開く', kind: 'internal', href: 'manga.html', badge: 'APP' }),
});
const isKnownCard = (id) => Object.prototype.hasOwnProperty.call(CARD_CATALOG, id);
function normalizeLayout(value) {
  if (!Array.isArray(value)) return DEFAULT_CARD_IDS.slice();
  const seen = new Set(); const normalized = [];
  value.forEach((raw) => { const id = String(raw || ''); if (!isKnownCard(id) || seen.has(id)) return; seen.add(id); normalized.push(id); });
  if (value.length && !normalized.length) return DEFAULT_CARD_IDS.slice();
  return normalized;
}
function isLegacyDefaultLayout(layout) { return layout.length === LEGACY_DEFAULT_CARD_IDS.length && layout.every((id, index) => id === LEGACY_DEFAULT_CARD_IDS[index]); }
function addCard(layout, id) { const normalized = normalizeLayout(layout); if (!isKnownCard(id) || normalized.includes(id)) return normalized; return normalized.concat(id); }
function removeCard(layout, id) { return normalizeLayout(layout).filter((cardId) => cardId !== id); }
function moveCard(layout, id, direction) {
  const normalized = normalizeLayout(layout); const index = normalized.indexOf(id); const delta = direction < 0 ? -1 : direction > 0 ? 1 : 0; const nextIndex = index + delta;
  if (index < 0 || !delta || nextIndex < 0 || nextIndex >= normalized.length) return normalized;
  const result = normalized.slice(); [result[index], result[nextIndex]] = [result[nextIndex], result[index]]; return result;
}
function hiddenCardIds(layout) { const visible = new Set(normalizeLayout(layout)); return Object.keys(CARD_CATALOG).filter((id) => !visible.has(id)); }
function getRaw(storage, key) { return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null); }
function setRaw(storage, key, value) { if (storage.setItem) storage.setItem(key, value); else storage.set(key, value); }
function loadLayout(storage = globalThis.localStorage) {
  try {
    const raw = getRaw(storage, HOME_LAYOUT_KEY);
    if (raw == null) return DEFAULT_CARD_IDS.slice();
    const normalized = normalizeLayout(JSON.parse(raw));
    if (!isLegacyDefaultLayout(normalized)) return normalized;
    const migrated = DEFAULT_CARD_IDS.slice(); setRaw(storage, HOME_LAYOUT_KEY, JSON.stringify(migrated)); return migrated;
  } catch (_) { return DEFAULT_CARD_IDS.slice(); }
}
function saveLayout(layout, storage = globalThis.localStorage) { const normalized = normalizeLayout(layout); setRaw(storage, HOME_LAYOUT_KEY, JSON.stringify(normalized)); return normalized; }
const api = { HOME_LAYOUT_KEY, LEGACY_DEFAULT_CARD_IDS, DEFAULT_CARD_IDS, CARD_CATALOG, normalizeLayout, addCard, removeCard, moveCard, hiddenCardIds, loadLayout, saveLayout };
if (typeof window !== 'undefined') window.MangaReaderHome = api;
if (typeof module !== 'undefined') module.exports = api;
})();
