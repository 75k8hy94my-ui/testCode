(() => {
  'use strict';

  const LAST_TARGET_KEY = 'mangaReaderLastUrl';
  const SAVED_ITEMS_KEY = 'mangaReaderSavedItems';
  const QUERY_KEY = 'item';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function itemResumeKey(itemId) {
    const id = text(itemId);
    if (!id) throw new Error('item id is required');
    return 'item:' + id;
  }

  function buildReaderUrl(itemId, base = 'reader.html') {
    const id = text(itemId);
    if (!id) throw new Error('item id is required');
    const separator = String(base).includes('?') ? '&' : '?';
    return String(base) + separator + QUERY_KEY + '=' + encodeURIComponent(id);
  }

  function itemIdFromLocation(locationLike = globalThis.location) {
    if (!locationLike) return '';
    try {
      const href = locationLike.href || String(locationLike);
      const url = new URL(href, 'https://reader.invalid/');
      return text(url.searchParams.get(QUERY_KEY));
    } catch (_) {
      return '';
    }
  }

  function readItems(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
      const parsed = JSON.parse(storage.getItem(SAVED_ITEMS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function resolveItem(itemId, storage = globalThis.localStorage) {
    const id = text(itemId);
    if (!id) return null;
    return readItems(storage).find((item) => item && text(item.id) === id) || null;
  }

  function persistItemTarget(itemId, storage = globalThis.localStorage) {
    const id = text(itemId);
    if (!id || !storage || typeof storage.setItem !== 'function') return false;
    try {
      storage.setItem(LAST_TARGET_KEY, JSON.stringify({ kind: 'item', itemId: id }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readLegacyTarget(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      const raw = storage.getItem(LAST_TARGET_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.kind === 'item' && text(parsed.itemId)) {
          return { kind: 'item', itemId: text(parsed.itemId) };
        }
        if (parsed && parsed.kind === 'url' && text(parsed.value)) {
          return { kind: 'url', value: text(parsed.value) };
        }
      } catch (_) {}
      return /^https?:\/\//i.test(raw) ? { kind: 'url', value: raw } : null;
    } catch (_) {
      return null;
    }
  }

  function resolveTarget({ locationLike = globalThis.location, storage = globalThis.localStorage } = {}) {
    const itemId = itemIdFromLocation(locationLike);
    if (itemId) {
      const item = resolveItem(itemId, storage);
      return item ? { kind: 'item', itemId, item, source: 'query' } : { kind: 'missing-item', itemId, source: 'query' };
    }
    const legacy = readLegacyTarget(storage);
    if (!legacy) return null;
    if (legacy.kind === 'item') {
      const item = resolveItem(legacy.itemId, storage);
      return item ? { ...legacy, item, source: 'legacy' } : { kind: 'missing-item', itemId: legacy.itemId, source: 'legacy' };
    }
    return { ...legacy, source: 'legacy' };
  }

  const api = Object.freeze({
    LAST_TARGET_KEY,
    SAVED_ITEMS_KEY,
    QUERY_KEY,
    itemResumeKey,
    buildReaderUrl,
    itemIdFromLocation,
    readItems,
    resolveItem,
    persistItemTarget,
    readLegacyTarget,
    resolveTarget,
  });

  if (typeof window !== 'undefined') window.MangaReaderTarget = api;
  if (typeof module !== 'undefined') module.exports = api;
})();