(() => {
  'use strict';
  const KEY = 'mangaReaderLastPage';
  function create({ storage = globalThis.localStorage, scheduleSync = () => {}, now = Date.now } = {}) {
    if (!storage) throw new TypeError('progress repository requires storage');
    function read() { try { const data = JSON.parse(storage.getItem(KEY) || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch (_) { return {}; } }
    function key(id) { const value = String(id || '').trim(); if (!value) throw new TypeError('item id required'); return `item:${value}`; }
    function load(id, item) {
      const k = key(id), map = read(), record = map[k];
      if (record && Number.isInteger(Number(record.page)) && Number(record.page) > 0) return { page: Number(record.page), wasLast: record.wasLast === true, updatedAt: Number(record.updatedAt || record.savedAt) || 0 };
      const legacyPage = Number(item?.readingProgress?.page);
      if (Number.isInteger(legacyPage) && legacyPage > 0) {
        const migrated = { page: legacyPage, wasLast: false, updatedAt: Number(item.readingProgress.updatedAt) || now() };
        map[k] = migrated;
        try { storage.setItem(KEY, JSON.stringify(map)); scheduleSync(); } catch (_) {}
        return migrated;
      }
      return { page: 1, wasLast: false, updatedAt: 0 };
    }
    function commit(id, page, pageCount, updatedAt = now()) {
      const k = key(id), map = read(), previous = map[k], timestamp = Number(updatedAt) || now();
      if (previous && (Number(previous.updatedAt || previous.savedAt) || 0) > timestamp) return false;
      const count = Math.max(0, Number(pageCount) || 0);
      const record = { page: Math.max(1, Math.floor(Number(page) || 1)), wasLast: count > 0 && Number(page) >= count, updatedAt: timestamp };
      map[k] = record;
      try { storage.setItem(KEY, JSON.stringify(map)); } catch (_) { return false; }
      scheduleSync();
      return record;
    }
    return Object.freeze({ key, load, commit, readAll: read });
  }
  const api = Object.freeze({ KEY, create });
  if (typeof self !== 'undefined') self.ReaderProgressRepositoryFactory = api;
  if (typeof window !== 'undefined') window.ReaderProgressRepositoryFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
