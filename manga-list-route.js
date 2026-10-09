(function (root) {
  'use strict';

  const STYLESHEET_URL = 'manga-list.css?v=20261009-guest-mode';
  const SCRIPT_URLS = [
    ['manga-list-template.js?v=20261009-desktop-liquid-pager', 'mangaRouteTemplate'],
    ['manga-import-validator.js?v=20261007-momon-import', 'mangaImportValidator'],
    ['manga-import-candidate.js?v=20261007-momon-import', 'mangaImportCandidate'],
    ['manga-import-author-sync.js?v=20261007-momon-import', 'mangaImportAuthorSync'],
    ['manga-import-batch.js?v=20261007-momon-import', 'mangaImportBatch'],
    ['manga-import-bridge.js?v=20261007-momon-import', 'mangaImportBridge'],
    ['manga-import-dialog.js?v=20261007-momon-import', 'mangaImportDialog'],
    ['image-transfer-settings.js?v=20261004-encrypted-image-import', 'encryptedImageImportSettings'],
    ['image-remote-access.js?v=20261004-encrypted-image-import', 'encryptedImageImportRemoteAccess'],
    ['encrypted-asset-crypto.js?v=20261004-encrypted-image-import', 'encryptedImageImportCrypto'],
    ['encrypted-asset-cache.js?v=20261004-encrypted-image-import', 'encryptedImageImportCache'],
    ['encrypted-asset-backend.js?v=20261004-encrypted-image-import', 'encryptedImageImportBackend'],
    ['encrypted-asset-storage.js?v=20261004-encrypted-image-import', 'encryptedImageImportStorage'],
    ['encrypted-asset-sync.js?v=20261004-encrypted-image-import', 'encryptedImageImportSync'],
    ['image-compression-profile.js?v=20261004-encrypted-image-import', 'encryptedImageImportProfile'],
    ['image-pyramid-builder.js?v=20261004-encrypted-image-import', 'encryptedImageImportPyramid'],
    ['image-photo-processor.js?v=20261004-encrypted-image-import', 'encryptedImageImportProcessor'],
    ['encrypted-asset-reader.js?v=20261004-encrypted-image-import', 'encryptedImageImportReader'],
    ['encrypted-asset-item.js?v=20261004-encrypted-image-import', 'encryptedImageImportItem'],
    ['encrypted-asset-import.js?v=20261004-import-ui', 'encryptedImageImport'],
    ['manga-list-search-events.js?v=20260922-search-events', 'mangaRouteSearchEvents'],
    ['manga-list-sort-events.js?v=20260922-sort-events', 'mangaRouteSortEvents'],
    ['manga-list-filter-events.js?v=20260922-filter-events', 'mangaRouteFilterEvents'],
    ['manga-list-folder-events.js?v=20260922-folder-events', 'mangaRouteFolderEvents'],
    ['manga-list-smart-list-events.js?v=20260922-smart-events', 'mangaRouteSmartEvents'],
    ['manga-list-pagination-events.js?v=20261009-touch-swipe', 'mangaRoutePaginationEvents'],
    ['manga-list-navigation-events.js?v=20260922-navigation-events', 'mangaRouteNavigationEvents'],
    ['manga-list-bulk-events.js?v=20260922-bulk-events', 'mangaRouteBulkEvents'],
    ['manga-list-dom-resolver.js?v=20260922-dom-resolver', 'mangaRouteResolver'],
    ['manga-list-elements.js?v=20260922-elements', 'mangaRouteElements'],
    ['manga-list-mount.js?v=20260922-mount', 'mangaRouteMount'],
    ['manga-list-card.js?v=20261009-cover-controls', 'mangaRouteCard'],
    ['manga-list-state.js?v=20260922-state', 'mangaRouteState'],
    ['manga-list-view-model.js?v=20261009-shelf-pagination', 'mangaRouteViewModel'],
    ['manga-list-renderer.js?v=20261009-desktop-liquid-pager', 'mangaRouteRenderer'],
    ['manga-list-state-runtime.js?v=20260922-state-runtime', 'mangaRouteStateRuntime'],
    ['manga-list-render-runtime.js?v=20260922-render-runtime', 'mangaRouteRenderRuntime'],
    ['manga-list-bootstrap.js?v=20260922-bootstrap', 'mangaRouteBootstrap'],
    ['manga-list-controller.js?v=20260922-controller', 'mangaRouteController'],
    ['manga-list-runtime-context.js?v=20260922-runtime-context', 'mangaRouteContext'],
    ['manga-list-cover-cache.js?v=20261008-cover-cache', 'mangaRouteCoverCache'],
    ['manga-list-image-cache.js?v=20260922-image-cache', 'mangaRouteImageCache'],
    ['reader-target.js?v=20261003-reader-launch-contract', 'mangaReaderTarget'],
    ['manga-list-host-runtime.js?v=20261009-vault-sync-guest', 'mangaRouteHost'],
    ['manga-list-runtime.js?v=20261009-guest-mode', 'mangaRouteRuntime'],
    ['manga-list-entry.js?v=20260922-entry', 'mangaRouteEntry'],
  ];

  let dependencyPromise = null;
  let stylesheetPromise = null;

  function ensureStylesheet(documentRef) {
    // If this route already started loading its stylesheet, every concurrent
    // route start must wait for that same load. Resolving merely because the
    // <link> exists would reintroduce an unstyled-mount race.
    if (stylesheetPromise) return stylesheetPromise;
    const existing = Array.from(documentRef.querySelectorAll('link[rel="stylesheet"]')).find((link) => {
      return String(link.getAttribute('href') || '').includes('manga-list.css');
    });
    if (existing) return Promise.resolve(existing);
    stylesheetPromise = new Promise((resolve, reject) => {
      const link = documentRef.createElement('link');
      link.rel = 'stylesheet';
      link.href = STYLESHEET_URL;
      link.dataset.mangaListRouteStyle = '1';
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        link.remove();
        stylesheetPromise = null;
        reject(new Error('manga list stylesheet failed to load'));
      }, { once: true });
      documentRef.head.appendChild(link);
    });
    return stylesheetPromise;
  }

  function loadScript(src, id, documentRef) {
    const existing = documentRef.getElementById(id);
    if (existing) {
      if (existing.dataset.loaded === '1') return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = documentRef.createElement('script');
      script.id = id;
      script.src = src;
      // Ordered dynamic classic scripts download in parallel but execute in
      // insertion order, preserving the module graph without serial RTTs.
      script.async = false;
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once: true });
      script.addEventListener('error', reject, { once: true });
      documentRef.body.appendChild(script);
    });
  }

  function loadDependencies(documentRef) {
    if (!dependencyPromise) {
      dependencyPromise = Promise.all(SCRIPT_URLS.map(([src, id]) => loadScript(src, id, documentRef)));
    }
    return dependencyPromise;
  }

  function createState(storage, keys, canReadProtectedData) {
    let legacyMigrated = false;
    let state = {
      savedItems: [], savedFolders: [], authorCards: [], savedVideos: [],
      currentFolderView: null, currentSeriesView: null, currentAuthorView: null,
      shelfSearchQuery: '', shelfFilters: { series: '', author: '', tags: '', source: '' },
      shelfSort: 'added-desc', bookshelfPage: 1, reorderMode: false,
      bulkEditMode: false, bulkSelectedIds: new Set(), recentlyClosedItemId: null,
      recentlyClosedFolderId: null, groupByAuthorEnabled: false,
    };
    return {
      get() { return state; },
      set(next) { state = Object.assign(state, next); return state; },
      load() {
        if (!canReadProtectedData()) {
          state = Object.assign(state, { savedItems: [], savedFolders: [], authorCards: [], savedVideos: [] });
          legacyMigrated = false;
          return state;
        }
        const loaded = MangaListState.load({ storage, keys });
        if (!loaded.savedItems.length) {
          try {
            const legacy = JSON.parse(storage.getItem('mangaReaderSavedUrls') || '[]');
            if (Array.isArray(legacy) && legacy.length) {
              legacyMigrated = true;
              loaded.savedItems = legacy.map((item) => ({
                id: 'i-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                url: item.url,
                title: item.title || item.url,
                folderId: null,
                addedAt: item.addedAt || Date.now(),
              }));
            }
          } catch (_) {}
        }
        let videos = [];
        try { videos = JSON.parse(storage.getItem(keys.savedVideos) || '[]'); } catch (_) {}
        state = Object.assign(state, loaded, { savedVideos: Array.isArray(videos) ? videos : [] });
        return state;
      },
      wasLegacyMigrated() { return legacyMigrated; },
    };
  }

  function installVpnControls(rootElement, documentRef) {
    if (!rootElement || rootElement.querySelector('[data-vpn-header="manga-list"]')) return;
    const controls = documentRef.createElement('div');
    controls.className = 'listHeaderControls vpnListControls';
    controls.dataset.vpnHeader = 'manga-list';
    controls.setAttribute('aria-label', 'VPN状態');

    const recheck = documentRef.createElement('button');
    recheck.className = 'ctrlBtn vpnStatusButton vpnRecheckButton';
    recheck.type = 'button';
    recheck.dataset.vpnStatusButton = '1';
    recheck.dataset.vpnRecheckButton = '1';
    recheck.title = 'VPN接続を完全に再確認します';
    recheck.textContent = 'VPN確認中';

    const diagnostics = documentRef.createElement('button');
    diagnostics.className = 'ctrlBtn vpnDiagnosticsButton';
    diagnostics.type = 'button';
    diagnostics.dataset.vpnDiagnosticsButton = '1';
    diagnostics.textContent = 'VPN診断';

    controls.append(recheck, diagnostics);
    rootElement.insertBefore(controls, rootElement.firstChild);
  }

  function createRoute(deps) {
    if (!deps || typeof deps !== 'object' || !deps.documentRef || !deps.windowRef) {
      throw new TypeError('MangaListRouteFactory requires documentRef and windowRef');
    }
    const documentRef = deps.documentRef;
    const windowRef = deps.windowRef;
    const mediaAccess = deps.mediaAccess || windowRef.MangaReaderMediaAccess;
    const canReadProtectedData = () => !!mediaAccess && typeof mediaAccess.canReadProtectedData === 'function' && mediaAccess.canReadProtectedData() === true;
    let activeEntry = null;
    let lifecycle = 0;
    let encryptedCoverLoader = null;
    let encryptedCoverCache = null;

    async function start(input) {
      if (!input || !input.mountElement) throw new TypeError('MangaListRouteFactory requires mountElement');
      const token = ++lifecycle;
      if (activeEntry) {
        activeEntry.cleanup();
        activeEntry = null;
      }
      encryptedCoverLoader?.destroy();
      encryptedCoverLoader = null;
      await Promise.all([ensureStylesheet(documentRef), loadDependencies(documentRef)]);
      if (token !== lifecycle) return null;
      const storage = windowRef.localStorage;
      const keys = {
        savedItems: 'mangaReaderSavedItems',
        savedFolders: 'mangaReaderSavedFolders',
        authorCards: 'mangaReaderAuthorCards',
        savedVideos: 'mangaReaderVideos',
      };
      const data = createState(storage, keys, canReadProtectedData);
      // Only opaque IDs are recorded. Network cleanup is deferred while VPN access is blocked.
      const cleanupQueueKey = 'mangaReaderPendingEncryptedAssetCleanup';
      const sessionUserId = () => {
        const session = windowRef.MangaVault?.loadSession?.();
        return String(session?.user?.id || session?.user_id || '');
      };
      const readCleanupQueue = () => {
        try {
          const value = JSON.parse(storage.getItem(cleanupQueueKey) || '[]');
          return Array.isArray(value) ? value.filter(item => item && typeof item.assetId === 'string' && Number.isInteger(item.revision) && typeof item.userId === 'string') : [];
        } catch (_) { return []; }
      };
      const writeCleanupQueue = (entries) => storage.setItem(cleanupQueueKey, JSON.stringify(entries));
      const enqueueCleanup = (assetId, revision) => {
        const userId = sessionUserId();
        if (!userId) return;
        const current = readCleanupQueue();
        if (!current.some(item => item.userId === userId && item.assetId === assetId && item.revision === revision)) {
          writeCleanupQueue([...current, { userId, assetId, revision }].slice(-2000));
        }
      };
      const discardOrQueue = async ({ assetId, revision, cache, storageTransport }) => {
        try {
          if (!canReadProtectedData()) throw new Error('VPN切断のため画像の後始末を保留しました。');
          await windowRef.EncryptedAssetSync.discardImportedAsset({
            vault: windowRef.MangaVault, storage: storageTransport, cache, assetId, expectedRevision: revision
          });
        } catch (error) {
          enqueueCleanup(assetId, revision);
          throw error;
        }
      };
      let cleanupRetry = null;
      const retryPendingCleanup = () => {
        if (cleanupRetry || !canReadProtectedData() || !windowRef.MangaVault?.loadActive?.()) return cleanupRetry;
        cleanupRetry = (async () => {
          const userId = sessionUserId();
          const records = readCleanupQueue().filter(item => item.userId === userId);
          if (!userId || !records.length) return;
          const config = windowRef.MANGA_READER_SUPABASE || {};
          const cache = windowRef.EncryptedAssetCache.createCache();
          const storageTransport = windowRef.EncryptedAssetStorage.createStorageTransport({ baseUrl: config.url, publishableKey: config.publishableKey });
          for (const entry of records) {
            if (!canReadProtectedData()) break;
            try {
              await discardOrQueue({ assetId: entry.assetId, revision: entry.revision, cache, storageTransport });
              writeCleanupQueue(readCleanupQueue().filter(item => !(item.userId === userId && item.assetId === entry.assetId && item.revision === entry.revision)));
            } catch (_) { /* Keep the item for the next authorized retry. */ }
          }
        })().catch(() => { /* Keep queued cleanup for the next authorized retry. */ }).finally(() => { cleanupRetry = null; });
        return cleanupRetry;
      };
      let runtime = null;
      let elements = null;
      const coverCache = windowRef.MangaListCoverCache;
      if (!coverCache) throw new Error('manga cover cache failed to load');
      const loadEncryptedCover = (item, img) => {
        const first = item?.encryptedAssets?.pages?.[0];
        const active = windowRef.MangaVault?.loadActive?.();
        if (!first || !active?.rawKey || !canReadProtectedData()) return Promise.resolve();
        const config = windowRef.MANGA_READER_SUPABASE || {};
        const cache = (encryptedCoverCache ||= windowRef.EncryptedAssetCache.createCache());
        const loader = (encryptedCoverLoader ||= windowRef.EncryptedAssetReader.createPreviewLoader({ maxEntries: 64 }));
        const storageTransport = windowRef.EncryptedAssetStorage.createStorageTransport({ baseUrl: config.url, publishableKey: config.publishableKey });
        return loader.load({
          manifest: first.manifest, assetId: first.assetId, revision: first.revision,
          masterKey: active.rawKey, vault: windowRef.MangaVault, storage: storageTransport,
          cache, transferStorage: windowRef.localStorage, mediaAccess: windowRef.MangaReaderMediaAccess,
          sync: windowRef.EncryptedAssetSync, crypto: windowRef.EncryptedAssetCrypto,
        }).then(({ url }) => {
          // A new card may not yet be attached when a cached preview settles.
          if (canReadProtectedData()) img.src = url;
        }).catch(() => {
          if (canReadProtectedData() && img.dataset) img.dataset.coverState = 'failed';
          // Never fall back to a public URL for a protected encrypted asset.
        });
      };
      const coverFailedCache = new Set();
      const extCandidates = ['jpg', 'jpeg', 'png', 'webp'];
      const iconFolder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Cpath d="M3 6a2 2 0 0 1 2-2h4.5a2 2 0 0 1 1.6.8L12.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" fill="%238d93a3"/%3E%3C/svg%3E';
      const iconBooks = iconFolder;
      const config = {
        ICON_FOLDER: iconFolder, ICON_HEART_FILLED: iconFolder, ICON_BOOKS: iconBooks,
        HISTORY_FOLDER_ID: '__history__', HISTORY_FOLDER_NAME: '履歴',
        FAVORITES_FOLDER_ID: '__favorites__', FAVORITES_FOLDER_NAME: 'お気に入り',
        SERIES_FOLDER_ID: '__series__', SERIES_FOLDER_NAME: 'シリーズ',
        UNREAD_FOLDER_ID: '__unread_order__', UNREAD_FOLDER_NAME: '読んでいない順',
        BOOKSHELF_PAGE_SIZE: 25,
      };
      const safeWriteJson = (key, value) => {
        if (windowRef.MangaReaderStorage && typeof windowRef.MangaReaderStorage.safeWriteJson === 'function') {
          windowRef.MangaReaderStorage.safeWriteJson(key, value);
        } else storage.setItem(key, JSON.stringify(value));
      };
      const transferLimitKey = 'mangaReaderStorageTransferLimitDaily';
      const transferUsageKey = 'mangaReaderStorageTransferUsageDaily';
      const transferDayKey = () => new Date().toISOString().slice(0, 10);
      const transferLimitBytes = () => {
        const value = Number(storage.getItem(transferLimitKey));
        return Number.isFinite(value) && value > 0 ? value : 150 * 1024 * 1024;
      };
      const transferUsageBytes = () => {
        try {
          const saved = JSON.parse(storage.getItem(transferUsageKey) || 'null');
          return saved && saved.day === transferDayKey() ? Number(saved.bytes) || 0 : 0;
        } catch (_) { return 0; }
      };
      const recordTransferEstimate = (bytes) => {
        const amount = Math.max(0, Number(bytes) || 0);
        if (transferUsageBytes() + amount > transferLimitBytes()) return false;
        safeWriteJson(transferUsageKey, { day: transferDayKey(), bytes: transferUsageBytes() + amount });
        return true;
      };
      const parseInputUrl = (value) => {
        let url = String(value || '').trim();
        if (!url) return null;
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        try {
          const parsed = new URL(url);
          if (!/^https?:$/.test(parsed.protocol)) return null;
          const path = parsed.pathname.replace(/[^/]+$/, '');
          return { baseUrl: new URL(path, parsed.origin).href, pattern: null };
        } catch (_) { return null; }
      };
      const pageUrlFor = (base, page, index, width, pattern) =>
        base + (pattern?.prefix || '') + String(page).padStart(Math.max(1, Number(width) || 1), '0') +
        (pattern?.suffix || '') + '.' + extCandidates[index];
      const readInfo = (key) => { try { const value = JSON.parse(storage.getItem(key) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } };
      const getCachedMangaInfo = (identityKey, legacySourceKey) => {
        const cache = readInfo('mangaReaderInfoCache');
        if (cache[identityKey]) return cache[identityKey];
        if (String(identityKey || '').startsWith('item:') && legacySourceKey && cache[legacySourceKey]) {
          cache[identityKey] = cache[legacySourceKey];
          safeWriteJson('mangaReaderInfoCache', cache);
          return cache[identityKey];
        }
        return null;
      };
      const getLocalStoragePathFromUrl = (value) => {
        try { const path = new URL(value).pathname; const marker = '/storage/v1/object/public/local-manga/'; return path.includes(marker) ? path.slice(path.indexOf(marker) + marker.length) : ''; } catch (_) { return ''; }
      };
      const imageCache = MangaListImageCacheFactory.create({
        indexedDB: windowRef.indexedDB,
        urlApi: windowRef.URL,
        fetch: windowRef.fetch.bind(windowRef),
        readStorageItem: (key) => storage.getItem(key),
        sessionKey: 'mangaReaderSupabaseSession',
        recordTransferEstimate,
      });
      const host = MangaListHostRuntimeFactory.create({
        safeWriteJson, getState: data.get, persistVideos() { if (canReadProtectedData()) safeWriteJson(keys.savedVideos, data.get().savedVideos); }, canReadProtectedData, keys,
        sync: {
          hasActiveVault: () => !!(windowRef.MangaVault && windowRef.MangaVault.loadActive()),
          clearTimer: (timer) => { if (timer) windowRef.clearTimeout(timer); },
          setTimer: (callback, delay) => windowRef.setTimeout(callback, delay),
          saveLocalChanges: () => windowRef.MangaVault.saveLocalChanges(),
          buildBasePayload: () => windowRef.MangaVaultPayload.buildFromLocalStorage(),
          getSavedVideos: () => data.get().savedVideos,
          readStorageItem: (key) => storage.getItem(key),
          getMangaInfo: () => readInfo('mangaReaderInfoCache'),
          getToc: () => readInfo('mangaReaderToc'),
          getTheme: () => documentRef.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
          getDashboardVisibility: () => ({}),
          onSyncError: () => {},
        },
        images: {
          parseInputUrl, getCachedMangaInfo, getCoverSourceCache: coverCache.getSourceCache,
          getCoverFailedCache: () => coverFailedCache, pageUrlFor, extCandidates, loadTimeoutMs: 60000,
          sessionKey: 'mangaReaderSupabaseSession', readStorageItem: (key) => storage.getItem(key),
          getSupabaseConfig: () => windowRef.MANGA_READER_SUPABASE || {}, getLocalStoragePathFromUrl, loadEncryptedCover,
          loadCachedLocalImage: imageCache.loadCachedLocalImage,
          getLocalCoverObjectUrl: coverCache.getLocalCover, rememberLocalCoverObjectUrl: coverCache.rememberLocalCover,
          revokeLocalCoverObjectUrl: (url) => { if (url) windowRef.URL.revokeObjectURL(url); },
          setTimer: (callback, delay) => windowRef.setTimeout(callback, delay),
          clearTimer: (timer) => windowRef.clearTimeout(timer),
        },
        navigation: {
          readerUrl: 'reader.html',
          buildReaderUrl: (itemId, base) => windowRef.MangaReaderTarget.buildReaderUrl(itemId, base),
          // Reader is a separate document; the URL item id is its only route identity.
          navigate: (url) => {
            if (windowRef.location && typeof windowRef.location.assign === 'function') windowRef.location.assign(url);
            else windowRef.location.href = url;
          },
        },
      });
      const state = data.get;
      const setState = data.set;
      const renderList = () => runtime.renderSavedList();
      const title = (item) => item.title || item.url || '無題';
      const itemSubtext = (item) => item.url || '';
      const readingRecordText = (item) => item.lastReadAt ? '既読' : '未読';
      const pageCount = (item) => Array.isArray(item.encryptedAssets?.pages)
        ? item.encryptedAssets.pages.length + 'ページ'
        : Array.isArray(item.pages) ? item.pages.length + 'ページ' : '';
      const visibleItems = () => {
        return state().savedItems.filter((item) => !item.localSync && !item.encryptedAssets?.pages?.length).slice();
      };
      const appendFolderPreview = (cover, items, emptyIcon, emptyAlt, kindLabel) => {
        const preview = items.slice(0, 4); if (!preview.length) { const img = documentRef.createElement('img'); img.src = emptyIcon; img.alt = emptyAlt; cover.appendChild(img); return; }
        const box = documentRef.createElement('div'); box.className = 'folder-preview preview-count-' + preview.length;
        preview.forEach((item) => {
          const img = documentRef.createElement('img');
          img.alt = title(item);
          img.fetchPriority = 'auto';
          const first = item.pageManifest?.version === 1 && item.pageManifest.pages?.[0]
            || item.pages?.[0] || '';
          if (item.encryptedAssets?.pages?.length || item.localSync) {
            img.addEventListener('load', () => { if (img.dataset) img.dataset.coverState = 'loaded'; });
            img.addEventListener('error', () => { if (img.dataset) img.dataset.coverState = 'failed'; });
            void host.loadLocalCover(item, img);
          } else host.setupFeedImage(img, item.url, item.numberWidth, item.pagePattern, item.id, first);
          box.appendChild(img);
        });
        cover.appendChild(box); const badge = documentRef.createElement('span'); badge.className = 'folder-kind-badge'; badge.textContent = kindLabel || 'フォルダ'; cover.appendChild(badge);
      };
      const makeHeartIcon = (active) => {
        // The previous icon was an <img> without a src, so every favorite
        // control rendered a broken image. Use a self-contained SVG with an
        // explicit filled/outline state and no extra asset request.
        const img = documentRef.createElement('img');
        const fill = active ? '#ff6b4a' : 'none';
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
          '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" ' +
          'fill="' + fill + '" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.width = 18;
        img.height = 18;
        return img;
      };
      const moveItemInList = (item, list, direction) => { const index = list.indexOf(item); const other = list[index + direction]; if (!other) return; const items = state().savedItems; const a = items.indexOf(item); const b = items.indexOf(other); if (a < 0 || b < 0) return; [items[a], items[b]] = [items[b], items[a]]; host.persistAll(); renderList(); };
      const moveFolderInList = (folder, list, direction) => { const index = list.indexOf(folder); const other = list[index + direction]; if (!other) return; const folders = state().savedFolders; const a = folders.indexOf(folder); const b = folders.indexOf(other); if (a < 0 || b < 0) return; [folders[a], folders[b]] = [folders[b], folders[a]]; host.persistFolders(); renderList(); };
      const updateBulkEditButton = () => {
        if (!elements) return;
        const current = state();
        elements.bulkEditBtn.textContent = current.bulkEditMode ? '選択完了 (' + current.bulkSelectedIds.size + ')' : '一括編集';
        elements.bulkEditBtn.classList.toggle('active', current.bulkEditMode);
        elements.undoBulkEditBtn.style.display = 'none';
      };
      const buildVirtualCard = (label, icon, items, update) => { const card = documentRef.createElement('div'); card.className = 'book-card folder-card'; const cover = documentRef.createElement('div'); cover.className = 'book-cover folder-cover'; appendFolderPreview(cover, items, icon, label, label); const text = documentRef.createElement('div'); text.className = 'book-title'; text.textContent = label; card.append(cover, text); card.addEventListener('click', () => { update(); renderList(); }); return card; };
      const buildFavoritesFolderCard = () => buildVirtualCard('お気に入り', iconFolder, visibleItems().filter((item) => item.favorite), () => setState({ currentFolderView: config.FAVORITES_FOLDER_ID, currentSeriesView: null, bookshelfPage: 1 }));
      const buildSeriesFolderCard = () => buildVirtualCard('シリーズ', iconBooks, visibleItems().filter((item) => item.series), () => setState({ currentFolderView: config.SERIES_FOLDER_ID, currentSeriesView: null, bookshelfPage: 1 }));
      const buildSeriesGroupCard = (group) => buildVirtualCard(group.name, iconBooks, group.items, () => setState({ currentFolderView: config.SERIES_FOLDER_ID, currentSeriesView: group.name, bookshelfPage: 1 }));
      const buildAuthorGroupCard = (group) => buildVirtualCard(group.name, iconFolder, group.items, () => setState({ currentAuthorView: group.name, bookshelfPage: 1 }));
      const buildSearchText = (item) => [title(item), item.author, item.series, ...(Array.isArray(item.tags) ? item.tags : []), item.url].filter(Boolean).join(' ');
      const renderDashboard = (show) => {
        if (!elements || !elements.dashboard) return;
        elements.dashboard.hidden = !show;
        if (!show) { elements.dashboard.replaceChildren(); return; }
        elements.dashboard.replaceChildren();
        const recent = visibleItems().slice().sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0)).slice(0, 4);
        if (!recent.length) return;
        const heading = documentRef.createElement('strong'); heading.textContent = '最近追加';
        const row = documentRef.createElement('div'); row.className = 'dashboard-row';
        recent.forEach((item) => { const button = documentRef.createElement('button'); button.type = 'button'; button.className = 'ctrlBtn'; button.textContent = title(item); button.addEventListener('click', () => host.navigateToReader(item)); row.appendChild(button); });
        elements.dashboard.append(heading, row);
      };
      const renderAuthorDashboard = (show) => { if (elements && elements.dashboard && !show) elements.dashboard.replaceChildren(); };
      const contextDeps = {
        getState: state, setState, getElements: () => elements, getDocument: () => documentRef, getConfig: () => config,
        getSavedVideos: () => state().savedVideos, clearLocalCoverObjectUrls: coverCache.clear,
        confirmAction: (message) => windowRef.confirm(message), setTimeout: windowRef.setTimeout.bind(windowRef),
        persistItems: host.persistItems, persistFolders: host.persistFolders, persistAuthorCards: host.persistAuthorCards, persistAll: host.persistAll, scheduleCloudSync: host.scheduleCloudSync,
        openReader: (item) => host.navigateToReader(item), accessMedia: host.setupFeedImage,
        renderDashboard, renderAuthorDashboard,
        getVisibleItems: visibleItems, appendFolderPreview, createStaticCard: (input) => MangaListCardBoundary.createStaticCard(input), loadLocalCover: host.loadLocalCover, getCoverSourceCache: coverCache.getSourceCache, setupFeedImage: host.setupFeedImage,
        makeHeartIcon, moveItemInList, moveFolderInList, renderList,
        updateBulkEditButton, shelfVisibleItems: visibleItems, unreadOrderItems: () => visibleItems().filter((item) => !item.lastReadAt), itemDisplayTitle: title, itemSubtext, readingRecordText, itemPageCountText: pageCount,
        buildFavoritesFolderCard, buildSeriesFolderCard, buildSeriesGroupCard, buildAuthorGroupCard, buildSearchText,
        deriveViewModel: (input) => MangaListViewModel.derive(input), renderCards: (input) => MangaListRenderer.render(input), createDocumentFragment: () => documentRef.createDocumentFragment(),
      };
      const context = MangaListRuntimeContextFactory.create(contextDeps);
      runtime = MangaListRuntimeFactory.create(context);
      const synchronizeAuthors = (loaded) => {
        const existingCount = loaded.authorCards.length;
        const synced = windowRef.MangaImportAuthorSync.synchronize({
          savedItems: loaded.savedItems,
          authorCards: loaded.authorCards,
          createId: () => 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
          now: () => Date.now(),
        });
        // Preserve the previous route's newest-first order for newly discovered authors.
        const added = synced.authorCards.slice(existingCount).reverse();
        loaded.authorCards = [...added, ...synced.authorCards.slice(0, existingCount)];
        Object.assign(state(), loaded);
        if (data.wasLegacyMigrated()) host.persistItems();
        if (synced.changed) host.persistAuthorCards();
        return loaded;
      };
      const eventBindings = () => {
        const cleanups = [];
        const bind = (node, type, handler) => { node.addEventListener(type, handler); cleanups.push(() => node.removeEventListener(type, handler)); };
        const bindFactory = (factory, deps, factoryElements) => {
          const cleanup = factory.create(deps).bind(factoryElements);
          cleanups.push(cleanup);
        };
        const rootElement = elements.savedListItems.closest('#mangaListSection');
        const search = rootElement.querySelector('#shelfSearchInput');
        const sort = rootElement.querySelector('#shelfSortSelect');
        const filter = rootElement.querySelector('#filterBtn');
        const apply = rootElement.querySelector('#applyFilterBtn');
        const clear = rootElement.querySelector('#clearFilterBtn');
        const newFolder = elements.listNewFolderBtn;
        const newFolderRow = elements.listNewFolderRow;
        const newFolderInput = rootElement.querySelector('#listNewFolderInput');
        const newFolderConfirm = rootElement.querySelector('#listNewFolderConfirmBtn');
        const editShelf = elements.editShelfBtn;
        const groupAuthor = elements.groupAuthorBtn;
        const history = elements.historyListBtn;
        const unread = elements.unreadListBtn;
        const back = elements.listBackBtn;
        const prev = elements.bookshelfPrevBtn;
        const next = elements.bookshelfNextBtn;
        bind(documentRef, 'manga-reader-vpn-status', (event) => {
          if (event?.detail?.status === 'allowed') void retryPendingCleanup();
        });
        const bulkDetect = rootElement.querySelector('#bulkDetectBtn');
        const mangaImportRegister = rootElement.querySelector('#mangaImportRegisterButton');
        const mangaImportCancel = rootElement.querySelector('#mangaImportCancelButton');
        const importBridge = windowRef.MangaImportBridge.create({ windowRef, origin: windowRef.location.origin });
        const mangaImportController = windowRef.MangaImportDialog.create({ documentRef, validator: windowRef.MangaImportValidator, candidateFactory: windowRef.MangaImportCandidate });
        const importBatch = windowRef.MangaImportBatch.create({
          getState: state,
          setState,
          validator: windowRef.MangaImportValidator,
          candidateFactory: windowRef.MangaImportCandidate,
          authorSync: windowRef.MangaImportAuthorSync,
          persistItems: host.persistItems,
          persistAuthorCards: host.persistAuthorCards,
          render: renderList,
          createId: () => 'i-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
          now: () => Date.now(),
        });
        bind(mangaImportCancel, 'click', () => mangaImportController.close());
        bind(bulkDetect, 'click', async () => {
          if (!canReadProtectedData()) return;
          bulkDetect.disabled = true;
          try {
            const queued = await importBridge.requestQueuedCandidates();
            if (!canReadProtectedData()) return;
            if (!queued.length) { windowRef.alert('拡張機能のキューに作品がありません。'); return; }
            mangaImportController.open(queued, state().savedItems, state().authorCards);
          } catch (error) {
            windowRef.alert(error?.message || '拡張機能からキューを読み込めませんでした。');
          } finally {
            bulkDetect.disabled = !canReadProtectedData();
          }
        });
        bind(mangaImportRegister, 'click', async () => {
          if (!canReadProtectedData()) return;
          const selection = mangaImportController.getSelection();
          if (!selection.items.length) { mangaImportController.setStatus('登録する作品を選択してください。'); return; }
          const checked = windowRef.MangaImportValidator.validateBatch(selection.items.map((item) => item.candidate));
          if (!checked.ok) {
            mangaImportController.setStatus('入力内容を確認してください：' + checked.errors.map((error) => error.message).join('、'));
            return;
          }
          mangaImportRegister.disabled = true;
          try {
            if (!canReadProtectedData()) return;
            const result = importBatch.register(selection);
            if (!result.ok) { mangaImportController.setStatus('登録を中止しました：' + result.errors.map((error) => error.message || error).join('、')); return; }
            if (!result.registeredQueueIds.length) { mangaImportController.setStatus('新しい作品はありません。重複作品は登録されませんでした。'); return; }
            mangaImportController.setStatus(`${result.registeredQueueIds.length}作品を本棚へ登録しました。`);
            if (canReadProtectedData() && windowRef.confirm(`${result.registeredQueueIds.length}作品を登録しました。登録済みの拡張機能キューから削除しますか？`)) {
              try {
                const removed = await importBridge.removeQueuedCandidates(result.registeredQueueIds);
                if (canReadProtectedData()) mangaImportController.setStatus(`${result.registeredQueueIds.length}作品を登録し、キューから${removed.length}件を削除しました。`);
              } catch (error) {
                mangaImportController.setStatus(`作品は登録済みですが、キュー削除に失敗しました：${error?.message || '不明なエラー'}`);
              }
            }
          } catch (error) {
            mangaImportController.setStatus(error?.message || '登録できませんでした。');
          } finally {
            mangaImportRegister.disabled = !canReadProtectedData();
          }
        });
        bindFactory(MangaListSearchEventsFactory, { onSearchChange: (value) => { setState({ shelfSearchQuery: value, bookshelfPage: 1 }); renderList(); } }, { searchInput: search });
        bindFactory(MangaListSortEventsFactory, { onSortChange: (value) => { setState({ shelfSort: value, bookshelfPage: 1 }); renderList(); } }, { sortSelect: sort });
        bindFactory(MangaListFilterEventsFactory, {
          onToggle: () => { rootElement.querySelector('#filterRow').style.display = ''; },
          onApply: () => { setState({ shelfFilters: { series: rootElement.querySelector('#filterSeriesInput').value, author: rootElement.querySelector('#filterAuthorInput').value, tags: rootElement.querySelector('#filterTagsInput').value, source: rootElement.querySelector('#filterSourceInput').value }, bookshelfPage: 1 }); renderList(); },
          onClear: () => { setState({ shelfFilters: { series: '', author: '', tags: '', source: '' }, bookshelfPage: 1 }); renderList(); },
        }, { filterButton: filter, applyButton: apply, clearButton: clear });
        bindFactory(MangaListFolderEventsFactory, {
          onCreateStart: () => { newFolderRow.style.display = ''; if (newFolderInput) newFolderInput.focus(); },
          onCreateConfirm: () => {
            if (!canReadProtectedData()) return;
            const name = newFolderInput && newFolderInput.value.trim();
            if (!name) return;
            const folders = state().savedFolders.slice();
            folders.push({ id: 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name });
            setState({ savedFolders: folders }); host.persistFolders();
            if (newFolderInput) newFolderInput.value = '';
            newFolderRow.style.display = 'none'; renderList();
          },
        }, { createButton: newFolder, confirmButton: newFolderConfirm });
        if (editShelf) bind(editShelf, 'click', () => { setState({ reorderMode: !state().reorderMode, bookshelfPage: 1 }); renderList(); });
        if (groupAuthor) bind(groupAuthor, 'click', () => { setState({ groupByAuthorEnabled: !state().groupByAuthorEnabled, bookshelfPage: 1 }); renderList(); });
        bindFactory(MangaListSmartListEventsFactory, {
          onHistory: () => { setState({ currentFolderView: config.HISTORY_FOLDER_ID, currentSeriesView: null, currentAuthorView: null, bookshelfPage: 1 }); renderList(); },
          onUnread: () => { setState({ currentFolderView: config.UNREAD_FOLDER_ID, currentSeriesView: null, currentAuthorView: null, bookshelfPage: 1 }); renderList(); },
        }, { historyButton: history, unreadButton: unread });
        bindFactory(MangaListPaginationEventsFactory, {
          onPageChange: (delta) => {
            if ((delta < 0 && prev.disabled) || (delta > 0 && next.disabled)) return;
            const previousPage = state().bookshelfPage;
            setState({ bookshelfPage: previousPage + delta });
            // Only pagination animates; ordinary list updates remain instant.
            runtime.renderSavedList(delta);
            if (state().bookshelfPage !== previousPage) {
              const target = rootElement.querySelector('#listToolbar') || elements.savedListItems;
              if (typeof target?.scrollIntoView === 'function') target.scrollIntoView({ block: 'start', behavior: 'auto' });
            }
          }
        }, { prevButton: prev, nextButton: next, swipeSurface: elements.savedListItems });
        bindFactory(MangaListNavigationEventsFactory, { onBack: () => { setState({ currentFolderView: null, currentSeriesView: null, currentAuthorView: null, bookshelfPage: 1 }); renderList(); } }, { backButton: back });
        bindFactory(MangaListBulkEventsFactory, {
          onEdit: () => { setState({ bulkEditMode: !state().bulkEditMode, bookshelfPage: 1 }); updateBulkEditButton(); renderList(); },
          onUndo: () => {},
        }, { editButton: elements.bulkEditBtn, undoButton: elements.undoBulkEditBtn });
        return () => { while (cleanups.length) cleanups.pop()(); };
      };
      const entry = MangaListEntryFactory.create({
        mountFactory: MangaListMountFactory,
        mountDeps: { template: MangaListTemplate, resolver: MangaListDomResolver, elementsFactory: MangaListElementsFactory },
        stateRuntimeFactory: MangaListStateRuntimeFactory,
        renderRuntimeFactory: MangaListRenderRuntimeFactory,
        controllerFactory: MangaListControllerFactory,
        bootstrapFactory: MangaListBootstrapFactory,
        runtimeFactory: MangaListRuntimeFactory,
        contextFactory: MangaListRuntimeContextFactory,
        createContextDeps: ({ elements: mountedElements }) => { elements = mountedElements; return contextDeps; },
        createStateDeps: () => ({ load: data.load, migrate: (loaded) => Object.assign(state(), loaded), removeHistoryFolder: (loaded) => { loaded.savedFolders = loaded.savedFolders.filter((folder) => folder.id !== config.HISTORY_FOLDER_ID); return loaded; }, synchronizeAuthors }),
        createRenderDeps: () => ({ getState: state, getElements: () => elements, deriveViewModel: (value) => value, render: () => runtime.renderSavedList() }),
        createControllerDeps: ({ stateRuntime: entryStateRuntime, renderRuntime: entryRenderRuntime }) => ({ init: entryStateRuntime.initialize, render: entryRenderRuntime.render, open: () => entryRenderRuntime.render(), activate: () => {}, getElements: () => elements }),
        createEventBindings: eventBindings,
        createActivation: () => () => {},
      });
      const result = entry.start({ mountElement: input.mountElement });
      if (token !== lifecycle) {
        entry.cleanup();
        return null;
      }
      if (!windowRef.TestCodeGuest?.isActive()) installVpnControls(result.root, documentRef);
      const notice = documentRef.createElement('p');
      notice.className = 'vpnProtectedDataNotice';
      notice.setAttribute('aria-live', 'polite');
      notice.textContent = 'VPN接続を確認できるまで、同期データと追加・編集機能を停止しています。';
      notice.hidden = canReadProtectedData();
      result.root.insertBefore(notice, result.root.firstChild);
      result.root.dataset.protectedDataAccess = canReadProtectedData() ? 'allowed' : 'blocked';
      result.root.querySelectorAll('button, input, select, textarea, a[href*="reader.html"]').forEach((control) => {
        if (control.hasAttribute('data-vpn-status-button') || control.hasAttribute('data-vpn-diagnostics-button')) return;
        if ('disabled' in control) control.disabled = !canReadProtectedData();
        if (control.matches('a[href*="reader.html"]')) {
          if (canReadProtectedData()) {
            control.removeAttribute('aria-disabled');
            control.removeAttribute('tabindex');
          } else {
            control.setAttribute('aria-disabled', 'true');
            control.setAttribute('tabindex', '-1');
          }
        }
      });
      if (windowRef.MangaReaderMediaAccess && typeof windowRef.MangaReaderMediaAccess.syncUi === 'function') {
        windowRef.MangaReaderMediaAccess.syncUi();
      }
      elements = result.elements;
      activeEntry = entry;
      if (canReadProtectedData()) void retryPendingCleanup();
      return Object.freeze({ root: result.root, elements: result.elements, cleanup: entry.cleanup });
    }
    function cleanup() {
      lifecycle += 1;
      if (encryptedCoverLoader) {
        encryptedCoverLoader.destroy();
        encryptedCoverLoader = null;
      }
      if (activeEntry) {
        activeEntry.cleanup();
        activeEntry = null;
      }
    }
    return Object.freeze({ start, cleanup });
  }

  root.MangaListRouteFactory = Object.freeze({ create: createRoute });
})(typeof self !== 'undefined' ? self : this);
