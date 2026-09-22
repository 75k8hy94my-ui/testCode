(function (root) {
  'use strict';

  const SCRIPT_URLS = [
    ['manga-list-template.js?v=20260922-vpn-tools', 'mangaRouteTemplate'],
    ['manga-list-search-events.js?v=20260922-search-events', 'mangaRouteSearchEvents'],
    ['manga-list-sort-events.js?v=20260922-sort-events', 'mangaRouteSortEvents'],
    ['manga-list-filter-events.js?v=20260922-filter-events', 'mangaRouteFilterEvents'],
    ['manga-list-folder-events.js?v=20260922-folder-events', 'mangaRouteFolderEvents'],
    ['manga-list-smart-list-events.js?v=20260922-smart-events', 'mangaRouteSmartEvents'],
    ['manga-list-pagination-events.js?v=20260922-pagination-events', 'mangaRoutePaginationEvents'],
    ['manga-list-navigation-events.js?v=20260922-navigation-events', 'mangaRouteNavigationEvents'],
    ['manga-list-bulk-events.js?v=20260922-bulk-events', 'mangaRouteBulkEvents'],
    ['manga-list-dom-resolver.js?v=20260922-dom-resolver', 'mangaRouteResolver'],
    ['manga-list-elements.js?v=20260922-elements', 'mangaRouteElements'],
    ['manga-list-mount.js?v=20260922-mount', 'mangaRouteMount'],
    ['manga-list-card.js?v=20260922-card', 'mangaRouteCard'],
    ['manga-list-state.js?v=20260922-state', 'mangaRouteState'],
    ['manga-list-view-model.js?v=20260922-view-model', 'mangaRouteViewModel'],
    ['manga-list-renderer.js?v=20260922-renderer', 'mangaRouteRenderer'],
    ['manga-list-state-runtime.js?v=20260922-state-runtime', 'mangaRouteStateRuntime'],
    ['manga-list-render-runtime.js?v=20260922-render-runtime', 'mangaRouteRenderRuntime'],
    ['manga-list-bootstrap.js?v=20260922-bootstrap', 'mangaRouteBootstrap'],
    ['manga-list-controller.js?v=20260922-controller', 'mangaRouteController'],
    ['manga-list-runtime-context.js?v=20260922-runtime-context', 'mangaRouteContext'],
    ['manga-list-image-cache.js?v=20260922-image-cache', 'mangaRouteImageCache'],
    ['manga-list-host-runtime.js?v=20260922-host-runtime', 'mangaRouteHost'],
    ['manga-list-runtime.js?v=20260922-shared-runtime', 'mangaRouteRuntime'],
    ['manga-list-entry.js?v=20260922-entry', 'mangaRouteEntry'],
  ];

  let dependencyPromise = null;
  let activeEntry = null;

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
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once: true });
      script.addEventListener('error', reject, { once: true });
      documentRef.body.appendChild(script);
    });
  }

  function loadDependencies(documentRef) {
    if (!dependencyPromise) {
      dependencyPromise = SCRIPT_URLS.reduce(
        (promise, [src, id]) => promise.then(() => loadScript(src, id, documentRef)),
        Promise.resolve(),
      );
    }
    return dependencyPromise;
  }

  function createState(storage, keys) {
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

  function createRoute(deps) {
    if (!deps || typeof deps !== 'object' || !deps.documentRef || !deps.windowRef) {
      throw new TypeError('MangaListRouteFactory requires documentRef and windowRef');
    }
    const documentRef = deps.documentRef;
    const windowRef = deps.windowRef;

    async function start(input) {
      if (!input || !input.mountElement) throw new TypeError('MangaListRouteFactory requires mountElement');
      await loadDependencies(documentRef);
      const storage = windowRef.localStorage;
      const keys = {
        savedItems: 'mangaReaderSavedItems',
        savedFolders: 'mangaReaderSavedFolders',
        authorCards: 'mangaReaderAuthorCards',
        savedVideos: 'mangaReaderVideos',
      };
      const data = createState(storage, keys);
      let runtime = null;
      let elements = null;
      const coverSourceCache = new Map();
      const coverFailedCache = new Set();
      const coverObjectUrls = [];
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
      const pageUrlFor = (base, page, index, width) => base + String(page).padStart(Math.max(1, Number(width) || 1), '0') + '.' + extCandidates[index];
      const readInfo = (key) => { try { const value = JSON.parse(storage.getItem(key) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } };
      const getCachedMangaInfo = (key) => readInfo('mangaReaderInfoCache')[key] || null;
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
        safeWriteJson, getState: data.get, persistVideos() { safeWriteJson(keys.savedVideos, data.get().savedVideos); }, keys,
        sync: {
          hasActiveVault: () => !!(windowRef.MangaVault && windowRef.MangaVault.loadActive()),
          clearTimer: (timer) => { if (timer) windowRef.clearTimeout(timer); },
          setTimer: (callback, delay) => windowRef.setTimeout(callback, delay),
          savePayload: (payload) => windowRef.MangaVault.savePayload(payload),
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
          parseInputUrl, getCachedMangaInfo, getCoverSourceCache: () => coverSourceCache,
          getCoverFailedCache: () => coverFailedCache, pageUrlFor, extCandidates, loadTimeoutMs: 60000,
          sessionKey: 'mangaReaderSupabaseSession', readStorageItem: (key) => storage.getItem(key),
          getSupabaseConfig: () => windowRef.MANGA_READER_SUPABASE || {}, getLocalStoragePathFromUrl,
          loadCachedLocalImage: imageCache.loadCachedLocalImage, rememberLocalCoverObjectUrl: (url) => coverObjectUrls.push(url),
          setTimer: (callback, delay) => windowRef.setTimeout(callback, delay),
          clearTimer: (timer) => windowRef.clearTimeout(timer),
        },
        navigation: {
          lastUrlKey: 'mangaReaderLastUrl', readerUrl: 'reader.html',
          writeStorage: (key, value) => storage.setItem(key, value),
          navigate: (url) => windowRef.HomeProfileSPA.navigate(url),
        },
      });
      const state = data.get;
      const setState = data.set;
      const renderList = () => runtime.renderSavedList();
      const title = (item) => item.title || item.url || '無題';
      const itemSubtext = (item) => item.url || '';
      const readingRecordText = (item) => item.lastReadAt ? '既読' : '未読';
      const pageCount = (item) => Array.isArray(item.pages) ? item.pages.length + 'ページ' : '';
      const visibleItems = () => {
        return state().savedItems.filter((item) => !item.localSync).slice();
      };
      const appendFolderPreview = (cover, items, emptyIcon, emptyAlt, kindLabel) => {
        const preview = items.slice(0, 4); if (!preview.length) { const img = documentRef.createElement('img'); img.src = emptyIcon; img.alt = emptyAlt; cover.appendChild(img); return; }
        const box = documentRef.createElement('div'); box.className = 'folder-preview preview-count-' + preview.length;
        preview.forEach((item) => { const img = documentRef.createElement('img'); img.alt = title(item); if (item.pages && item.pages[0]) img.src = item.pages[0]; else host.setupFeedImage(img, item.url, item.numberWidth, item.pagePattern); box.appendChild(img); });
        cover.appendChild(box); const badge = documentRef.createElement('span'); badge.className = 'folder-kind-badge'; badge.textContent = kindLabel || 'フォルダ'; cover.appendChild(badge);
      };
      const makeHeartIcon = () => { const img = documentRef.createElement('img'); img.alt = ''; return img; };
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
        getSavedVideos: () => state().savedVideos, clearLocalCoverObjectUrls: () => { while (coverObjectUrls.length) { const url = coverObjectUrls.pop(); if (windowRef.URL && windowRef.URL.revokeObjectURL) windowRef.URL.revokeObjectURL(url); } },
        confirmAction: (message) => windowRef.confirm(message), setTimeout: windowRef.setTimeout.bind(windowRef),
        persistItems: host.persistItems, persistFolders: host.persistFolders, persistAuthorCards: host.persistAuthorCards, persistAll: host.persistAll, scheduleCloudSync: host.scheduleCloudSync,
        openReader: (item) => host.navigateToReader(item), accessMedia: host.setupFeedImage,
        renderDashboard, renderAuthorDashboard,
        getVisibleItems: visibleItems, appendFolderPreview, createStaticCard: (input) => MangaListCardBoundary.createStaticCard(input), loadLocalCover: host.loadLocalCover, getCoverSourceCache: () => coverSourceCache, setupFeedImage: host.setupFeedImage,
        makeHeartIcon, moveItemInList, moveFolderInList, renderList,
        updateBulkEditButton, shelfVisibleItems: visibleItems, unreadOrderItems: () => visibleItems().filter((item) => !item.lastReadAt), itemDisplayTitle: title, itemSubtext, readingRecordText, itemPageCountText: pageCount,
        buildFavoritesFolderCard, buildSeriesFolderCard, buildSeriesGroupCard, buildAuthorGroupCard, buildSearchText,
        deriveViewModel: (input) => MangaListViewModel.derive(input), renderCards: (input) => MangaListRenderer.render(input), createDocumentFragment: () => documentRef.createDocumentFragment(),
      };
      const context = MangaListRuntimeContextFactory.create(contextDeps);
      runtime = MangaListRuntimeFactory.create(context);
      const synchronizeAuthors = (loaded) => {
        let changed = false;
        loaded.savedItems.forEach((item) => {
          const name = String(item.author || '').trim();
          if (!name || loaded.authorCards.some((card) => card.name === name || card.circleName === name)) return;
          loaded.authorCards.unshift({ id: 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, circleName: '', links: [], createdAt: Date.now() });
          changed = true;
        });
        Object.assign(state(), loaded);
        if (data.wasLegacyMigrated()) host.persistItems();
        if (changed) host.persistAuthorCards();
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
        bindFactory(MangaListPaginationEventsFactory, { onPageChange: (delta) => { setState({ bookshelfPage: state().bookshelfPage + delta }); renderList(); } }, { prevButton: prev, nextButton: next });
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
      elements = result.elements;
      activeEntry = entry;
      return Object.freeze({ root: result.root, elements: result.elements, cleanup: entry.cleanup });
    }
    function cleanup() { if (activeEntry) { activeEntry.cleanup(); activeEntry = null; } }
    return Object.freeze({ start, cleanup });
  }

  root.MangaListRouteFactory = Object.freeze({ create: createRoute });
})(typeof self !== 'undefined' ? self : this);
