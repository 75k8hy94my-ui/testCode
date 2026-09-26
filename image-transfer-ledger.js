(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ImageTransferLedger = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const settingsApi = typeof require === 'function' ? require('./image-transfer-settings.js') : root.ImageTransferSettings;
  const { KEYS, STATS_EVENT_NAME, normalizeStats, load: loadSettings } = settingsApi;
  function storageDefault() { try { return root.localStorage || null; } catch (_) { return null; } }
  function read(storage) { try { const raw = storage?.getItem(KEYS.stats); return raw ? JSON.parse(raw) : null; } catch (_) { return null; } }
  function save(stats, storage, now) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const next = normalizeStats({ ...stats, day: now.toISOString().slice(0, 10), lastUpdatedAt: now.getTime() }, now.toISOString().slice(0, 10));
    try { storage.setItem(KEYS.stats, JSON.stringify(next)); if (root.document?.dispatchEvent && typeof root.CustomEvent === 'function') root.document.dispatchEvent(new root.CustomEvent(STATS_EVENT_NAME, { detail: next })); return next; } catch (_) { return false; }
  }
  function currentStats(storage = storageDefault(), now = new Date()) { return normalizeStats(read(storage), now.toISOString().slice(0, 10)); }
  function amount(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
  function kind(value) { return value === 'preview' || value === 'zoom' ? value : 'other'; }
  function reserveEstimate(bytes, options = {}) {
    const storage = options.storage || storageDefault(); const now = options.now || new Date(); const n = amount(bytes); const settings = loadSettings(storage, now); const stats = currentStats(storage, now); const current = Math.max(settings.limitUsageBytes, stats.estimatedBytes);
    if (current + n > settings.dailyLimitBytes) return { ok: false, reason: 'limit', amount: n, usageBytes: current, limitBytes: settings.dailyLimitBytes, networkMode: settings.networkMode };
    stats.attemptedEstimatedBytes += n; stats.estimatedBytes = current + n; const saved = save(stats, storage, now); if (!saved) return { ok: false, reason: 'storage', amount: n, usageBytes: current, limitBytes: settings.dailyLimitBytes, networkMode: settings.networkMode };
    try { storage.setItem(KEYS.legacyUsage, JSON.stringify({ day: now.toISOString().slice(0, 10), bytes: stats.estimatedBytes })); } catch (_) {}
    return { ok: true, amount: n, usageBytes: stats.estimatedBytes, limitBytes: settings.dailyLimitBytes, networkMode: stats.estimatedBytes > settings.dailyLimitBytes / 2 ? settingsApi.SAVER_NETWORK_MODE : settingsApi.STANDARD_NETWORK_MODE };
  }
  function recordObserved(bytes, objectKind, options = {}) { const storage = options.storage || storageDefault(); const now = options.now || new Date(); const stats = currentStats(storage, now); const n = amount(bytes); stats.observedBytes += n; if (kind(objectKind) === 'preview') { stats.previewBytes += n; if (n) stats.previewRequests += 1; } else if (kind(objectKind) === 'zoom') { stats.zoomBytes += n; if (n) stats.zoomRequests += 1; } return save(stats, storage, now); }
  function recordCacheHit(bytes, options = {}) { const storage = options.storage || storageDefault(); const now = options.now || new Date(); const stats = currentStats(storage, now); stats.cacheHits += 1; stats.cacheSavedBytes += amount(bytes); return save(stats, storage, now); }
  function recordPartialSavings(bytes, options = {}) { const storage = options.storage || storageDefault(); const now = options.now || new Date(); const stats = currentStats(storage, now); stats.partialSavedBytes += amount(bytes); return save(stats, storage, now); }
  function recordVpnBlocked(options = {}) { const storage = options.storage || storageDefault(); const now = options.now || new Date(); const stats = currentStats(storage, now); stats.blockedByVpn += 1; return save(stats, storage, now); }
  function recordProviderReported(bytes, options = {}) { const storage = options.storage || storageDefault(); const now = options.now || new Date(); const stats = currentStats(storage, now); const n = Number(bytes); stats.providerReportedBytes = bytes == null || bytes === '' ? null : Number.isFinite(n) && n >= 0 ? n : null; return save(stats, storage, now); }
  return Object.freeze({ currentStats, reserveEstimate, recordObserved, recordCacheHit, recordPartialSavings, recordVpnBlocked, recordProviderReported });
}));
