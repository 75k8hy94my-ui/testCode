(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ImageTransferSettings = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const KEYS = Object.freeze({
    vpnRequired: 'mangaReaderImageVpnRequired',
    dailyLimit: 'mangaReaderStorageTransferLimitDaily',
    legacyUsage: 'mangaReaderStorageTransferUsageDaily',
    stats: 'mangaReaderImageTransferStats',
  });
  const EVENT_NAME = 'manga-reader-image-transfer-settings-changed';
  const STATS_EVENT_NAME = 'manga-reader-image-transfer-stats-changed';
  const DEFAULT_DAILY_LIMIT_BYTES = 150 * 1024 * 1024;
  const DAILY_LIMIT_OPTIONS = Object.freeze([50, 150, 300, 500].map((mb) => mb * 1024 * 1024));
  const STANDARD_NETWORK_MODE = 'standard';
  const SAVER_NETWORK_MODE = 'data-saver';
  function defaultStorage() { try { return root.localStorage || null; } catch (_) { return null; } }
  function readRaw(storage, key) { try { return storage ? (storage.getItem ? storage.getItem(key) : storage.get(key)) : null; } catch (_) { return null; } }
  function writeRaw(storage, key, value) { try { if (!storage) return false; if (storage.setItem) storage.setItem(key, value); else storage.set(key, value); return true; } catch (_) { return false; } }
  function readJson(storage, key, fallback) { const raw = readRaw(storage, key); if (raw == null || raw === '') return fallback; try { return JSON.parse(raw); } catch (_) { return fallback; } }
  function readBoolean(storage, key, fallback) { const raw = readRaw(storage, key); if (raw == null) return fallback; if (raw === 'true' || raw === '1' || raw === '"true"') return true; if (raw === 'false' || raw === '0' || raw === '"false"') return false; return fallback; }
  function dayKey(now = new Date()) { return now.toISOString().slice(0, 10); }
  function normalizeDailyLimit(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT_BYTES; }
  function normalizeStats(value, today = dayKey()) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const same = String(source.day || '') === today;
    const number = (key) => same && Number.isFinite(Number(source[key])) && Number(source[key]) >= 0 ? Number(source[key]) : 0;
    const provider = same && source.providerReportedBytes != null && source.providerReportedBytes !== '' && Number.isFinite(Number(source.providerReportedBytes)) && Number(source.providerReportedBytes) >= 0
      ? Number(source.providerReportedBytes)
      : null;
    return { day: today, estimatedBytes: number('estimatedBytes'), observedBytes: number('observedBytes'), attemptedEstimatedBytes: number('attemptedEstimatedBytes'), previewBytes: number('previewBytes'), zoomBytes: number('zoomBytes'), previewRequests: number('previewRequests'), zoomRequests: number('zoomRequests'), cacheHits: number('cacheHits'), cacheSavedBytes: number('cacheSavedBytes'), partialSavedBytes: number('partialSavedBytes'), blockedByVpn: number('blockedByVpn'), providerReportedBytes: provider, lastUpdatedAt: same ? number('lastUpdatedAt') : 0 };
  }
  function legacyUsage(storage, today) { const value = readJson(storage, KEYS.legacyUsage, null); const n = Number(value && value.day === today ? value.bytes : 0); return Number.isFinite(n) && n >= 0 ? n : 0; }
  function load(storage = defaultStorage(), now = new Date()) {
    const today = dayKey(now); const stats = normalizeStats(readJson(storage, KEYS.stats, null), today); const dailyLimitBytes = normalizeDailyLimit(readRaw(storage, KEYS.dailyLimit)); const legacyBytes = legacyUsage(storage, today); const limitUsageBytes = Math.max(legacyBytes, stats.estimatedBytes);
    return { vpnRequired: readBoolean(storage, KEYS.vpnRequired, true), networkMode: limitUsageBytes > dailyLimitBytes / 2 ? SAVER_NETWORK_MODE : STANDARD_NETWORK_MODE, dailyLimitBytes, limitUsageBytes, stats };
  }
  function dispatch(rootObject, name, detail) { if (!rootObject.document || typeof rootObject.document.dispatchEvent !== 'function') return; const EventCtor = rootObject.CustomEvent || rootObject.document.defaultView?.CustomEvent; if (typeof EventCtor === 'function') rootObject.document.dispatchEvent(new EventCtor(name, { detail })); }
  function commit(storage) { const settings = load(storage); dispatch(root, EVENT_NAME, settings); return settings; }
  function setVpnRequired(value, storage = defaultStorage()) { if (!writeRaw(storage, KEYS.vpnRequired, value ? 'true' : 'false')) return load(storage); return commit(storage); }
  function setDailyLimitBytes(value, storage = defaultStorage()) { if (!writeRaw(storage, KEYS.dailyLimit, String(normalizeDailyLimit(value)))) return load(storage); return commit(storage); }
  function formatBytes(value) { const n = Math.max(0, Number(value) || 0); if (n < 1024) return `${Math.round(n)} B`; if (n < 1048576) return `${(n / 1024).toFixed(n >= 102400 ? 0 : 1)} KB`; if (n < 1073741824) return `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`; return `${(n / 1073741824).toFixed(2)} GB`; }
  return Object.freeze({ KEYS, EVENT_NAME, STATS_EVENT_NAME, DEFAULT_DAILY_LIMIT_BYTES, DAILY_LIMIT_OPTIONS, STANDARD_NETWORK_MODE, SAVER_NETWORK_MODE, dayKey, normalizeDailyLimit, normalizeStats, load, setVpnRequired, setDailyLimitBytes, formatBytes });
}));
