(() => {
  'use strict';
  function safeGet(key, fallback = null) { try { const value = localStorage.getItem(key); return value == null ? fallback : value; } catch (_) { return fallback; } }
  function safeReadJson(key, fallback) { try { const value = safeGet(key, null); return value == null ? fallback : JSON.parse(value); } catch (_) { return fallback; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (error) { if (error && error.name === 'QuotaExceededError') window.dispatchEvent(new CustomEvent('manga-storage-quota')); return false; } }
  function safeWriteJson(key, value) { return safeSet(key, JSON.stringify(value)); }
  function remove(key) { try { localStorage.removeItem(key); return true; } catch (_) { return false; } }
  window.MangaReaderStorage = { safeGet, safeReadJson, safeSet, safeWriteJson, remove };
})();
