(function (root, factory) {
  const api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ImageRemoteAccess = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const settingsApi = typeof require === 'function'
    ? require('./image-transfer-settings.js')
    : (root.ImageTransferSettings || null);
  const ledgerApi = typeof require === 'function'
    ? require('./image-transfer-ledger.js')
    : (root.ImageTransferLedger || null);
  if (!settingsApi || !ledgerApi) throw new Error('Image transfer settings and ledger are required');

  function createAccessError(name, message, code) {
    const error = new Error(message);
    error.name = name;
    error.code = code;
    return error;
  }

  function resolveMediaAccess(options = {}) {
    if (options.mediaAccess) return options.mediaAccess;
    return root.MangaReaderMediaAccess || null;
  }

  function vpnAllowed(mediaAccess) {
    if (!mediaAccess) return false;
    if (typeof mediaAccess.getStatus === 'function' && mediaAccess.getStatus() !== 'allowed') return false;
    return typeof mediaAccess.canLoadExternalMedia === 'function' ? mediaAccess.canLoadExternalMedia() === true : false;
  }

  function evaluate(options = {}) {
    const storage = options.storage;
    const now = options.now || new Date();
    const settings = settingsApi.load(storage, now);
    const mediaAccess = resolveMediaAccess(options);

    if (settings.vpnRequired && !vpnAllowed(mediaAccess)) {
      return {
        allowed: false,
        reason: 'vpn',
        networkMode: settings.networkMode,
        usageBytes: settings.limitUsageBytes,
        limitBytes: settings.dailyLimitBytes,
      };
    }

    const estimatedBytes = Math.max(0, Number(options.estimatedBytes) || 0);
    if (settings.limitUsageBytes + estimatedBytes > settings.dailyLimitBytes) {
      return {
        allowed: false,
        reason: 'limit',
        networkMode: settings.networkMode,
        usageBytes: settings.limitUsageBytes,
        limitBytes: settings.dailyLimitBytes,
      };
    }

    return {
      allowed: true,
      reason: null,
      networkMode: settings.networkMode,
      usageBytes: settings.limitUsageBytes,
      limitBytes: settings.dailyLimitBytes,
    };
  }

  function acquire(options = {}) {
    const storage = options.storage;
    const now = options.now || new Date();
    const decision = evaluate(options);
    if (!decision.allowed) {
      if (decision.reason === 'vpn') {
        ledgerApi.recordVpnBlocked({ storage, now });
        throw createAccessError('ImageVpnRequiredError', 'VPN connection is required for remote image access', 'vpn-required');
      }
      throw createAccessError('ImageTransferLimitError', 'Daily image transfer limit would be exceeded', 'transfer-limit');
    }

    const reserved = ledgerApi.reserveEstimate(options.estimatedBytes, { storage, now });
    if (!reserved.ok) {
      throw createAccessError('ImageTransferLimitError', 'Daily image transfer limit would be exceeded', reserved.reason === 'storage' ? 'transfer-storage' : 'transfer-limit');
    }

    const kind = options.kind === 'preview' ? 'preview' : options.kind === 'zoom' ? 'zoom' : 'other';
    let completed = false;
    return Object.freeze({
      estimatedBytes: reserved.amount,
      kind,
      networkMode: reserved.networkMode,
      usageBytes: reserved.usageBytes,
      limitBytes: reserved.limitBytes,
      recordObserved(bytes) {
        if (completed) return ledgerApi.currentStats(storage, now);
        completed = true;
        return ledgerApi.recordObserved(bytes, kind, { storage, now });
      }
    });
  }

  function recordCacheHit(bytes, options = {}) {
    return ledgerApi.recordCacheHit(bytes, { storage: options.storage, now: options.now || new Date() });
  }

  function recordPartialSavings(bytes, options = {}) {
    return ledgerApi.recordPartialSavings(bytes, { storage: options.storage, now: options.now || new Date() });
  }

  return Object.freeze({
    evaluate,
    acquire,
    recordCacheHit,
    recordPartialSavings,
    vpnAllowed,
    createAccessError,
  });
}));
