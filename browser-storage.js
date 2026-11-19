(() => {
  'use strict';
  const nativeSetItem = window.Storage?.prototype?.setItem;
  function safeGet(key, fallback = null) { try { const value = localStorage.getItem(key); return value == null ? fallback : value; } catch (_) { return fallback; } }
  function safeReadJson(key, fallback) { try { const value = safeGet(key, null); return value == null ? fallback : JSON.parse(value); } catch (_) { return fallback; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (error) { if (error && error.name === 'QuotaExceededError') window.dispatchEvent(new CustomEvent('manga-storage-quota')); return false; } }
  function safeWriteJson(key, value) { return safeSet(key, JSON.stringify(value)); }
  function remove(key) { try { localStorage.removeItem(key); return true; } catch (_) { return false; } }
  function snapshot(keys) { return new Map(keys.map(key => [key, localStorage.getItem(key)])); }
  function matchesSnapshot(before) {
    return Array.from(before).every(([key, raw]) => localStorage.getItem(key) === raw);
  }
  function withWriteLock(work) {
    const locks = window.navigator?.locks;
    return locks?.request ? locks.request('manga-reader-video-custom-properties', { mode: 'exclusive' }, work) : work();
  }
  function writeRaw(key, raw) {
    if (nativeSetItem && localStorage instanceof window.Storage) nativeSetItem.call(localStorage, key, raw);
    else localStorage.setItem(key, raw);
  }
  function writeBatch(before, updates) {
    const serialized = updates.map(([key, value]) => [key, JSON.stringify(value)]);
    function conflict() {
      const error = new Error('別の画面で保存データが更新されました。');
      error.code = 'STORAGE_CHANGED';
      return error;
    }
    if (!matchesSnapshot(before)) throw conflict();
    const written = [];
    try {
      for (const [key, raw] of serialized) {
        if (localStorage.getItem(key) !== before.get(key)) throw conflict();
        writeRaw(key, raw);
        written.push([key, raw]);
      }
    } catch (error) {
      for (const [key, after] of written.reverse()) {
        try {
          if (localStorage.getItem(key) !== after) continue;
          const raw = before.get(key);
          if (raw == null) localStorage.removeItem(key);
          else writeRaw(key, raw);
        } catch (_) {}
      }
      throw error;
    }
  }
  window.MangaReaderStorage = { safeGet, safeReadJson, safeSet, safeWriteJson, remove, snapshot, matchesSnapshot, withWriteLock, writeBatch };
})();
