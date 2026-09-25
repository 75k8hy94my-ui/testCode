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

  const activeControllers = new Set();

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

  function abortActiveRemoteReads() {
    activeControllers.forEach((controller) => {
      try { controller.abort(); } catch (_) {}
    });
    activeControllers.clear();
  }

  function releaseController(controller) {
    if (controller) activeControllers.delete(controller);
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
    const abortController = options.abortController && typeof options.abortController.abort === 'function' ? options.abortController : null;
    if (abortController) activeControllers.add(abortController);
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
        releaseController(abortController);
        return ledgerApi.recordObserved(bytes, kind, { storage, now });
      },
      release() {
        releaseController(abortController);
      }
    });
  }

  function recordCacheHit(bytes, options = {}) {
    return ledgerApi.recordCacheHit(bytes, { storage: options.storage, now: options.now || new Date() });
  }

  function recordPartialSavings(bytes, options = {}) {
    return ledgerApi.recordPartialSavings(bytes, { storage: options.storage, now: options.now || new Date() });
  }

  function enforceCurrentVpnPolicy() {
    const settings = settingsApi.load();
    if (settings.vpnRequired && !vpnAllowed(resolveMediaAccess())) abortActiveRemoteReads();
  }

  if (root.document && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener(settingsApi.EVENT_NAME, enforceCurrentVpnPolicy);
    root.document.addEventListener('manga-reader-vpn-status', enforceCurrentVpnPolicy);
  }

  return Object.freeze({
    evaluate,
    acquire,
    recordCacheHit,
    recordPartialSavings,
    abortActiveRemoteReads,
    vpnAllowed,
    createAccessError,
  });
}));
