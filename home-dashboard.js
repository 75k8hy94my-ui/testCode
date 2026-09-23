(()=>{
'use strict';
const HOME_LAYOUT_KEY = 'mangaReaderHomeCards';
const LEGACY_DEFAULT_CARD_IDS = ['bookshelf'];
const DEFAULT_CARD_IDS = ['manga','video'];
const CARD_CATALOG = Object.freeze({
  manga: Object.freeze({ id: 'manga', title: '漫画', kind: 'internal', href: 'manga.html', badge: 'APP' }),
  video: Object.freeze({ id: 'video', title: '動画', kind: 'internal', href: 'video.html', badge: 'APP' }),
});
const isKnownCard = (id) => Object.prototype.hasOwnProperty.call(CARD_CATALOG, id);
function normalizeLayout(value) {
  if (!Array.isArray(value)) return DEFAULT_CARD_IDS.slice();
  const seen = new Set(); const normalized = [];
  const append = (id) => { if (!isKnownCard(id) || seen.has(id)) return; seen.add(id); normalized.push(id); };
  value.forEach((raw) => {
    const id = String(raw || '');
    if (id === 'bookshelf') { append('manga'); append('video'); return; }
    append(id);
  });
  if (value.length && !normalized.length) return DEFAULT_CARD_IDS.slice();
  return normalized;
}
function isLegacyDefaultLayout(layout) {
  return Array.isArray(layout) && layout.length === LEGACY_DEFAULT_CARD_IDS.length &&
    layout.every((id, index) => id === LEGACY_DEFAULT_CARD_IDS[index]);
}
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
    const parsed = JSON.parse(raw);
    const normalized = normalizeLayout(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) setRaw(storage, HOME_LAYOUT_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (_) { return DEFAULT_CARD_IDS.slice(); }
}
function saveLayout(layout, storage = globalThis.localStorage) { const normalized = normalizeLayout(layout); setRaw(storage, HOME_LAYOUT_KEY, JSON.stringify(normalized)); return normalized; }
const api = { HOME_LAYOUT_KEY, LEGACY_DEFAULT_CARD_IDS, DEFAULT_CARD_IDS, CARD_CATALOG, normalizeLayout, isLegacyDefaultLayout, addCard, removeCard, moveCard, hiddenCardIds, loadLayout, saveLayout };
if (typeof window !== 'undefined') window.MangaReaderHome = api;
if (typeof module !== 'undefined') module.exports = api;
})();
