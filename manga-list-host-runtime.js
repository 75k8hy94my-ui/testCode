(function (root) {
  'use strict';

  const KEY_NAMES = ['savedItems', 'savedFolders', 'authorCards', 'savedVideos'];
  const SYNC_FUNCTION_NAMES = [
    'hasActiveVault',
    'clearTimer',
    'setTimer',
    'savePayload',
    'buildBasePayload',
    'getSavedVideos',
    'readStorageItem',
    'getMangaInfo',
    'getToc',
    'getTheme',
    'getDashboardVisibility',
    'onSyncError',
  ];

  function create(deps) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('MangaListHostRuntimeFactory requires dependency object');
    }
    for (const name of ['safeWriteJson', 'getState', 'persistVideos']) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListHostRuntimeFactory requires function: ' + name);
      }
    }
    if (!deps.keys || typeof deps.keys !== 'object' || Array.isArray(deps.keys)) {
      throw new TypeError('MangaListHostRuntimeFactory requires keys object');
    }
    for (const name of KEY_NAMES) {
      if (typeof deps.keys[name] !== 'string' || !deps.keys[name]) {
        throw new TypeError('MangaListHostRuntimeFactory requires key: ' + name);
      }
    }

    if (!deps.sync || typeof deps.sync !== 'object' || Array.isArray(deps.sync)) {
      throw new TypeError('MangaListHostRuntimeFactory requires sync dependency object');
    }
    for (const name of SYNC_FUNCTION_NAMES) {
      if (typeof deps.sync[name] !== 'function') {
        throw new TypeError('MangaListHostRuntimeFactory requires sync function: ' + name);
      }
    }

    let cloudSyncTimer = null;
    let cloudSyncRunning = false;
    let cloudSyncDirty = false;

    function scheduleCloudSync() {
      if (!deps.sync.hasActiveVault()) return;
      deps.sync.clearTimer(cloudSyncTimer);
      cloudSyncTimer = deps.sync.setTimer(runCloudSync, 5000);
    }

    function buildSyncPayload() {
      const payload = deps.sync.buildBasePayload();
      let latestVideos = deps.sync.getSavedVideos();
      try {
        const storedVideos = JSON.parse(deps.sync.readStorageItem(deps.keys.savedVideos) || 'null');
        if (Array.isArray(storedVideos)) latestVideos = storedVideos;
      } catch (_) {}
      const state = deps.getState();
      payload.folders = state.savedFolders;
      payload.items = state.savedItems;
      payload.videos = latestVideos;
      payload.authorCards = state.authorCards;
      payload.mangaInfo = deps.sync.getMangaInfo();
      payload.toc = deps.sync.getToc();
      payload.theme = deps.sync.getTheme();
      payload.dashboardVisibility = deps.sync.getDashboardVisibility();
      return payload;
    }

    async function runCloudSync() {
      if (cloudSyncRunning) { cloudSyncDirty = true; return; }
      cloudSyncRunning = true;
      try {
        await deps.sync.savePayload(buildSyncPayload());
      } catch (error) {
        deps.sync.onSyncError(error && error.message ? error.message : 'クラウド同期に失敗しました', 'cloud-sync-error');
      } finally {
        cloudSyncRunning = false;
        if (cloudSyncDirty) { cloudSyncDirty = false; scheduleCloudSync(); }
      }
    }

    function persistFolders() {
      deps.safeWriteJson(deps.keys.savedFolders, deps.getState().savedFolders);
      scheduleCloudSync();
    }

    function persistItems() {
      deps.safeWriteJson(deps.keys.savedItems, deps.getState().savedItems);
      scheduleCloudSync();
    }

    function persistAuthorCards() {
      deps.safeWriteJson(deps.keys.authorCards, deps.getState().authorCards);
      scheduleCloudSync();
    }

    function persistAll() {
      persistFolders();
      persistItems();
      persistAuthorCards();
      deps.persistVideos();
    }

    return Object.freeze({
      persistItems,
      persistFolders,
      persistAuthorCards,
      persistAll,
      buildSyncPayload,
      runCloudSync,
      scheduleCloudSync,
    });
  }

  root.MangaListHostRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
