(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ImageTransferLedger = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const settingsApi = typeof require === 'function'
    ? require('./image-transfer-settings.js')
    : (root.ImageTransferSettings || null);
  if (!settingsApi) throw new Error('ImageTransferSettings is required');

  const { KEYS, STATS_EVENT_NAME, normalizeStats, load: loadSettings } = settingsApi;

  function defaultStorage() {
    try { return root.localStorage || null; } catch (_) { return null; }
  }

  function dayKey(now = new Date()) {
    return now.toISOString().slice(0, 10);
  }

  function readJson(storage, key, fallback) {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw == null || raw === '' ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function emitStats(stats) {
    if (!root.document || typeof root.document.dispatchEvent !== 'function') return;
    const EventCtor = root.CustomEvent || (root.document.defaultView && root.document.defaultView.CustomEvent);
    if (typeof EventCtor !== 'function') return;
    root.document.dispatchEvent(new EventCtor(STATS_EVENT_NAME, { detail: stats }));
  }

  function currentStats(storage = defaultStorage(), now = new Date()) {
    return normalizeStats(readJson(storage, KEYS.stats, null), dayKey(now));
  }

  function saveStats(stats, storage = defaultStorage(), now = new Date()) {
    const normalized = normalizeStats({ ...stats, day: dayKey(now), lastUpdatedAt: now.getTime() }, dayKey(now));
    normalized.lastUpdatedAt = now.getTime();
    if (!writeJson(storage, KEYS.stats, normalized)) return false;
    emitStats(normalized);
    return normalized;
  }

  function writeLegacyUsage(bytes, storage, now) {
    return writeJson(storage, KEYS.legacyUsage, { day: dayKey(now), bytes: Math.max(0, Number(bytes) || 0) });
  }

  function nonNegativeBytes(value) {
    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  }

  function normalizeKind(kind) {
    return kind === 'preview' ? 'preview' : kind === 'zoom' ? 'zoom' : 'other';
  }

  function reserveEstimate(bytes, options = {}) {
    const storage = options.storage || defaultStorage();
    const now = options.now || new Date();
    const amount = nonNegativeBytes(bytes);
    const settings = loadSettings(storage, now);
    const stats = currentStats(storage, now);
    const currentUsage = Math.max(settings.limitUsageBytes, stats.estimatedBytes);
    if (amount > 0 && currentUsage + amount > settings.dailyLimitBytes) {
      return { ok: false, reason: 'limit', amount, usageBytes: currentUsage, limitBytes: settings.dailyLimitBytes, networkMode: settings.networkMode };
    }

    stats.attemptedEstimatedBytes += amount;
    stats.estimatedBytes = currentUsage + amount;
    stats.lastUpdatedAt = now.getTime();
    const saved = saveStats(stats, storage, now);
    if (!saved) {
      return {
        ok: false,
        reason: 'storage',
        amount,
        usageBytes: currentUsage,
        limitBytes: settings.dailyLimitBytes,
        networkMode: settings.networkMode,
        stats
      };
    }
    writeLegacyUsage(stats.estimatedBytes, storage, now);
    return {
      ok: true,
      reason: null,
      amount,
      usageBytes: stats.estimatedBytes,
      limitBytes: settings.dailyLimitBytes,
      networkMode: stats.estimatedBytes > (settings.dailyLimitBytes / 2) ? settingsApi.SAVER_NETWORK_MODE : settingsApi.STANDARD_NETWORK_MODE,
      stats
    };
  }

  function recordObserved(bytes, kind, options = {}) {
    const storage = options.storage || defaultStorage();
    const now = options.now || new Date();
    const amount = nonNegativeBytes(bytes);
    const type = normalizeKind(kind);
    const stats = currentStats(storage, now);
    stats.observedBytes += amount;
    if (type === 'preview') {
      stats.previewBytes += amount;
      stats.previewRequests += amount > 0 ? 1 : 0;
    } else if (type === 'zoom') {
      stats.zoomBytes += amount;
      stats.zoomRequests += amount > 0 ? 1 : 0;
    }
    return saveStats(stats, storage, now);
  }

  function recordCacheHit(bytes, options = {}) {
    const storage = options.storage || defaultStorage();
    const now = options.now || new Date();
    const stats = currentStats(storage, now);
    stats.cacheHits += 1;
    stats.cacheSavedBytes += nonNegativeBytes(bytes);
    return saveStats(stats, storage, now);
  }

  function recordPartialSavings(bytes, options = {}) {
    const storage = options.storage || defaultStorage();
    const now = options.now || new Date();
    const stats = currentStats(storage, now);
    stats.partialSavedBytes += nonNegativeBytes(bytes);
    return saveStats(stats, storage, now);
  }

  function recordVpnBlocked(options = {}) {
    const storage = options.storage || defaultStorage();
    const now = options.now || new Date();
    const stats = currentStats(storage, now);
    stats.blockedByVpn += 1;
    return saveStats(stats, storage, now);
  }

  function recordProviderReported(bytes, options = {}) {
    const storage = options.storage || defaultStorage();
    const now = options.now || new Date();
    const stats = currentStats(storage, now);
    if (bytes == null || bytes === '') stats.providerReportedBytes = null;
    else {
      const amount = Number(bytes);
      stats.providerReportedBytes = Number.isFinite(amount) && amount >= 0 ? amount : null;
    }
    return saveStats(stats, storage, now);
  }

  return Object.freeze({
    currentStats,
    reserveEstimate,
    recordObserved,
    recordCacheHit,
    recordPartialSavings,
    recordVpnBlocked,
    recordProviderReported,
  });
}));
