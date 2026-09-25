(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ImageTransferSettings = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const KEYS = Object.freeze({
    vpnRequired: 'mangaReaderImageVpnRequired',
    networkMode: 'mangaReaderImageNetworkMode',
    dailyLimit: 'mangaReaderStorageTransferLimitDaily',
    legacyUsage: 'mangaReaderStorageTransferUsageDaily',
    stats: 'mangaReaderImageTransferStats',
  });

  const EVENT_NAME = 'manga-reader-image-transfer-settings-changed';
  const STATS_EVENT_NAME = 'manga-reader-image-transfer-stats-changed';
  const DEFAULT_DAILY_LIMIT_BYTES = 150 * 1024 * 1024;
  const DAILY_LIMIT_OPTIONS = Object.freeze([50, 150, 300, 500].map((mb) => mb * 1024 * 1024));
  const NETWORK_MODES = Object.freeze(['data-saver', 'standard', 'quality']);
  const DEFAULT_NETWORK_MODE = 'standard';

  function defaultStorage() {
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function readRaw(storage, key) {
    if (!storage) return null;
    try { return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null); } catch (_) { return null; }
  }

  function writeRaw(storage, key, value) {
    if (!storage) return false;
    try {
      if (storage.setItem) storage.setItem(key, value);
      else storage.set(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readJson(storage, key, fallback) {
    const raw = readRaw(storage, key);
    if (raw == null || raw === '') return fallback;
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function readBoolean(storage, key, fallback) {
    const raw = readRaw(storage, key);
    if (raw == null) return fallback;
    if (raw === 'true' || raw === '"true"' || raw === '1') return true;
    if (raw === 'false' || raw === '"false"' || raw === '0') return false;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'boolean' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function dayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
  }

  function normalizeNetworkMode(value) {
    return NETWORK_MODES.includes(value) ? value : DEFAULT_NETWORK_MODE;
  }

  function normalizeDailyLimit(value) {
    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : DEFAULT_DAILY_LIMIT_BYTES;
  }

  function normalizeStats(value, today = dayKey()) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const sameDay = String(source.day || '') === today;
    const number = (name) => sameDay && Number.isFinite(Number(source[name])) && Number(source[name]) >= 0 ? Number(source[name]) : 0;
    return {
      day: today,
      estimatedBytes: number('estimatedBytes'),
      observedBytes: number('observedBytes'),
      attemptedEstimatedBytes: number('attemptedEstimatedBytes'),
      previewBytes: number('previewBytes'),
      zoomBytes: number('zoomBytes'),
      cacheSavedBytes: number('cacheSavedBytes'),
      partialSavedBytes: number('partialSavedBytes'),
      previewRequests: number('previewRequests'),
      zoomRequests: number('zoomRequests'),
      cacheHits: number('cacheHits'),
      blockedByVpn: number('blockedByVpn'),
      providerReportedBytes: sameDay && Number.isFinite(Number(source.providerReportedBytes)) && Number(source.providerReportedBytes) >= 0
        ? Number(source.providerReportedBytes)
        : null,
      lastUpdatedAt: sameDay && Number.isFinite(Number(source.lastUpdatedAt)) ? Number(source.lastUpdatedAt) : 0,
    };
  }

  function legacyUsage(storage, today = dayKey()) {
    const value = readJson(storage, KEYS.legacyUsage, null);
    if (!value || String(value.day || '') !== today) return 0;
    const bytes = Number(value.bytes);
    return Number.isFinite(bytes) && bytes >= 0 ? bytes : 0;
  }

  function load(storage = defaultStorage(), now = new Date()) {
    const today = dayKey(now);
    const stats = normalizeStats(readJson(storage, KEYS.stats, null), today);
    return {
      vpnRequired: readBoolean(storage, KEYS.vpnRequired, true),
      networkMode: normalizeNetworkMode(readRaw(storage, KEYS.networkMode)),
      dailyLimitBytes: normalizeDailyLimit(readRaw(storage, KEYS.dailyLimit)),
      limitUsageBytes: legacyUsage(storage, today),
      stats,
    };
  }

  function dispatchChange(settings) {
    if (!root.document || typeof root.document.dispatchEvent !== 'function') return;
    const EventCtor = root.CustomEvent || (root.document.defaultView && root.document.defaultView.CustomEvent);
    if (typeof EventCtor !== 'function') return;
    root.document.dispatchEvent(new EventCtor(EVENT_NAME, { detail: settings }));
  }

  function commit(storage) {
    const next = load(storage);
    dispatchChange(next);
    return next;
  }

  function setVpnRequired(value, storage = defaultStorage()) {
    writeRaw(storage, KEYS.vpnRequired, value ? 'true' : 'false');
    return commit(storage);
  }

  function setNetworkMode(value, storage = defaultStorage()) {
    const mode = normalizeNetworkMode(value);
    writeRaw(storage, KEYS.networkMode, mode);
    return commit(storage);
  }

  function setDailyLimitBytes(value, storage = defaultStorage()) {
    const bytes = normalizeDailyLimit(value);
    writeRaw(storage, KEYS.dailyLimit, String(bytes));
    return commit(storage);
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes >= 100 * 1024 ? 0 : 1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  return Object.freeze({
    KEYS,
    EVENT_NAME,
    STATS_EVENT_NAME,
    DEFAULT_DAILY_LIMIT_BYTES,
    DAILY_LIMIT_OPTIONS,
    NETWORK_MODES,
    DEFAULT_NETWORK_MODE,
    dayKey,
    normalizeNetworkMode,
    normalizeDailyLimit,
    normalizeStats,
    load,
    setVpnRequired,
    setNetworkMode,
    setDailyLimitBytes,
    formatBytes,
  });
}));
