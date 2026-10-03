(() => {
  'use strict';

  const LAST_TARGET_KEY = 'mangaReaderLastUrl';
  const SAVED_ITEMS_KEY = 'mangaReaderSavedItems';
  const QUERY_KEY = 'item';
  const LAUNCH_KEY = 'mangaReaderReaderLaunch';
  const LAUNCH_VERSION = 1;
  const LAUNCH_MAX_AGE_MS = 2 * 60 * 1000;

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

  function cloneLaunchItem(item) {
    if (!item || typeof item !== 'object' || !text(item.id)) return null;
    try {
      const serialized = JSON.stringify(item);
      // Keep the handoff deliberately small. The canonical copy still lives in
      // localStorage; this snapshot is only a same-tab recovery path if the
      // destination document observes stale storage during navigation.
      if (!serialized || serialized.length > 1024 * 1024) return null;
      const cloned = JSON.parse(serialized);
      return cloned && text(cloned.id) === text(item.id) ? cloned : null;
    } catch (_) {
      return null;
    }
  }

  function prepareLaunch(item, storage = globalThis.sessionStorage, now = Date.now()) {
    const itemId = text(item && item.id);
    if (!itemId) throw new Error('saved manga item id is required');
    if (!storage || typeof storage.setItem !== 'function') return false;
    const envelope = {
      version: LAUNCH_VERSION,
      itemId,
      createdAt: Number(now) || Date.now(),
    };
    const snapshot = cloneLaunchItem(item);
    if (snapshot) envelope.item = snapshot;
    try {
      storage.setItem(LAUNCH_KEY, JSON.stringify(envelope));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readLaunch(storage = globalThis.sessionStorage, now = Date.now()) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    let parsed = null;
    try {
      parsed = JSON.parse(storage.getItem(LAUNCH_KEY) || 'null');
    } catch (_) {}
    const createdAt = Number(parsed && parsed.createdAt);
    const age = Number(now) - createdAt;
    const valid = parsed &&
      parsed.version === LAUNCH_VERSION &&
      text(parsed.itemId) &&
      Number.isFinite(createdAt) &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= LAUNCH_MAX_AGE_MS;
    if (valid) return parsed;
    try { if (typeof storage.removeItem === 'function') storage.removeItem(LAUNCH_KEY); } catch (_) {}
    return null;
  }

  function consumeLaunch(itemId, storage = globalThis.sessionStorage, now = Date.now()) {
    const expectedId = text(itemId);
    if (!expectedId) return null;
    const launch = readLaunch(storage, now);
    if (!launch) return null;
    try { if (typeof storage.removeItem === 'function') storage.removeItem(LAUNCH_KEY); } catch (_) {}
    if (text(launch.itemId) !== expectedId) return null;
    return launch.item && text(launch.item.id) === expectedId ? launch.item : null;
  }

  const api = Object.freeze({
    LAST_TARGET_KEY,
    SAVED_ITEMS_KEY,
    QUERY_KEY,
    LAUNCH_KEY,
    LAUNCH_VERSION,
    LAUNCH_MAX_AGE_MS,
    itemResumeKey,
    buildReaderUrl,
    itemIdFromLocation,
    readItems,
    resolveItem,
    persistItemTarget,
    readLegacyTarget,
    resolveTarget,
    prepareLaunch,
    readLaunch,
    consumeLaunch,
  });

  if (typeof window !== 'undefined') window.MangaReaderTarget = api;
  if (typeof module !== 'undefined') module.exports = api;
})();