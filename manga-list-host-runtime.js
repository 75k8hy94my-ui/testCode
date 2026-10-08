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
  const IMAGE_FUNCTION_NAMES = [
    'parseInputUrl',
    'getCachedMangaInfo',
    'getCoverSourceCache',
    'getCoverFailedCache',
    'pageUrlFor',
    'readStorageItem',
    'getSupabaseConfig',
    'getLocalStoragePathFromUrl',
    'loadCachedLocalImage',
    'getLocalCoverObjectUrl',
    'rememberLocalCoverObjectUrl',
    'setTimer',
    'clearTimer',
  ];
  const NAVIGATION_FUNCTION_NAMES = ['navigate', 'buildReaderUrl'];

  function create(deps) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('MangaListHostRuntimeFactory requires dependency object');
    }
    for (const name of ['safeWriteJson', 'getState', 'persistVideos', 'canReadProtectedData']) {
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
    if (!deps.images || typeof deps.images !== 'object' || Array.isArray(deps.images)) {
      throw new TypeError('MangaListHostRuntimeFactory requires image dependency object');
    }
    for (const name of IMAGE_FUNCTION_NAMES) {
      if (typeof deps.images[name] !== 'function') {
        throw new TypeError('MangaListHostRuntimeFactory requires image function: ' + name);
      }
    }
    if (!Array.isArray(deps.images.extCandidates) || typeof deps.images.loadTimeoutMs !== 'number' || typeof deps.images.sessionKey !== 'string' || !deps.images.sessionKey) {
      throw new TypeError('MangaListHostRuntimeFactory requires image constants');
    }
    if (!deps.navigation || typeof deps.navigation !== 'object' || Array.isArray(deps.navigation)) {
      throw new TypeError('MangaListHostRuntimeFactory requires navigation dependency object');
    }
    for (const name of NAVIGATION_FUNCTION_NAMES) {
      if (typeof deps.navigation[name] !== 'function') {
        throw new TypeError('MangaListHostRuntimeFactory requires navigation function: ' + name);
      }
    }
    for (const name of ['readerUrl']) {
      if (typeof deps.navigation[name] !== 'string' || !deps.navigation[name]) {
        throw new TypeError('MangaListHostRuntimeFactory requires navigation value: ' + name);
      }
    }

    let cloudSyncTimer = null;
    let cloudSyncPromise = null;

    function canReadProtectedData() {
      return deps.canReadProtectedData() === true;
    }

    function scheduleCloudSync() {
      if (!canReadProtectedData()) return;
      if (!deps.sync.hasActiveVault()) return;
      deps.sync.clearTimer(cloudSyncTimer);
      cloudSyncTimer = deps.sync.setTimer(runCloudSync, 5000);
    }

    function buildSyncPayload() {
      if (!canReadProtectedData()) return null;
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

    async function runCloudSync({ requireSuccess = false } = {}) {
      if (!canReadProtectedData()) {
        if (requireSuccess) throw new Error('VPN接続を確認できません。');
        return false;
      }
      // Serialize saves. A strict flush always saves a fresh snapshot after
      // any previously queued save has completed, even if that save failed.
      const previous = cloudSyncPromise;
      const pending = (async () => {
        if (previous) await previous.catch(() => {});
        const payload = buildSyncPayload();
        if (!payload || !canReadProtectedData()) throw new Error('同期データにアクセスできません。');
        await deps.sync.savePayload(payload);
      })();
      cloudSyncPromise = pending;
      try {
        await pending;
        return true;
      } catch (error) {
        deps.sync.onSyncError(error && error.message ? error.message : 'クラウド同期に失敗しました', 'cloud-sync-error');
        if (requireSuccess) throw error;
        return false;
      } finally {
        if (cloudSyncPromise === pending) cloudSyncPromise = null;
      }
    }

    async function flushCloudSync() {
      deps.sync.clearTimer(cloudSyncTimer);
      cloudSyncTimer = null;
      return runCloudSync({ requireSuccess: true });
    }

    async function loadLocalCover(item, img) {
      if (!canReadProtectedData()) return;
      if (item?.encryptedAssets?.pages?.length) {
        return deps.images.loadEncryptedCover?.(item, img);
      }
      try {
        const session = JSON.parse(deps.images.readStorageItem(deps.images.sessionKey) || 'null');
        const config = deps.images.getSupabaseConfig() || {};
        const path = (Array.isArray(item.storagePaths) && item.storagePaths[0]) || deps.images.getLocalStoragePathFromUrl(item.pages && item.pages[0]);
        if (!session || !session.access_token || !path || !config.url) return;
        const userId = session.user && session.user.id || session.user_id || '';
        const cacheKey = [config.url, userId, path].join('|');
        const cachedObjectUrl = deps.images.getLocalCoverObjectUrl(cacheKey);
        if (cachedObjectUrl && img.isConnected) { img.src = cachedObjectUrl; return; }
        const objectUrl = await deps.images.loadCachedLocalImage(config, session.access_token, path, item.storageBytes && item.storageBytes[0]);
        if (objectUrl && img.isConnected) {
          deps.images.rememberLocalCoverObjectUrl(cacheKey, objectUrl);
          img.src = objectUrl;
        }
      } catch (_) {}
    }

    function setupFeedImage(imgEl, baseUrlForItem, numberWidth, itemPattern, itemId) {
      if (!canReadProtectedData()) return;
      const parsed = deps.images.parseInputUrl(baseUrlForItem);
      const folderUrl = parsed ? parsed.baseUrl : baseUrlForItem;
      const identityKey = itemId ? 'item:' + String(itemId) : folderUrl;
      const cached = deps.images.getCachedMangaInfo(identityKey, folderUrl);
      const pattern = itemPattern || (parsed && parsed.pattern) || (cached && cached.pattern) || null;
      const resolvedWidth = numberWidth || (cached && cached.numberWidth) || 1;
      const cacheKey = [identityKey, folderUrl, String(resolvedWidth), JSON.stringify(pattern || null), String(cached && cached.ext != null ? cached.ext : '')].join('|');
      const sourceCache = deps.images.getCoverSourceCache();
      const failedCache = deps.images.getCoverFailedCache();
      const cachedSource = sourceCache.get(cacheKey);
      if (cachedSource) {
        imgEl.addEventListener('error', () => {
          sourceCache.delete(cacheKey);
          failedCache.delete(cacheKey);
          setupFeedImage(imgEl, baseUrlForItem, numberWidth, itemPattern, itemId);
        }, { once: true });
        imgEl.src = cachedSource;
        return;
      }
      if (failedCache.has(cacheKey)) return;
      let idx = 0;
      let finished = false;
      let timer = null;
      function tryNext() {
        if (finished || idx >= deps.images.extCandidates.length) {
          failedCache.add(cacheKey);
          return;
        }
        imgEl.src = deps.images.pageUrlFor(folderUrl, 1, idx, resolvedWidth, pattern);
        idx++;
      }
      imgEl.addEventListener('load', () => {
        finished = true;
        deps.images.clearTimer(timer);
        sourceCache.set(cacheKey, imgEl.currentSrc || imgEl.src);
      }, { once: true });
      imgEl.addEventListener('error', () => {
        deps.images.clearTimer(timer);
        if (finished) return;
        if (idx >= deps.images.extCandidates.length) {
          finished = true;
          failedCache.add(cacheKey);
          return;
        }
        tryNext();
      });
      tryNext();
      timer = deps.images.setTimer(() => {
        if (finished) return;
        finished = true;
        failedCache.add(cacheKey);
        imgEl.src = '';
      }, deps.images.loadTimeoutMs);
    }

    function navigateToReader(item) {
      if (!canReadProtectedData()) return false;
      if (!item || !item.id) throw new Error('saved manga item id is required');
      const itemId = String(item.id);

      // Crossing from the bookshelf SPA into reader.html is a document
      // boundary. Checkpoint the current in-memory shelf before navigation so
      // reader.html never has to guess whether localStorage is one render
      // behind the card the user actually tapped.
      const checkpointed = deps.safeWriteJson(deps.keys.savedItems, deps.getState().savedItems);
      if (checkpointed === false) throw new Error('本棚の状態を保存できませんでした。');

      // The saved-item id is the canonical reader identity. Page/base URLs are
      // source locations and may be shared, replaced, or reordered; they must
      // never be used as the route identity for a saved manga.
      deps.navigation.navigate(deps.navigation.buildReaderUrl(itemId, deps.navigation.readerUrl));
      return true;
    }

    function persistFolders() {
      if (!canReadProtectedData()) return false;
      deps.safeWriteJson(deps.keys.savedFolders, deps.getState().savedFolders);
      scheduleCloudSync();
      return true;
    }

    function persistItems() {
      if (!canReadProtectedData()) return false;
      if (deps.safeWriteJson(deps.keys.savedItems, deps.getState().savedItems) === false) return false;
      scheduleCloudSync();
      return true;
    }

    function persistAuthorCards() {
      if (!canReadProtectedData()) return false;
      deps.safeWriteJson(deps.keys.authorCards, deps.getState().authorCards);
      scheduleCloudSync();
      return true;
    }

    function persistAll() {
      if (!canReadProtectedData()) return false;
      persistFolders();
      persistItems();
      persistAuthorCards();
      deps.persistVideos();
      return true;
    }

    return Object.freeze({
      persistItems,
      persistFolders,
      persistAuthorCards,
      persistAll,
      buildSyncPayload,
      runCloudSync,
      flushCloudSync,
      scheduleCloudSync,
      setupFeedImage,
      loadLocalCover,
      navigateToReader,
    });
  }

  root.MangaListHostRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
