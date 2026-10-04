(() => {
  'use strict';
  const SAVED_ITEMS_KEY = 'mangaReaderSavedItems';
  const LEGACY_TARGET_KEY = 'mangaReaderLastUrl';
  const QUERY_KEY = 'item';
  const text = (value) => String(value == null ? '' : value).trim();
  function itemResumeKey(itemId) { const id = text(itemId); if (!id) throw new Error('item id is required'); return `item:${id}`; }
  function buildReaderUrl(itemId, base = 'reader.html') {
    const id = text(itemId); if (!id) throw new Error('item id is required');
    const value = String(base);
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}${QUERY_KEY}=${encodeURIComponent(id)}`;
  }
  function itemIdFromLocation(locationLike = globalThis.location) {
    if (!locationLike) return '';
    try { return text(new URL(locationLike.href || String(locationLike), 'https://reader.invalid/').searchParams.get(QUERY_KEY)); } catch (_) { return ''; }
  }
  function readItems(storage = globalThis.localStorage) {
    try { const values = JSON.parse(storage?.getItem(SAVED_ITEMS_KEY) || '[]'); return Array.isArray(values) ? values : []; } catch (_) { return []; }
  }
  function resolveItem(itemId, storage = globalThis.localStorage) {
    const id = text(itemId); return id ? readItems(storage).find((item) => item && text(item.id) === id) || null : null;
  }
  function resolveTarget({ locationLike = globalThis.location, storage = globalThis.localStorage } = {}) {
    const itemId = itemIdFromLocation(locationLike);
    if (!itemId) return { kind: 'missing-id', source: 'query' };
    const item = resolveItem(itemId, storage);
    return item ? { kind: 'item', itemId, item, source: 'query' } : { kind: 'missing-item', itemId, source: 'query' };
  }
  function clearLegacyTarget(storage = globalThis.localStorage) { try { storage?.removeItem?.(LEGACY_TARGET_KEY); return true; } catch (_) { return false; } }
  const api = Object.freeze({ SAVED_ITEMS_KEY, QUERY_KEY, itemResumeKey, buildReaderUrl, itemIdFromLocation, readItems, resolveItem, resolveTarget, clearLegacyTarget });
  if (typeof self !== 'undefined') self.MangaReaderTarget = api;
  if (typeof window !== 'undefined') window.MangaReaderTarget = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
