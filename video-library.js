(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const Data = window.MangaReaderVideoData;
  const Pagination = window.VideoLibraryPagination;
  if (!Data || !Pagination) return;

  const VIDEO_KEY = 'mangaReaderVideos';
  const FOLDER_KEY = 'mangaReaderVideoFolders';
  const META_KEY = 'mangaReaderVideoMeta';
  const PropertyStore = window.MangaReaderVideoCustomPropertyStore;
  const CustomProperties = window.MangaReaderVideoCustomProperties;
  const PREF_KEY = 'mangaReaderVideoLibraryView';
  const PROTECTED_DATA_KEYS = new Set([VIDEO_KEY, FOLDER_KEY, META_KEY]);
  const STATUS_LABELS = { '': '', later: 'あとで見る', watching: '視聴中', watched: '視聴済み' };
  const SORT_LABELS = {
    'recent-added': '最近追加', oldest: '古い順', 'recent-opened': '最近開いた', 'most-opened': 'よく開く', title: 'タイトル'
  };

  const state = {
    baseVideos: [], folders: [], meta: {}, query: '', quick: 'all', folderId: '', tag: '', service: '', sort: 'recent-added', view: 'card', thumbnailSize: 'normal', page: 1, totalPages: 1,
    syncTimer: null, syncRunning: false, syncDirty: false, syncPromise: null, editorSaving: false, editorId: null, sheetMode: null, showHidden: false, customDefinitions: { schemaVersion: 1, properties: {} }, customValues: {}, customFilters: {},
  };
  const dom = {};
  let eventsBound = false;
  let mediaAccess = window.MangaReaderMediaAccess || null;
  let renderedResultsKey = null;
  let pageAnimation = null;
  let activePage = null;
  let paginationEventsBound = false;
  const RETURN_INTENT_KEY = 'testcode.video.returnIntent';
  const RETURN_VIEW_KEY = 'testcode.video.listReturnContext';
  let returnIntent = null;

  // Capture the real list configuration, not just its page number. Restoring
  // a video against the unfiltered default list often opens the wrong page.
  function captureReturnContext(videoId) {
    if (!videoId) return;
    const scoped = effectiveVideos().filter(video => video.hidden === state.showHidden);
    const visible = Data.filterVideos(scoped, { query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, folders: state.folders });
    const filtered = CustomProperties ? visible.filter(video => CustomProperties.matchesFilters(video, state.customDefinitions, state.customValues, Object.values(state.customFilters))) : visible;
    const ordered = Data.sortVideos(filtered, state.sort);
    const context = {
      id: String(videoId), page: state.page, sort: state.sort, view: state.view,
      // Reopening a video changes 'recent-opened' ordering. Retain the original
      // list order for this one return instead of moving it to page 1.
      orderIds: ordered.length <= 10000 ? ordered.map(video => String(video.id)) : null,
      showHidden: state.showHidden, query: state.query, quick: state.quick,
      folderId: state.folderId, tag: state.tag, service: state.service,
      customFilters: state.customFilters,
    };
    try { sessionStorage.setItem(RETURN_VIEW_KEY, JSON.stringify(context)); } catch (_) {}
  }

  function readReturnContext(targetId) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RETURN_VIEW_KEY) || 'null');
      return saved && saved.id === targetId ? saved : null;
    } catch (_) { return null; }
  }

  function sortForReturn(videos) {
    const sorted = Data.sortVideos(videos, state.sort);
    const context = returnIntent && readReturnContext(returnIntent.id);
    if (!context || !Array.isArray(context.orderIds) || !context.orderIds.length) return sorted;
    const ranks = new Map(context.orderIds.map((id, index) => [String(id), index]));
    return sorted.sort((a, b) => {
      const first = ranks.get(String(a.id));
      const second = ranks.get(String(b.id));
      if (first != null && second != null) return first - second;
      if (first != null) return -1;
      if (second != null) return 1;
      return 0;
    });
  }

  function restoreReturnContext(targetId) {
    try {
      const saved = readReturnContext(targetId);
      if (!saved) return;
      // Use validated stored preferences to avoid malformed session state.
      if (Object.prototype.hasOwnProperty.call(SORT_LABELS, saved.sort)) state.sort = saved.sort;
      if (saved.view === 'card' || saved.view === 'compact') state.view = saved.view;
      state.showHidden = saved.showHidden === true;
      state.query = typeof saved.query === 'string' ? saved.query.slice(0, 300) : '';
      state.quick = ['all','favorite','later','watching','watched'].includes(saved.quick) ? saved.quick : 'all';
      state.folderId = typeof saved.folderId === 'string' ? saved.folderId : '';
      state.tag = typeof saved.tag === 'string' ? saved.tag : '';
      state.service = typeof saved.service === 'string' ? saved.service : '';
      state.customFilters = saved.customFilters && typeof saved.customFilters === 'object' && !Array.isArray(saved.customFilters)
        ? saved.customFilters : {};
      if (dom.search) dom.search.value = state.query;
    } catch (_) { /* The target video alone still identifies its current page. */ }
  }


  function readReturnIntent() {
    const params = new URLSearchParams(location.search);
    const id = params.get('returnVideo');
    const requestedPage = Number(params.get('returnPage'));
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : null;
    if (id) {
      if (!returnIntent || returnIntent.id !== id) returnIntent = { id, page };
      else returnIntent.page = page;
      return;
    }
    if (returnIntent) return;
    try {
      const stored = JSON.parse(sessionStorage.getItem(RETURN_INTENT_KEY) || 'null');
      if (stored && typeof stored.id === 'string' && stored.id) {
        const storedPage = Number(stored.page);
        returnIntent = { id: stored.id, page: Number.isSafeInteger(storedPage) && storedPage > 0 ? storedPage : null };
      }
    } catch (_) { /* A missing session fallback does not affect URL navigation. */ }
  }

  function clearReturnIntent() {
    returnIntent = null;
    try {
      sessionStorage.removeItem(RETURN_INTENT_KEY);
      sessionStorage.removeItem(RETURN_VIEW_KEY);
    } catch (_) {}
    const params = new URLSearchParams(location.search);
    if (!params.has('returnVideo') && !params.has('returnPage')) return;
    params.delete('returnVideo');
    params.delete('returnPage');
    history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }

  function acknowledgeReturnIntent(pageItems) {
    if (!returnIntent || !pageItems.some(video => String(video.id) === returnIntent.id)) return;
    // Only acknowledge a return once the matching card actually exists in the
    // displayed page. Retain returnIntent for later Vault/SPA re-render events.
    if (!Array.from(dom.results.querySelectorAll('.vl-card')).some(card => card.dataset.videoId === returnIntent.id)) return;
    try { sessionStorage.removeItem(RETURN_INTENT_KEY); } catch (_) {}
    const params = new URLSearchParams(location.search);
    if (params.get('returnVideo') !== returnIntent.id) return;
    params.delete('returnVideo');
    params.delete('returnPage');
    history.replaceState(history.state, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }

  function canReadProtectedData() {
    return !!mediaAccess && typeof mediaAccess.canReadProtectedData === 'function' && mediaAccess.canReadProtectedData() === true;
  }

  function isProtectedDataKey(key) { return PROTECTED_DATA_KEYS.has(key); }

  function readJson(key, fallback) {
    if (isProtectedDataKey(key) && !canReadProtectedData()) return fallback;
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; }
    catch (_) { return fallback; }
  }
  function writeJson(key, value) {
    if (isProtectedDataKey(key) && !canReadProtectedData()) return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }
  function markLocalChangesPending() {
    if (window.TestCodeGuest?.isActive()) return true;
    const vault = window.MangaVault;
    if (!vault?.loadSession?.()?.user?.id) return true;
    return typeof vault.markLocalChangesPending === 'function' && vault.markLocalChangesPending() === true;
  }
  function id(prefix) { return prefix + '-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); }
  function text(value) { return String(value == null ? '' : value).trim(); }

  function loadPrefs() {
    const prefs = readJson(PREF_KEY, {});
    state.sort = SORT_LABELS[prefs.sort] ? prefs.sort : 'recent-added';
    state.view = prefs.view === 'compact' ? 'compact' : 'card';
    state.thumbnailSize = ['small', 'normal', 'large'].includes(prefs.thumbnailSize) ? prefs.thumbnailSize : 'normal';
    state.quick = ['all', 'favorite', 'later', 'watching', 'watched'].includes(prefs.quick) ? prefs.quick : 'all';
  }
  function savePrefs() { writeJson(PREF_KEY, { sort: state.sort, view: state.view, thumbnailSize: state.thumbnailSize, quick: state.quick }); }

  function loadLibraryState() {
    if (!canReadProtectedData()) {
      state.baseVideos = [];
      state.folders = [];
      state.meta = {};
      state.customDefinitions = { schemaVersion: 1, properties: {} };
      state.customValues = {};
      return;
    }
    const rawVideos = readJson(VIDEO_KEY, []);
    state.baseVideos = Array.isArray(rawVideos) ? rawVideos : [];
    state.folders = Data.normalizeFolders(readJson(FOLDER_KEY, []));
    const rawMeta = readJson(META_KEY, {});
    state.meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};
    if (canReadProtectedData() && PropertyStore && CustomProperties) { const custom = PropertyStore.read(); state.customDefinitions = custom.definitions; state.customValues = custom.values; }
  }

  function effectiveVideo(base) {
    const meta = state.meta[base.id] && typeof state.meta[base.id] === 'object' ? state.meta[base.id] : {};
    return Data.normalizeVideo({ ...base, ...meta, id: base.id, a: base.a, b: base.b, addedAt: base.addedAt });
  }
  function effectiveVideos() { return state.baseVideos.map(effectiveVideo); }
  function baseById(videoId) { return state.baseVideos.find((video) => String(video.id) === String(videoId)) || null; }
  function folderName(folderId) { return (state.folders.find((folder) => folder.id === folderId) || {}).name || ''; }

  function setStatus(message, isError) {
    if (!dom.status) return;
    dom.status.textContent = message || '';
    dom.status.dataset.error = isError ? '1' : '0';
  }

  function hasPendingLocalSync() {
    const vault = window.MangaVault;
    if (!vault || typeof vault.hasPendingLocalChanges !== 'function') return false;
    try { return vault.hasPendingLocalChanges() === true; } catch (_) { return false; }
  }
  function resumePendingLocalSync() {
    if (window.TestCodeGuest?.isActive() || state.syncRunning || !hasPendingLocalSync()) return;
    if (!canReadProtectedData()) { setStatus('端末に保存済みです。VPN接続後にクラウド同期します。', true); return; }
    if (!window.MangaVault || !MangaVault.loadActive || !MangaVault.loadActive()) {
      setStatus('端末に保存済みです。保管庫を開くとクラウド同期します。', true); return;
    }
    clearTimeout(state.syncTimer);
    runVaultSync();
  }
  async function runVaultSync() {
    if (window.TestCodeGuest?.isActive()) {
      setStatus('端末内に保存しました（ゲスト・同期なし）');
      return true;
    }
    if (!canReadProtectedData()) return false;
    if (!window.MangaVault || !window.MangaVaultPayload || !MangaVault.loadActive || !MangaVault.loadActive()) {
      setStatus('端末に保存済みです。保管庫を開くとクラウド同期します。', true);
      return false;
    }
    if (state.syncRunning) { state.syncDirty = true; return; }
    state.syncRunning = true;
    setStatus('同期中…');
    const pending = (async () => {
      do {
        state.syncDirty = false;
        try {
          await MangaVault.saveLocalChanges();
        } catch (error) {
          setStatus('端末には保存済みです。クラウド未同期: ' + (error && error.message ? error.message : '同期に失敗しました。'), true);
          return false;
        }
      } while (state.syncDirty);
      setStatus('端末保存・クラウド同期が完了しました');
      setTimeout(() => { if (dom.status && dom.status.textContent === '端末保存・クラウド同期が完了しました') setStatus(''); }, 1800);
      return true;
    })();
    state.syncPromise = pending;
    try { return await pending; }
    finally {
      state.syncRunning = false;
      if (state.syncPromise === pending) state.syncPromise = null;
    }
  }
  function scheduleVaultSync() {
    if (!canReadProtectedData()) return;
    clearTimeout(state.syncTimer);
    state.syncTimer = setTimeout(runVaultSync, 450);
  }
  function persistAux({ sync = true } = {}) {
    if (!canReadProtectedData()) return false;
    let previousFolders = [];
    let previousFolderRaw = null, previousMetaRaw = null;
    const previousMetaState = state.meta;
    try {
      previousFolderRaw = localStorage.getItem(FOLDER_KEY);
      previousMetaRaw = localStorage.getItem(META_KEY);
      const storedFolders = previousFolderRaw == null ? [] : JSON.parse(previousFolderRaw);
      previousFolders = Array.isArray(storedFolders) ? storedFolders : [];
      if (!markLocalChangesPending()) throw new Error('pending marker write failed');
      if (!writeJson(FOLDER_KEY, state.folders)) throw new Error('folder write failed');
      // Other routes may have saved virtual edits since this list was loaded.
      // Merge the newest registry rather than overwriting it from stale state.
      state.meta = Data.mergeVideoMetaPreservingThumbnailTime(readJson(META_KEY, {}), state.meta);
      if (!writeJson(META_KEY, state.meta)) throw new Error('metadata write failed');
    } catch (_) {
      state.folders = previousFolders;
      state.meta = previousMetaState;
      try { if (previousFolderRaw == null) localStorage.removeItem(FOLDER_KEY); else localStorage.setItem(FOLDER_KEY, previousFolderRaw); } catch (_) {}
      try { if (previousMetaRaw == null) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, previousMetaRaw); } catch (_) {}
      return false;
    }
    if (sync) scheduleVaultSync();
    return true;
  }
  function updateMeta(videoId, patch, options) {
    if (!canReadProtectedData()) return false;
    const current = state.meta[videoId] && typeof state.meta[videoId] === 'object' ? state.meta[videoId] : {};
    const previous = state.meta[videoId];
    state.meta[videoId] = { ...current, ...patch, updatedAt: Date.now() };
    if (!persistAux(options)) {
      if (previous === undefined) delete state.meta[videoId]; else state.meta[videoId] = previous;
      return false;
    }
    return true;
  }

  function injectStyles() {
    if (document.getElementById('videoLibraryStyles')) return;
    const style = document.createElement('style');
    style.id = 'videoLibraryStyles';
    style.textContent = `
      #videoListSection[data-video-library-enhanced="1"]{overflow:hidden!important}#videoListSection[data-video-library-enhanced="1"] #videoListToolbar,#videoListSection[data-video-library-enhanced="1"] #videoListItems,#videoListSection[data-video-library-enhanced="1"] #videoListEmpty{display:none!important}
      #videoLibraryApp{display:flex;flex-direction:column;min-height:0;flex:1;gap:10px}
      .vl-top{display:flex;gap:8px;align-items:center}#videoLibraryApp .vl-search,#videoLibraryApp #videoLibraryAdd{display:none!important}.vl-search{position:relative;flex:1}.vl-search input{width:100%;min-height:44px;border:1px solid var(--border);border-radius:14px;background:var(--bg-soft);color:var(--text);padding:10px 13px 10px 38px;font-size:16px}.vl-search::before{content:'⌕';position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--sub);font-size:20px}.vl-primary{min-height:44px;border:0;border-radius:14px;padding:0 14px;background:var(--accent);color:#fff;font-weight:750;cursor:pointer}.vl-top #videoLibraryProperties{display:inline-flex;align-items:center;min-height:42px;padding:0 12px;border:1px solid var(--border);border-radius:12px;color:var(--text);background:var(--panel-2);font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}.vl-custom-properties{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.vl-custom-properties .vl-tag{max-width:100%;overflow-wrap:anywhere}.vl-chips{display:flex;gap:7px;overflow-x:auto;padding:1px 0 3px;scrollbar-width:none}.vl-chips::-webkit-scrollbar{display:none}.vl-chip{flex:0 0 auto;border:1px solid var(--border);border-radius:999px;background:var(--bg-soft);color:var(--sub);padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer}.vl-chip.active{color:var(--text);border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:var(--accent-dim)}
      #videoLibraryShorts{white-space:nowrap;background:var(--panel-2);color:var(--text);border:1px solid var(--border)}
      .vl-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto auto;gap:7px}.vl-filters select,.vl-icon-btn{min-height:39px;min-width:0;border:1px solid var(--border);border-radius:11px;background:var(--bg-soft);color:var(--text);padding:0 9px}.vl-icon-btn{cursor:pointer;font-weight:700}.vl-custom-filter{border:1px solid var(--border);border-radius:12px;padding:0 10px;background:var(--bg-soft)}.vl-custom-filter summary{padding:10px 0;color:var(--text);font-size:12px;font-weight:700;cursor:pointer}.vl-custom-filter-list{display:grid;gap:7px;padding:0 0 10px}.vl-custom-filter-row{display:grid;grid-template-columns:minmax(90px,.7fr) minmax(100px,.8fr) minmax(110px,1fr) auto;align-items:center;gap:6px;color:var(--text);font-size:12px}.vl-custom-filter-row select,.vl-custom-filter-row input,.vl-custom-filter-row textarea{box-sizing:border-box;min-width:0;width:100%;min-height:38px;border:1px solid var(--border);border-radius:9px;background:var(--panel);color:var(--text);padding:7px}.vl-summary{display:flex;justify-content:space-between;gap:10px;color:var(--sub);font-size:11px;min-height:18px}.vl-summary [data-error="1"]{color:#ef6464}
      #videoLibraryResults{overflow:auto;min-height:0;flex:1;padding:1px 1px 18px}.vl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:11px}.vl-grid.compact{display:flex;flex-direction:column;gap:6px}.vl-card{position:relative;min-width:0;border:1px solid var(--border);border-radius:16px;background:var(--bg-soft);overflow:visible;box-shadow:0 5px 18px rgba(0,0,0,.08)}.vl-open{display:block;width:100%;border:0;background:transparent;color:inherit;padding:0;text-align:left;cursor:pointer}.vl-thumb{position:relative;aspect-ratio:16/9;display:grid;place-items:center;border-radius:15px 15px 0 0;overflow:hidden;background:linear-gradient(135deg,var(--panel-2),var(--bg));color:var(--sub)}.vl-thumb img,.vl-thumb video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.vl-thumb-fallback{display:grid;place-items:center;text-align:center;gap:5px;font-size:11px}.vl-thumb-fallback b{font-size:27px;color:var(--text)}.vl-body{padding:11px 12px 12px}.vl-title{font-weight:750;font-size:14px;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.vl-meta{margin-top:6px;color:var(--sub);font-size:11px;display:flex;gap:6px;flex-wrap:wrap}.vl-tags{margin-top:7px;display:flex;gap:5px;flex-wrap:wrap}.vl-tag{font-size:10px;border:1px solid var(--border);border-radius:999px;padding:3px 6px;color:var(--sub)}.vl-card-actions{position:absolute;right:8px;top:8px;display:flex;gap:4px;z-index:3}.vl-round{width:34px;height:34px;border:1px solid rgba(255,255,255,.24);border-radius:50%;display:grid;place-items:center;background:rgba(10,12,17,.76);color:#fff;backdrop-filter:blur(14px);cursor:pointer}.vl-round.active{color:#ffd35a}.vl-edit-link{text-decoration:none;font-size:22px;line-height:1}.vl-progress{height:3px;background:var(--panel-2);margin-top:9px;border-radius:99px;overflow:hidden}.vl-progress i{display:block;height:100%;background:var(--accent)}
      .vl-page-frame{min-width:0;overflow:hidden}.vl-page{min-width:0;width:100%}.vl-slide-track{display:flex;align-items:flex-start;width:200%;will-change:transform}.vl-slide-track>.vl-page{flex:0 0 50%;width:50%;pointer-events:none}
      .vl-pagination{display:flex;justify-content:center;align-items:center;gap:10px;width:100%;margin:4px 0 0;padding:8px 10px;min-height:54px;border:1px solid rgba(255,255,255,.3);border-radius:16px;background:rgba(29,35,49,.96)}.vl-pagination[hidden]{display:none!important}.vl-pagination span{min-width:74px;color:var(--text);text-align:center;font-variant-numeric:tabular-nums}.vl-pagination .bookshelfPagerButton{display:flex;align-items:center;justify-content:center;min-width:50px;min-height:44px;border:1px solid var(--border);border-radius:999px;background:var(--panel-2);color:var(--text);cursor:pointer}.vl-pagination .bookshelfPagerButton:disabled{opacity:.38;cursor:not-allowed}.bookshelfPagerGlyph{width:22px;height:22px;pointer-events:none}
      @media(min-width:900px){.vl-pagination{--pager-glass-fill:rgba(19,22,28,.52);--pager-glass-edge:rgba(255,255,255,.28);--pager-glass-shine:rgba(255,255,255,.43);--pager-glass-shadow:rgba(0,0,0,.3);position:fixed;z-index:850;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:auto;min-width:232px;max-width:calc(100vw - 48px);height:68px;padding:8px 11px;gap:10px;isolation:isolate;border:1px solid var(--pager-glass-edge);border-radius:999px;color:#f7f9fe;background:radial-gradient(110% 175% at 24% 0%,rgba(255,255,255,.18),transparent 48%),linear-gradient(180deg,rgba(255,255,255,.07),transparent 55%),var(--pager-glass-fill);-webkit-backdrop-filter:blur(30px) saturate(180%) contrast(106%);backdrop-filter:blur(30px) saturate(180%) contrast(106%);box-shadow:0 18px 46px var(--pager-glass-shadow),0 2px 6px rgba(0,0,0,.12),inset 0 1.5px 0 var(--pager-glass-shine),inset 0 -1px 0 rgba(255,255,255,.08)}.vl-pagination:before{content:'';position:absolute;z-index:-1;inset:3px;border-radius:inherit;border:1px solid rgba(255,255,255,.09);pointer-events:none}.vl-pagination .bookshelfPagerButton{flex:0 0 50px;width:50px;height:50px;min-height:50px;padding:0;border-color:rgba(255,255,255,.2);border-radius:50%;color:#f7f9fe;background:linear-gradient(165deg,rgba(255,255,255,.2),rgba(255,255,255,.035)),rgba(255,255,255,.035);box-shadow:inset 0 1px 0 rgba(255,255,255,.23),0 2px 10px rgba(0,0,0,.13)}.vl-pagination .bookshelfPagerButton:focus-visible{outline:2px solid #9ac9ff;outline-offset:3px}.vl-pagination span{min-width:84px;color:#f7f9fe;font-size:13px;font-weight:650;letter-spacing:.035em;text-shadow:0 1px 5px rgba(0,0,0,.16);white-space:nowrap}html.app-desktop-rail-page .vl-pagination{left:calc(50% + 29px)}html[data-theme="light"] .vl-pagination{--pager-glass-fill:rgba(240,245,252,.63);--pager-glass-edge:rgba(255,255,255,.8);--pager-glass-shine:rgba(255,255,255,.94);--pager-glass-shadow:rgba(48,61,77,.16);color:#202834;background:radial-gradient(110% 175% at 24% 0%,rgba(255,255,255,.58),transparent 50%),linear-gradient(180deg,rgba(255,255,255,.23),rgba(214,227,245,.1)),var(--pager-glass-fill)}html[data-theme="light"] .vl-pagination .bookshelfPagerButton{border-color:rgba(255,255,255,.76);color:#202834;background:linear-gradient(165deg,rgba(255,255,255,.8),rgba(207,220,239,.27));box-shadow:inset 0 1px 0 rgba(255,255,255,.96),0 2px 10px rgba(49,61,80,.09)}html[data-theme="light"] .vl-pagination span{color:#202834}}
      @media(max-width:899px){.vl-pagination{margin:8px 0 0;padding:6px 8px;min-height:42px}.vl-pagination span{min-width:52px}.vl-pagination .bookshelfPagerButton{min-width:64px;min-height:44px}}
      .vl-grid.compact .vl-card{display:grid;grid-template-columns:116px minmax(0,1fr);min-height:76px;overflow:visible}.vl-grid.compact .vl-open{display:contents}.vl-grid.compact .vl-thumb{aspect-ratio:auto;height:76px;border-radius:15px 0 0 15px}.vl-grid.compact .vl-body{padding:10px 70px 8px 10px}.vl-grid.compact .vl-title{-webkit-line-clamp:1}.vl-grid.compact .vl-card-actions{top:50%;transform:translateY(-50%)}.vl-empty{padding:48px 18px;text-align:center;color:var(--sub);border:1px dashed var(--border);border-radius:16px}.vl-empty strong{display:block;color:var(--text);font-size:17px;margin-bottom:6px}
      /* This sheet is appended to body, outside .homeShell's theme variables. */
      #videoLibrarySheet{--bg-soft:#fff;--panel:#fff;--panel-2:#eef1f5;--text:#202124;--sub:#59616e;--border:#dfe3e8;--accent:#1769aa;color-scheme:light}
      html[data-theme="dark"] #videoLibrarySheet{--bg-soft:#10141c;--panel:#161a23;--panel-2:#1d2230;--text:#f1f2f6;--sub:#9aa3b5;--border:#2b3240;--accent:#6aa9ff;color-scheme:dark}
      #videoLibrarySheet .vl-sheet-panel{background:var(--panel)!important;color:var(--text)!important}
      #videoLibrarySheet{position:fixed;inset:0;z-index:180;background:rgba(0,0,0,.58);display:grid;align-items:end;padding:12px;backdrop-filter:blur(10px)}#videoLibrarySheet[hidden]{display:none!important}.vl-sheet-panel{width:min(680px,100%);max-height:min(90dvh,820px);margin:0 auto;overflow:auto;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border));border-radius:24px;background:var(--panel);color:var(--text);box-shadow:0 24px 70px rgba(0,0,0,.55);padding:18px}.vl-sheet-head{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:-18px;background:var(--panel);padding:16px 0 12px;z-index:2;border-bottom:1px solid var(--border);margin-bottom:4px}.vl-sheet-head h2{margin:0;font-size:20px}.vl-close{border:1px solid var(--border);border-radius:999px;background:var(--panel-2);color:var(--text);width:38px;height:38px}.vl-form{display:grid;gap:14px}.vl-field{padding:10px 11px 11px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--bg-soft) 72%,var(--panel))}.vl-field:focus-within{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent)}.vl-field label{display:block;color:var(--text);font-size:13px;font-weight:750;margin:0 0 7px}.vl-field input,.vl-field select,.vl-field textarea{width:100%;border:1px solid color-mix(in srgb,var(--sub) 48%,var(--border));border-radius:10px;background:var(--panel);color:var(--text);padding:12px;font-size:16px;min-height:46px}.vl-field input::placeholder,.vl-field textarea::placeholder{color:var(--sub);opacity:.9}.vl-field input:focus,.vl-field select:focus,.vl-field textarea:focus{outline:2px solid color-mix(in srgb,var(--accent) 60%,transparent);outline-offset:1px}.vl-field textarea{min-height:90px;resize:vertical}.vl-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vl-check{display:flex;gap:10px;align-items:center;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-soft);font-weight:700}.vl-sheet-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:4px;padding-top:12px;border-top:1px solid var(--border)}.vl-sheet-actions button{min-height:44px;border-radius:12px;padding:0 14px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-weight:700}.vl-sheet-actions .save{border:0;background:var(--accent);color:#fff}.vl-sheet-actions .danger{margin-right:auto;color:#ff7777}.vl-advanced{border:1px solid var(--border);border-radius:12px;padding:0 11px;background:var(--bg-soft)}.vl-advanced summary{padding:13px 0;cursor:pointer;color:var(--text);font-size:13px;font-weight:700}.vl-help{margin:-4px 0 2px;color:var(--sub);font-size:11px;line-height:1.5}.vl-folder-create{display:flex;gap:8px}.vl-folder-create input{flex:1}.vl-folder-list{display:grid;gap:7px;margin-top:12px}.vl-folder-row{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:12px;padding:9px 10px}.vl-folder-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}.vl-folder-row button{border:0;background:var(--panel-2);color:var(--text);border-radius:8px;padding:7px 9px}.vl-folder-row .danger{color:#ff7777}
      .vl-access-notice{margin:10px 0;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-soft);color:var(--text);font-size:13px;line-height:1.6}
      @media(max-width:700px){.vl-top{flex-wrap:wrap}.vl-search{flex:1 0 100%}.vl-top #videoLibraryAdd,.vl-top #videoLibraryShorts,.vl-top #videoLibraryHidden,.vl-top #videoLibraryProperties{flex:1}.vl-filters{grid-template-columns:1fr 1fr 1fr}.vl-filters #videoLibrarySort{grid-column:span 1}.vl-grid{grid-template-columns:1fr 1fr}.vl-sheet-panel{border-radius:24px 24px 18px 18px}.vl-two{grid-template-columns:1fr}}
      @media(max-width:480px){.vl-top{align-items:stretch}.vl-primary{padding:0 12px}.vl-filters{grid-template-columns:1fr 1fr}.vl-grid{grid-template-columns:1fr}.vl-grid.compact .vl-card{grid-template-columns:104px minmax(0,1fr)}.vl-grid.compact .vl-thumb{height:72px}.vl-grid.compact .vl-body{padding-right:66px}.vl-summary{padding:0 2px}}
    `;
    document.head.appendChild(style);
  }

  function setupMarkup() {
    const section = document.getElementById('videoListSection');
    if (!section) return false;
    if (section.dataset.videoLibraryEnhanced === '1') return true;
    section.dataset.videoLibraryEnhanced = '1';
    const legacyToolbar = document.getElementById('videoListToolbar');
    const legacyItems = document.getElementById('videoListItems');
    const legacyEmpty = document.getElementById('videoListEmpty');
    if (legacyToolbar) legacyToolbar.style.display = 'none';
    if (legacyItems) legacyItems.style.display = 'none';
    if (legacyEmpty) legacyEmpty.style.display = 'none';

    const app = document.createElement('div');
    app.id = 'videoLibraryApp';
    app.innerHTML = `
      <div class="vl-top">
        <div class="vl-search"><input id="videoLibrarySearch" type="search" inputmode="search" autocomplete="off" placeholder="動画を検索"></div>
        <button id="videoLibraryAdd" class="vl-primary" type="button">＋ 追加</button>
        <a id="videoLibraryProperties" class="vl-secondary" href="video-properties.html">プロパティ設定</a>
        <button id="videoLibraryShorts" class="vl-primary vl-shorts" type="button">縦スワイプ再生</button>
        <button id="videoLibraryHidden" class="vl-icon-btn" type="button">非表示</button>
      </div>
      <div id="videoLibraryQuick" class="vl-chips" aria-label="クイックフィルタ">
        <button class="vl-chip" data-quick="all" type="button">すべて</button>
        <button class="vl-chip" data-quick="favorite" type="button">★ お気に入り</button>
        <button class="vl-chip" data-quick="later" type="button">あとで見る</button>
        <button class="vl-chip" data-quick="watching" type="button">視聴中</button>
        <button class="vl-chip" data-quick="watched" type="button">視聴済み</button>
      </div>
      <div class="vl-filters">
        <select id="videoLibraryFolder" aria-label="フォルダ"><option value="">全フォルダ</option></select>
        <select id="videoLibraryTag" aria-label="タグ"><option value="">全タグ</option></select>
        <select id="videoLibraryService" aria-label="サービス"><option value="">全サービス</option></select>
        <select id="videoLibrarySort" aria-label="並べ替え"></select>
        <button id="videoLibraryView" class="vl-icon-btn" type="button" aria-label="表示形式を切り替え">表示</button>
        <label class="vl-thumbnail-size-label" for="videoLibraryThumbnailSize">サムネイルサイズ <select id="videoLibraryThumbnailSize" aria-label="動画一覧のサムネイルサイズ"><option value="small">小</option><option value="normal">標準</option><option value="large">大</option></select></label>
        <button id="videoLibraryFolders" class="vl-icon-btn" type="button">フォルダ</button>
      </div>
      <details class="vl-custom-filter"><summary>カスタムプロパティで絞り込む</summary><div id="videoLibraryCustomFilters" class="vl-custom-filter-list"></div></details>
      <div class="vl-summary"><span id="videoLibraryCount"></span><span id="videoLibraryStatus" aria-live="polite"></span></div>
      <p id="videoLibraryAccessNotice" class="vl-access-notice" aria-live="polite" hidden>VPN接続を確認できるまで、動画データの読み込みと追加・編集を停止しています。</p>
      <div id="videoLibraryResults"></div>
      <nav id="videoLibraryPagination" class="bookshelf-pagination vl-pagination" aria-label="動画一覧のページ移動" hidden>
        <button id="videoLibraryPrevPage" class="bookshelfPagerButton" type="button" aria-label="前のページ"><svg class="bookshelfPagerGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <span id="videoLibraryPageLabel" aria-live="polite">1 / 1</span>
        <button id="videoLibraryNextPage" class="bookshelfPagerButton" type="button" aria-label="次のページ"><svg class="bookshelfPagerGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </nav>`;
    section.prepend(app);

    const sheet = document.createElement('section');
    sheet.id = 'videoLibrarySheet';
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = `
      <div class="vl-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="videoLibrarySheetTitle">
        <div class="vl-sheet-head"><h2 id="videoLibrarySheetTitle">動画</h2></div>
        <form id="videoLibraryForm" class="vl-form">
          <div class="vl-url-row"><div class="vl-field"><label for="videoLibraryUrl">動画URL</label><input id="videoLibraryUrl" type="url" autocomplete="off" placeholder="https://..."></div><button id="videoLibraryUrlEdit" class="vl-url-edit" type="button">編集</button></div>
          <div class="vl-field"><label for="videoLibraryTitle">タイトル</label><input id="videoLibraryTitle" type="text" autocomplete="off"></div>
          <div class="vl-two">
            <div class="vl-field"><label for="videoLibraryEditFolder">フォルダ</label><select id="videoLibraryEditFolder"></select></div>
            <div class="vl-field"><label for="videoLibraryStatusSelect">状態（任意）</label><select id="videoLibraryStatusSelect"><option value="">未設定</option><option value="later">あとで見る</option><option value="watching">視聴中</option><option value="watched">視聴済み</option></select></div>
          </div>
          <div class="vl-field"><label for="videoLibraryTags">タグ（カンマ区切り）</label><input id="videoLibraryTags" type="text" autocomplete="off"></div><div id="videoLibrarySuggestedTags" class="vl-suggested-tags" aria-label="既存のタグ"></div>
          <div class="vl-field"><label for="videoLibraryMemo">メモ</label><textarea id="videoLibraryMemo"></textarea></div>
          <label class="vl-check"><input id="videoLibraryFavorite" type="checkbox"> お気に入り</label>
          <div class="vl-field"><label for="videoLibraryRotate90Direction">再生時の回転</label><select id="videoLibraryRotate90Direction"><option value="none">回転なし</option><option value="left">常に左90°回転</option><option value="right">常に右90°回転</option></select></div>
          <details class="vl-advanced"><summary>再生情報・サムネイル</summary>
            <div class="vl-two">
              <div class="vl-field"><label for="videoLibraryLegacyService">サービス名</label><input id="videoLibraryLegacyService" type="text" autocomplete="off"></div>
              <div class="vl-field"><label for="videoLibraryLegacyId">動画ID</label><input id="videoLibraryLegacyId" type="text" inputmode="numeric" autocomplete="off"></div>
            </div>
            <div class="vl-field"><label for="videoLibraryThumbnail">サムネイルURL（任意）</label><input id="videoLibraryThumbnail" type="url" autocomplete="off"></div>
          </details>
          <div id="videoLibraryFormError" class="vl-summary" aria-live="polite"></div>
          <div class="vl-sheet-actions"><button id="videoLibraryDelete" class="danger" type="button">削除</button><button id="videoLibraryCancel" type="button">キャンセル</button><button class="save" type="submit">保存</button></div>
        </form>
        <div id="videoLibraryFolderManager" hidden>
          <div class="vl-folder-create"><input id="videoLibraryNewFolder" type="text" placeholder="新しいフォルダ名"><button id="videoLibraryCreateFolder" class="vl-primary" type="button">追加</button></div>
          <div id="videoLibraryFolderList" class="vl-folder-list"></div>
        </div>
      </div>`;
    document.body.appendChild(sheet);

    Object.assign(dom, {
      section, app, search: document.getElementById('videoLibrarySearch'), quick: document.getElementById('videoLibraryQuick'),
      folder: document.getElementById('videoLibraryFolder'), tag: document.getElementById('videoLibraryTag'), service: document.getElementById('videoLibraryService'),
      sort: document.getElementById('videoLibrarySort'), view: document.getElementById('videoLibraryView'), thumbnailSize: document.getElementById('videoLibraryThumbnailSize'), foldersBtn: document.getElementById('videoLibraryFolders'),
      customFilters: document.getElementById('videoLibraryCustomFilters'),
      add: document.getElementById('videoLibraryAdd'), shorts: document.getElementById('videoLibraryShorts'), hiddenBtn: document.getElementById('videoLibraryHidden'), count: document.getElementById('videoLibraryCount'), status: document.getElementById('videoLibraryStatus'), results: document.getElementById('videoLibraryResults'),
      pagination: document.getElementById('videoLibraryPagination'), prevPage: document.getElementById('videoLibraryPrevPage'), nextPage: document.getElementById('videoLibraryNextPage'), pageLabel: document.getElementById('videoLibraryPageLabel'),
      sheet, sheetTitle: document.getElementById('videoLibrarySheetTitle'), form: document.getElementById('videoLibraryForm'),
      formError: document.getElementById('videoLibraryFormError'), url: document.getElementById('videoLibraryUrl'), urlEdit: document.getElementById('videoLibraryUrlEdit'), suggestedTags: document.getElementById('videoLibrarySuggestedTags'), title: document.getElementById('videoLibraryTitle'), editFolder: document.getElementById('videoLibraryEditFolder'),
      statusSelect: document.getElementById('videoLibraryStatusSelect'), tags: document.getElementById('videoLibraryTags'), memo: document.getElementById('videoLibraryMemo'), favorite: document.getElementById('videoLibraryFavorite'),
      legacyService: document.getElementById('videoLibraryLegacyService'), legacyId: document.getElementById('videoLibraryLegacyId'), thumbnail: document.getElementById('videoLibraryThumbnail'),
      rotate90Direction: document.getElementById('videoLibraryRotate90Direction'),
      deleteBtn: document.getElementById('videoLibraryDelete'), cancel: document.getElementById('videoLibraryCancel'), folderManager: document.getElementById('videoLibraryFolderManager'),
      newFolder: document.getElementById('videoLibraryNewFolder'), createFolder: document.getElementById('videoLibraryCreateFolder'), folderList: document.getElementById('videoLibraryFolderList'),
      legacyItems,
      accessNotice: document.getElementById('videoLibraryAccessNotice'),
    });
    return true;
  }

  function fillSelect(select, options, current, blankLabel) {
    const value = current || '';
    select.replaceChildren();
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = blankLabel; select.append(blank);
    options.forEach((entry) => { const option = document.createElement('option'); option.value = entry.value; option.textContent = entry.label; select.append(option); });
    select.value = value;
  }

  function formatDate(value) {
    if (!value) return '';
    try { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(value)); }
    catch (_) { return ''; }
  }
  function progressPercent(video) {
    if (!video.durationSeconds || video.progressSeconds == null) return null;
    return Math.max(0, Math.min(100, Math.round((video.progressSeconds / video.durationSeconds) * 100)));
  }

  function createCard(video) {
    const VideoCard = window.MangaReaderVideoCard;
    if (!VideoCard || typeof VideoCard.create !== 'function') throw new Error('video card component is unavailable');
    const title = Data.displayTitle(video, effectiveVideos());
    const metadata = [];
    const service = Data.deriveService(video.url, video.a);
    if (service) metadata.push(service);
    if (video.folderId && folderName(video.folderId)) metadata.push(folderName(video.folderId));
    if (video.watchStatus && STATUS_LABELS[video.watchStatus]) metadata.push(STATUS_LABELS[video.watchStatus]);
    if (video.lastOpenedAt) metadata.push(formatDate(video.lastOpenedAt));
    if (video.openCount) metadata.push(video.openCount + '回');
    const customLabels = [];
    if (canReadProtectedData() && CustomProperties) {
      const stored = state.customValues[String(video.id)] || {};
      const shown = Object.values(state.customDefinitions.properties || {}).filter((property) => property && property.deleted !== true && property.hidden !== true && Object.prototype.hasOwnProperty.call(stored, property.id) && stored[property.id] !== null && stored[property.id] !== '').sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
      shown.forEach((property) => {
        const value = CustomProperties.formatValue(property, stored[property.id], state.customDefinitions);
        if (value !== '') customLabels.push(property.name + ': ' + value);
      });
    }
    const card = VideoCard.create(video, {
      documentRef: document, layout: state.view === 'compact' ? 'compact' : 'grid', openClass: 'vl-open',
      title, metadata, tags: Array.isArray(video.tags) ? video.tags : [], customLabels, progressPercent: progressPercent(video),
      thumbnailRenderer: window.MangaReaderVideoThumbnailRenderer,
      thumbnailOptions: { fallbackClass: 'vl-thumb-fallback', videoClass: 'vl-thumb-direct-video', serviceLabel: service || 'VIDEO' },
      onOpen: () => openVideo(video.id),
      menuActions: [{ label: video.favorite ? 'お気に入りを解除' : 'お気に入りに追加', onSelect: () => { updateMeta(video.id, { favorite: !video.favorite }); render(); } }],
      editHref: 'video-edit.html?id=' + encodeURIComponent(video.id) + '&return=list',
    });
    card.classList.add('vl-card');
    card.dataset.videoId = String(video.id);
    return card;
  }

  function renderFilterOptions(videos) {
    const currentFolder = state.folderId, currentTag = state.tag, currentService = state.service;
    fillSelect(dom.folder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), currentFolder, '全フォルダ');
    const tags = [...new Set(videos.flatMap((video) => video.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
    fillSelect(dom.tag, tags.map((tag) => ({ value: tag, label: '#' + tag })), currentTag, '全タグ');
    const services = [...new Set(videos.map((video) => Data.deriveService(video.url, video.a)).filter(Boolean))].sort();
    fillSelect(dom.service, services.map((service) => ({ value: service, label: service })), currentService, '全サービス');
    dom.sort.replaceChildren(); Object.entries(SORT_LABELS).forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; dom.sort.append(option); }); dom.sort.value = state.sort;
    fillSelect(dom.editFolder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), dom.editFolder.value, '未分類');
  }

  function renderCustomFilters() {
    if (!dom.customFilters || !CustomProperties || !canReadProtectedData()) return;
    dom.customFilters.replaceChildren();
    const properties = Object.values(state.customDefinitions.properties || {}).filter((property) => property && property.deleted !== true && property.hidden !== true).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    properties.forEach((property) => {
      const row = document.createElement('label'); row.className = 'vl-custom-filter-row';
      const name = document.createElement('span'); name.textContent = property.name; row.append(name);
      const operator = document.createElement('select'); operator.setAttribute('aria-label', property.name + 'の条件');
      const operators = property.type === 'text' || property.type === 'long_text' ? [['contains','を含む'],['equals','完全一致'],['is_unset','未設定']] :
        property.type === 'single_select' ? [['equals','次の値'],['is_unset','未設定']] :
        property.type === 'multi_select' ? [['contains_any','いずれかを含む'],['contains_all','すべて含む']] :
        property.type === 'checkbox' ? [['true','ON'],['false','OFF'],['is_unset','未設定']] :
        property.type === 'number' ? [['equals','と等しい'],['gte','以上'],['lte','以下'],['is_unset','未設定']] : [['equals','と等しい'],['on_or_after','以降'],['on_or_before','以前'],['is_unset','未設定']];
      operators.forEach(([value,label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; operator.append(option); });
      const existing = state.customFilters[property.id] || { operator: operators[0][0] };
      operator.value = operators.some(([value]) => value === existing.operator) ? existing.operator : operators[0][0];
      const valueControl = document.createElement(property.type === 'long_text' ? 'textarea' : 'input');
      if (valueControl.tagName === 'INPUT') valueControl.type = property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'search';
      valueControl.setAttribute('aria-label', property.name + 'の値');
      let valueNode = valueControl;
      if (property.type === 'single_select') { valueNode = document.createElement('select'); const blank = document.createElement('option'); blank.value=''; blank.textContent='選択'; valueNode.append(blank); Object.values(property.options || {}).filter((item)=>item && item.deleted!==true).sort((a,b)=>a.order-b.order).forEach((item)=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;valueNode.append(option);}); valueNode.value=existing.value || ''; }
      else if (property.type === 'multi_select') { valueNode = document.createElement('select'); valueNode.multiple = true; valueNode.setAttribute('aria-label', property.name + 'の選択肢'); Object.values(property.options || {}).filter((item)=>item && item.deleted!==true).sort((a,b)=>a.order-b.order).forEach((item)=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.name;option.selected=Array.isArray(existing.optionIds)&&existing.optionIds.includes(item.id);valueNode.append(option);}); }
      else if (property.type === 'checkbox') { valueNode = document.createElement('span'); valueNode.textContent = '条件を選択'; }
      else { valueNode.value = existing.value == null ? '' : String(existing.value); }
      valueNode.setAttribute('aria-label', property.name + 'の値');
      const clear = document.createElement('button'); clear.type='button'; clear.className='vl-icon-btn'; clear.textContent='解除'; clear.setAttribute('aria-label', property.name + 'の絞り込みを解除');
      const update = () => {
        clearReturnIntent();
        const op = operator.value;
        if (op === operators[0][0] && !['is_unset','true','false'].includes(op) && !String(valueNode.value || '').trim() && property.type !== 'multi_select') delete state.customFilters[property.id];
        else if (property.type === 'multi_select') { const optionIds=[...valueNode.selectedOptions].map((item)=>item.value); if (!optionIds.length) delete state.customFilters[property.id]; else state.customFilters[property.id]={propertyId:property.id,operator:op,optionIds}; }
        else if (['is_unset','true','false'].includes(op)) state.customFilters[property.id]={propertyId:property.id,operator:op};
        else { const raw=valueNode.value; if (!String(raw).trim()) delete state.customFilters[property.id]; else state.customFilters[property.id]={propertyId:property.id,operator:op,value:property.type==='number'?Number(raw):raw}; }
        render();
      };
      operator.addEventListener('change', update); valueNode.addEventListener('change', update);
      clear.addEventListener('click', () => { clearReturnIntent(); delete state.customFilters[property.id]; render(); });
      row.append(operator, valueNode, clear); dom.customFilters.append(row);
    });
    if (!properties.length) { const empty=document.createElement('span'); empty.textContent='表示可能なプロパティがありません。'; dom.customFilters.append(empty); }
  }

  function restoreVideoPage() {
    readReturnIntent();
    const targetId = returnIntent && returnIntent.id;
    if (!targetId || !canReadProtectedData()) return;
    // Reapply after loadPrefs() as well as async Vault/SPA remounts.
    restoreReturnContext(targetId);
    const all = effectiveVideos();
    // Initial local/Vault hydration can be asynchronous. Do not lose the
    // return intent when the target is not yet available.
    if (!all.some(video => String(video.id) === targetId)) return;
    const findInCurrentView = () => {
      const scoped = all.filter(video => video.hidden === state.showHidden);
      const visible = Data.filterVideos(scoped, { query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, folders: state.folders });
      const filtered = CustomProperties ? visible.filter(video => CustomProperties.matchesFilters(video, state.customDefinitions, state.customValues, Object.values(state.customFilters))) : visible;
      return sortForReturn(filtered);
    };
    let list = findInCurrentView();
    let index = list.findIndex(video => String(video.id) === targetId);
    if (index < 0) {
      const target = all.find(video => String(video.id) === targetId);
      if (target) {
        state.showHidden = !!target.hidden;
        state.query = ''; state.quick = 'all'; state.folderId = ''; state.tag = ''; state.service = ''; state.customFilters = {};
        if (dom.search) dom.search.value = '';
        list = findInCurrentView();
        index = list.findIndex(video => String(video.id) === targetId);
      }
    }
    if (index < 0) return;
    const calculatedPage = Math.floor(index / Pagination.PAGE_SIZE) + 1;
    const originPage = returnIntent.page;
    const candidate = Number.isSafeInteger(originPage) && originPage > 0 ? originPage : calculatedPage;
    const pageStart = (candidate - 1) * Pagination.PAGE_SIZE;
    state.page = list.slice(pageStart, pageStart + Pagination.PAGE_SIZE).some(video => String(video.id) === targetId)
      ? candidate : calculatedPage;
  }

  function render(pageDirection = 0) {
    loadLibraryState();
    restoreVideoPage();
    syncAccessUi();
    const all = effectiveVideos();
    const scoped = all.filter((video) => video.hidden === state.showHidden);
    renderFilterOptions(scoped);
    renderCustomFilters();
    const baseFiltered = Data.filterVideos(scoped, { query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, folders: state.folders });
    const filters = Object.values(state.customFilters);
    const filtered = CustomProperties ? baseFiltered.filter((video) => CustomProperties.matchesFilters(video, state.customDefinitions, state.customValues, filters)) : baseFiltered;
    const videos = sortForReturn(filtered);
    dom.quick.querySelectorAll('[data-quick]').forEach((button) => button.classList.toggle('active', button.dataset.quick === state.quick));
    dom.thumbnailSize.value = state.thumbnailSize;
    dom.app.dataset.thumbnailSize = state.thumbnailSize;
    dom.view.textContent = state.view === 'card' ? '▤' : '▦'; dom.view.title = state.view === 'card' ? 'コンパクト表示へ' : 'カード表示へ';
    dom.hiddenBtn.textContent = state.showHidden ? '動画一覧' : '非表示 (' + all.filter((video) => video.hidden).length + ')';
    dom.hiddenBtn.setAttribute('aria-pressed', state.showHidden ? 'true' : 'false');
    dom.count.textContent = videos.length + ' / ' + scoped.length + '件';
    const pageModel = Pagination.derive(videos, state.page, Pagination.PAGE_SIZE);
    state.page = pageModel.page;
    state.totalPages = pageModel.totalPages;
    dom.pagination.hidden = !pageModel.hasMultiplePages;
    dom.prevPage.disabled = state.page <= 1;
    dom.nextPage.disabled = state.page >= state.totalPages;
    dom.pageLabel.textContent = state.page + ' / ' + state.totalPages;
    const resultsKey = JSON.stringify([state.view, state.showHidden, state.page, pageModel.items]);
    // Keep loaded thumbnail elements when returning to an unchanged video list.
    if (resultsKey === renderedResultsKey) { acknowledgeReturnIntent(pageModel.items); return; }
    renderedResultsKey = resultsKey;
    const outgoing = pageDirection && activePage && dom.results.contains(activePage) ? activePage : null;
    if (pageAnimation) { pageAnimation.cancel(); pageAnimation = null; }
    const frame = document.createElement('div'); frame.className = 'vl-page-frame';
    const incoming = document.createElement('div'); incoming.className = 'vl-page';
    activePage = incoming;
    if (!videos.length) {
      const empty = document.createElement('div'); empty.className = 'vl-empty'; empty.innerHTML = '<strong>' + (state.showHidden ? '非表示の動画はありません' : '該当する動画がありません') + '</strong><span>共通メニューの「探す」から検索条件を変更できます。</span>'; incoming.append(empty);
    } else {
      const grid = document.createElement('div'); grid.className = 'vl-grid' + (state.view === 'compact' ? ' compact' : ''); pageModel.items.forEach((video) => grid.append(createCard(video))); incoming.append(grid);
    }
    const reduceMotion = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (outgoing && pageDirection && !reduceMotion) {
      const track = document.createElement('div'); track.className = 'vl-slide-track';
      if (pageDirection > 0) track.append(outgoing, incoming); else track.append(incoming, outgoing);
      frame.append(track); dom.results.replaceChildren(frame);
      if (typeof track.animate === 'function') {
        const start = pageDirection > 0 ? 'translateX(0%)' : 'translateX(-50%)';
        const end = pageDirection > 0 ? 'translateX(-50%)' : 'translateX(0%)';
        const animation = track.animate([{ transform: start }, { transform: end }], { duration: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
        pageAnimation = animation;
        const finish = () => { if (pageAnimation !== animation) return; pageAnimation = null; frame.replaceChildren(incoming); animation.cancel(); };
        animation.finished.then(finish, finish);
      } else frame.replaceChildren(incoming);
    } else { frame.append(incoming); dom.results.replaceChildren(frame); }
    acknowledgeReturnIntent(pageModel.items);
  }

  function invokeUrlAdd({ title, url }) {
    if (!canReadProtectedData()) throw new Error('VPN接続を確認できるまで動画を追加できません。');
    const fields = Data.storageFieldsForVideoUrl(url);
    if (!fields) throw new Error('動画URLを確認してください。');
    const videos = readJson(VIDEO_KEY, []);
    const list = Array.isArray(videos) ? videos : [];
    if (list.some((item) => Data.normalizeVideo(item).url === url)) {
      throw new Error('同じ動画URLはすでに追加されています。');
    }
    if (!markLocalChangesPending()) throw new Error('未同期状態を記録できませんでした。動画は変更していません。');
    const created = Data.normalizeVideo({
      id: id('v'), title, url, a: fields.a, b: fields.b, addedAt: Date.now(), updatedAt: Date.now(),
    });
    list.unshift(created);
    if (!writeJson(VIDEO_KEY, list)) throw new Error('動画を端末に保存できませんでした。');
    scheduleVaultSync();
    return created;
  }

  function legacyNodeFor(base) {
    if (!dom.legacyItems || !base) return null;
    const groups = [...dom.legacyItems.querySelectorAll('.videoGroup')];
    const candidates = [];
    groups.forEach((group) => {
      const header = group.querySelector('.videoGroupHeader');
      if (!header || text(header.textContent) !== text(base.a)) return;
      group.querySelectorAll('.videoItem').forEach((item) => {
        const idLabel = item.querySelector('.videoItemId');
        if (idLabel && text(idLabel.textContent) === 'B: ' + text(base.b)) candidates.push(item);
      });
    });
    if (candidates.length <= 1) return candidates[0] || null;
    return candidates.find((item) => text((item.querySelector('.videoItemTitle') || {}).textContent) === text(base.title)) || candidates[0];
  }

  function invokeLegacyDelete(base) {
    const node = legacyNodeFor(base); const button = node && node.querySelector('.videoDeleteBtn');
    if (!button) return false;
    button.click(); return true;
  }

  async function deleteVideoRecords(base) {
    const remove = async () => {
      if (!invokeLegacyDelete(base)) throw new Error('動画を削除できませんでした。ページを再読み込みして再試行してください。');
      if (base && base.id) delete state.meta[base.id];
      const propertyStore = window.MangaReaderVideoCustomPropertyStore;
      if (base && base.id && propertyStore && typeof propertyStore.removeVideoValues === 'function') {
        await propertyStore.removeVideoValues({ storage: localStorage, videoId: base.id, guest: true, alreadyJournaled: true });
      }
      if (!persistAux({ sync: false })) throw new Error('端末に動画の削除を保存できませんでした。');
    };
    if (window.TestCodeGuest?.isActive()) { await remove(); return; }
    const vault = window.MangaVault;
    const pointerPath = window.MangaVaultPayload && window.MangaVaultPayload.pointerPath;
    if (!vault || typeof vault.recordSyncDeletion !== 'function' || typeof pointerPath !== 'function') throw new Error('保管庫を開いてから削除してください。');
    await vault.recordSyncDeletion([pointerPath('videos', base.id), pointerPath('videoMeta', base.id), pointerPath('videoPropertyValues', base.id)], remove);
  }

  function effectiveFieldsForEditor(videoId) {
    const base = baseById(videoId); return base ? effectiveVideo(base) : null;
  }

  function fillEditorFolders(selected) {
    fillSelect(dom.editFolder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), selected || '', '未分類');
  }

  function renderSuggestedTags(selectedTags) {
    if (!dom.suggestedTags) return;
    dom.suggestedTags.replaceChildren();
    const current = new Set(Data.parseTags(selectedTags || ''));
    const tags = [...new Set(effectiveVideos().flatMap((video) => video.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
    tags.forEach((tag) => {
      const suggestedTag = document.createElement('button');
      suggestedTag.type = 'button'; suggestedTag.className = 'vl-suggested-tag'; suggestedTag.textContent = '#' + tag;
      suggestedTag.setAttribute('aria-label', 'タグ「' + tag + '」を追加');
      suggestedTag.addEventListener('click', () => {
        if (current.has(tag)) return;
        current.add(tag); dom.tags.value = [...current].join(', ');
      });
      dom.suggestedTags.append(suggestedTag);
    });
  }

  function setUrlEditing(enabled) {
    if (!dom.url || !dom.urlEdit) return;
    dom.url.readOnly = !enabled;
    dom.urlEdit.textContent = enabled ? '編集中' : '編集';
    dom.urlEdit.disabled = enabled;
  }

  function setSheetVisible(visible) {
    dom.sheet.hidden = !visible; dom.sheet.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (!visible) { state.editorId = null; state.sheetMode = null; dom.formError.textContent = ''; }
  }
  function pushSheetState() {
    const next = { ...(history.state || {}), videoLibrarySheet: true };
    history.pushState(next, '', location.href);
  }
  function closeSheet() {
    if (history.state && history.state.videoLibrarySheet) history.back(); else setSheetVisible(false);
  }

  function openEditor(videoId) {
    if (!canReadProtectedData()) return;
    state.sheetMode = videoId ? 'edit' : 'add'; state.editorId = videoId || null;
    dom.folderManager.hidden = true; dom.form.hidden = false; dom.sheetTitle.textContent = videoId ? '動画を編集' : '動画を追加'; dom.deleteBtn.hidden = !videoId;
    const video = videoId ? effectiveFieldsForEditor(videoId) : Data.normalizeVideo({ id: 'draft', addedAt: Date.now() });
    const base = videoId ? baseById(videoId) : null;
    dom.url.value = videoId ? video.url : '';
    setUrlEditing(!videoId);
    dom.title.value = videoId ? video.title : '';
    fillEditorFolders(videoId ? video.folderId : '');
    dom.statusSelect.value = videoId ? video.watchStatus : '';
    dom.tags.value = videoId ? video.tags.join(', ') : '';
    renderSuggestedTags(dom.tags.value);
    dom.memo.value = videoId ? video.memo : '';
    dom.favorite.checked = videoId ? video.favorite : false;
    dom.legacyService.value = base ? text(base.a) : '';
    dom.legacyId.value = base ? text(base.b) : '';
    dom.thumbnail.value = videoId ? video.thumbnailUrl : '';
    dom.rotate90Direction.value = videoId ? (video.rotate90Direction || (video.rotate90 ? 'left' : 'none')) : 'none';
    dom.rotate90Direction.disabled = !Data.isDirectVideoUrl(video.url);
    dom.formError.textContent = '';
    setSheetVisible(true); pushSheetState(); setTimeout(() => dom.url.focus(), 30);
  }

  function openFolderManager() {
    if (!canReadProtectedData()) return;
    state.sheetMode = 'folders'; state.editorId = null; dom.form.hidden = true; dom.folderManager.hidden = false; dom.sheetTitle.textContent = '動画フォルダ'; dom.newFolder.value = ''; renderFolderManager(); setSheetVisible(true); pushSheetState(); setTimeout(() => dom.newFolder.focus(), 30);
  }

  function renderFolderManager() {
    dom.folderList.replaceChildren();
    if (!state.folders.length) { const empty = document.createElement('div'); empty.className = 'vl-empty'; empty.textContent = 'フォルダはまだありません'; dom.folderList.append(empty); return; }
    state.folders.forEach((folder) => {
      const row = document.createElement('div'); row.className = 'vl-folder-row'; const name = document.createElement('span'); name.textContent = folder.name;
      const rename = document.createElement('button'); rename.type = 'button'; rename.textContent = '名前変更'; rename.disabled = !canReadProtectedData(); rename.addEventListener('click', () => { if (!canReadProtectedData()) return; const next = prompt('フォルダ名', folder.name); if (next == null || !text(next)) return; folder.name = text(next); persistAux(); renderFolderManager(); render(); });
      const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = '削除'; del.disabled = !canReadProtectedData(); del.addEventListener('click', async () => { if (!canReadProtectedData() || !confirm('「' + folder.name + '」を削除しますか？動画自体は削除されません。')) return; const remove = () => { state.folders = state.folders.filter((entry) => entry.id !== folder.id); Object.keys(state.meta).forEach((videoId) => { if (state.meta[videoId] && state.meta[videoId].folderId === folder.id) state.meta[videoId] = { ...state.meta[videoId], folderId: null, updatedAt: Date.now() }; }); if (!persistAux({ sync: false })) throw new Error('端末にフォルダの削除を保存できませんでした。'); }; try { if (window.TestCodeGuest?.isActive()) remove(); else { const vault = window.MangaVault; const pointerPath = window.MangaVaultPayload && window.MangaVaultPayload.pointerPath; if (!vault || typeof vault.recordSyncDeletion !== 'function' || typeof pointerPath !== 'function') throw new Error('保管庫を開いてから削除してください。'); await vault.recordSyncDeletion(pointerPath('videoFolders', folder.id), remove); } state.folderId = state.folderId === folder.id ? '' : state.folderId; renderFolderManager(); render(); } catch (error) { setStatus(error.message || 'フォルダを削除できませんでした。', true); } });
      row.append(name, rename, del); dom.folderList.append(row);
    });
  }

  function createFolder() {
    if (!canReadProtectedData()) return;
    const name = text(dom.newFolder.value); if (!name) return;
    if (state.folders.some((folder) => folder.name.toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) { setStatus('同名のフォルダがあります', true); return; }
    state.folders.push({ id: id('vf'), name, createdAt: Date.now() }); dom.newFolder.value = ''; persistAux(); renderFolderManager(); render();
  }

  async function saveEditor(event) {
    event.preventDefault(); dom.formError.textContent = '';
    if (state.editorSaving || !canReadProtectedData()) return;
    const existingBase = state.editorId ? baseById(state.editorId) : null;
    const rawUrl = text(dom.url.value);
    const classified = Data.classifyVideoUrl(rawUrl);
    if (classified.kind === 'invalid') { dom.formError.textContent = '有効な動画URLを入力してください。'; return; }
    const a = text(dom.legacyService.value) || classified.a || (existingBase && text(existingBase.a)) || '';
    const b = text(dom.legacyId.value) || classified.b || (existingBase && text(existingBase.b)) || '';
    const title = text(dom.title.value);
    const url = text(dom.url.value) || Data.legacyUrl(a, b);
    const patch = {
      title, url, folderId: text(dom.editFolder.value) || null, tags: Data.parseTags(dom.tags.value), memo: text(dom.memo.value), favorite: !!dom.favorite.checked,
      watchStatus: text(dom.statusSelect.value), thumbnailUrl: text(dom.thumbnail.value),
      rotate90: Data.isDirectVideoUrl(url) && dom.rotate90Direction.value !== 'none', rotate90Direction: Data.isDirectVideoUrl(url) ? dom.rotate90Direction.value : 'none',
    };
    state.editorSaving = true;
    const submitButton = dom.form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      let targetId = state.editorId;
      if (!existingBase) {
        const created = invokeUrlAdd({ title, url }); targetId = created.id;
      } else if (text(existingBase.a) !== a || text(existingBase.b) !== b) {
        const created = invokeUrlAdd({ title: title || existingBase.title, url });
        await deleteVideoRecords(existingBase);
        targetId = created.id;
      }
      state.meta[targetId] = { ...(state.meta[targetId] || {}), ...patch, updatedAt: Date.now() };
      if (!persistAux({ sync: false })) throw new Error('端末データを保存できません。');
      loadLibraryState(); render();
      clearTimeout(state.syncTimer);
      closeSheet();
      runVaultSync();
    } catch (error) {
      dom.formError.textContent = error && error.message ? error.message : '保存できませんでした。';
    } finally {
      state.editorSaving = false;
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function deleteVideoFromLibrary(videoId) {
    if (!canReadProtectedData()) return;
    const base = baseById(videoId); if (!base) return;
    const video = effectiveVideo(base); if (!confirm('「' + (video.title || 'この動画') + '」を削除しますか？')) return;
    try { await deleteVideoRecords(base); }
    catch (error) { setStatus(error && error.message ? error.message : '削除を保全できませんでした。', true); return; }
    loadLibraryState(); render();
    clearTimeout(state.syncTimer);
    if (!await runVaultSync()) { setStatus('端末には削除を保存しましたが、クラウド未同期です。保管庫を開いて再試行してください。', true); return; }
    if (state.editorId === videoId) closeSheet();
  }

  function openVideo(videoId) {
    if (!canReadProtectedData()) return;
    const base = baseById(videoId); if (!base) return; const video = effectiveVideo(base);
    captureReturnContext(videoId);
    updateMeta(videoId, { openCount: (video.openCount || 0) + 1, lastOpenedAt: Date.now() });
    const target = new URL('video-player.html', location.href);
    target.searchParams.set('id', videoId);
    target.searchParams.set('fromPage', String(state.page));
    window.location.href = target.href;
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    dom.search.addEventListener('input', () => { clearReturnIntent(); state.query = dom.search.value; render(); });
    document.addEventListener('testcode-context-search-change', (event) => {
      if (event.detail?.page !== 'video') return;
      clearReturnIntent();
      state.query = String(event.detail.query || '');
      dom.search.value = state.query;
      state.page = 1;
      render();
    });
    // VideoListRoute persists across Home SPA transitions: discard transient
    // search terms when leaving the video list, even when its DOM is detached.
    document.addEventListener('manga-video-list-route-detach', () => {
      state.query = '';
      if (dom.search) dom.search.value = '';
      state.page = 1;
    });
    if (!paginationEventsBound && window.MangaListPaginationEventsFactory) {
      const paginationEvents = window.MangaListPaginationEventsFactory.create({
        onPageChange(delta) {
          const nextPage = state.page + delta;
          if (nextPage < 1 || nextPage > state.totalPages || nextPage === state.page) return;
          clearReturnIntent();
          state.page = nextPage;
          render(delta);
        },
        allowSwipeTarget(node) { return !!node?.closest?.('.vl-open'); },
      });
      paginationEvents.bind({ prevButton: dom.prevPage, nextButton: dom.nextPage, swipeSurface: dom.results });
      paginationEventsBound = true;
    }
    dom.quick.addEventListener('click', (event) => { const button = event.target.closest('[data-quick]'); if (!button) return; clearReturnIntent(); state.quick = button.dataset.quick; savePrefs(); render(); });
    dom.folder.addEventListener('change', () => { clearReturnIntent(); state.folderId = dom.folder.value; render(); });
    dom.tag.addEventListener('change', () => { clearReturnIntent(); state.tag = dom.tag.value; render(); });
    dom.service.addEventListener('change', () => { clearReturnIntent(); state.service = dom.service.value; render(); });
    dom.sort.addEventListener('change', () => { clearReturnIntent(); state.sort = dom.sort.value; savePrefs(); render(); });
    dom.view.addEventListener('click', () => { clearReturnIntent(); state.view = state.view === 'card' ? 'compact' : 'card'; savePrefs(); render(); });
    dom.thumbnailSize.addEventListener('change', () => { state.thumbnailSize = ['small', 'normal', 'large'].includes(dom.thumbnailSize.value) ? dom.thumbnailSize.value : 'normal'; savePrefs(); dom.app.dataset.thumbnailSize = state.thumbnailSize; });
    dom.hiddenBtn.addEventListener('click', () => { clearReturnIntent(); state.showHidden = !state.showHidden; state.query = ''; dom.search.value = ''; state.folderId = ''; state.tag = ''; state.service = ''; render(); });
    dom.add.addEventListener('click', () => {
      if (!canReadProtectedData()) return;
      window.location.href = new URL('video-edit.html?mode=add&return=list', location.href).href;
    }); dom.shorts.addEventListener('click', () => { window.location.href = new URL('video-shorts.html', location.href).href; }); dom.foldersBtn.addEventListener('click', openFolderManager);
    dom.cancel.addEventListener('click', closeSheet); dom.form.addEventListener('submit', saveEditor); dom.deleteBtn.addEventListener('click', () => state.editorId && deleteVideoFromLibrary(state.editorId));
    dom.urlEdit.addEventListener('click', () => setUrlEditing(true));
    dom.url.addEventListener('input', () => { dom.rotate90Direction.disabled = !Data.isDirectVideoUrl(dom.url.value); });
    dom.createFolder.addEventListener('click', createFolder); dom.newFolder.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); createFolder(); } });
    dom.sheet.addEventListener('click', (event) => { if (event.target === dom.sheet) return; });
    window.addEventListener('beforeunload', (event) => {
      const vault = window.MangaVault;
      if (vault && typeof vault.guardPendingSyncLeave === 'function') vault.guardPendingSyncLeave(event, state.syncRunning);
    });
    window.addEventListener('online', resumePendingLocalSync);
    document.addEventListener('manga-reader-vpn-status', () => {
      if (canReadProtectedData()) { render(); resumePendingLocalSync(); }
    });
    window.addEventListener('popstate', () => { if (!(history.state && history.state.videoLibrarySheet)) setSheetVisible(false); });
  }

  function syncAccessUi() {
    const allowed = canReadProtectedData();
    if (dom.accessNotice) dom.accessNotice.hidden = allowed;
    if (dom.add) dom.add.disabled = !allowed;
    if (dom.foldersBtn) dom.foldersBtn.disabled = !allowed;
    if (dom.deleteBtn) dom.deleteBtn.disabled = !allowed;
    if (dom.createFolder) dom.createFolder.disabled = !allowed;
    if (dom.form) dom.form.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = !allowed; });
    if (!allowed && dom.sheet) setSheetVisible(false);
  }

  function init(access) {
    if (access) mediaAccess = access;
    if (!document.getElementById('videoListSection')) return;
    injectStyles(); loadPrefs(); loadLibraryState(); if (!setupMarkup()) return; bindEvents(); if (dom.search) dom.search.value = state.query; render(); resumePendingLocalSync();
  }

  window.MangaReaderVideoLibrary = Object.freeze({ init, syncAccessUi, captureReturnContext });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0), { once: true });
  else setTimeout(init, 0);
})();
