(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const Data = window.MangaReaderVideoData;
  const Pagination = window.VideoLibraryPagination;
  const View = window.MangaReaderVideoLibraryView;
  if (!Data || !Pagination || !View) return;

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
    baseVideos: [], folders: [], meta: {}, query: '', quick: 'all', folderId: '', tag: '', service: '', kind: 'all', sort: 'recent-added', view: 'card', thumbnailSize: 'normal', page: 1, totalPages: 1,
    seriesSelecting: false, seriesSelected: new Set(), expandedSeries: new Set(),
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
    const visible = Data.filterVideos(scoped, { showHidden: state.showHidden, query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, kind: state.kind, videoMeta: state.meta, folders: state.folders });
    const filtered = CustomProperties ? visible.filter(video => CustomProperties.matchesFilters(video, state.customDefinitions, state.customValues, Object.values(state.customFilters))) : visible;
    const ordered = Data.sortVideos(filtered, state.sort);
    const context = {
      id: String(videoId), page: state.page, sort: state.sort, view: state.view,
      // Reopening a video changes 'recent-opened' ordering. Retain the original
      // list order for this one return instead of moving it to page 1.
      orderIds: ordered.length <= 10000 ? ordered.map(video => String(video.id)) : null,
      showHidden: state.showHidden, query: state.query, quick: state.quick,
      folderId: state.folderId, tag: state.tag, service: state.service, kind: state.kind,
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
      state.kind = ['all', 'direct', 'bookmark'].includes(saved.kind) ? saved.kind : 'all';
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
    if (!returnIntent || !pageItems.some(item => item.kind === 'series'
      ? item.videos.some(video => String(video.id) === returnIntent.id)
      : String(item.video.id) === returnIntent.id)) return;
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
    state.kind = ['all', 'direct', 'bookmark'].includes(prefs.kind) ? prefs.kind : 'all';
  }
  function savePrefs() { writeJson(PREF_KEY, { sort: state.sort, view: state.view, thumbnailSize: state.thumbnailSize, quick: state.quick, kind: state.kind }); }

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

  let urlMigrationRunning = false;
  async function migrateExistingVideoUrls() {
    if (urlMigrationRunning || !canReadProtectedData()) return;
    const videos = readJson(VIDEO_KEY, []);
    if (!Array.isArray(videos) || videos.length < 2) return;
    const groups = new Map();
    videos.forEach((video, index) => {
      // Published editions have independent IDs even if they play the same MP4
      // bytes. URL-based duplicate consolidation must never merge them.
      if (video.virtualEdition === true || (state.meta[String(video.id)]?.virtualPublishedEdit)) return;
      const key = Data.videoUrlIdentity(video.url);
      if (!key) return;
      const group = groups.get(key) || [];
      group.push({ video, index });
      groups.set(key, group);
    });
    const duplicates = [...groups.values()].filter(group => group.length > 1);
    if (!duplicates.length) return;
    urlMigrationRunning = true;
    try {
      const meta = readJson(META_KEY, {});
      const markers = readJson('mangaReaderVideoMarkers', {});
      const propertyKey = 'mangaReaderVideoPropertyValues';
      const properties = readJson(propertyKey, {});
      const nextMeta = { ...meta }, nextMarkers = { ...markers }, nextProperties = { ...properties };
      const removed = new Set();
      const nextVideos = videos.map(item => ({ ...item }));
      for (const group of duplicates) {
        // The most recently added entry supplies the default playback URL.
        const newest = group.slice().sort((a, b) =>
          (Number(b.video.addedAt) || 0) - (Number(a.video.addedAt) || 0) || b.index - a.index)[0];
        const keeper = nextVideos[newest.index];
        const keeperId = String(keeper.id);
        const all = group.slice().sort((a, b) =>
          (Number(a.video.addedAt) || 0) - (Number(b.video.addedAt) || 0) || a.index - b.index);
        keeper.alternateUrls = [...new Set(all.flatMap(entry =>
          [entry.video.url, ...(Array.isArray(entry.video.alternateUrls) ? entry.video.alternateUrls : [])]))]
          .filter(url => url && url !== keeper.url);
        let combined = { ...(nextMeta[keeperId] || {}) };
        let mergedMarkers = Array.isArray(nextMarkers[keeperId]) ? [...nextMarkers[keeperId]] : [];
        let mergedProps = { ...(nextProperties[keeperId] || {}) };
        for (const entry of all) {
          const item = entry.video;
          if (String(item.id) === keeperId) continue;
          const oldId = String(item.id);
          const old = nextMeta[oldId] || {};
          // Preserve the keeper's existing values, filling blank fields from removed entries.
          for (const [key, value] of Object.entries(old)) {
            if ((combined[key] == null || combined[key] === '' || (Array.isArray(combined[key]) && !combined[key].length))
              && value != null && value !== '') combined[key] = value;
          }
          combined.tags = [...new Set([...(Array.isArray(combined.tags) ? combined.tags : []), ...(Array.isArray(old.tags) ? old.tags : [])])];
          combined.favorite = combined.favorite === true || old.favorite === true;
          combined.openCount = (Number(combined.openCount) || 0) + (Number(old.openCount) || 0);
          combined.lastOpenedAt = Math.max(Number(combined.lastOpenedAt) || 0, Number(old.lastOpenedAt) || 0);
          combined.progressSeconds = Math.max(Number(combined.progressSeconds) || 0, Number(old.progressSeconds) || 0);
          if (Array.isArray(nextMarkers[oldId])) mergedMarkers.push(...nextMarkers[oldId]);
          for (const [key, value] of Object.entries(nextProperties[oldId] || {})) {
            if (mergedProps[key] == null || mergedProps[key] === '') mergedProps[key] = value;
          }
          delete nextMeta[oldId]; delete nextMarkers[oldId]; delete nextProperties[oldId];
          removed.add(oldId);
        }
        combined.updatedAt = Date.now();
        nextMeta[keeperId] = combined;
        nextMarkers[keeperId] = mergedMarkers.filter((marker, index, list) =>
          list.findIndex(m => (m.id && marker.id ? m.id === marker.id : JSON.stringify(m) === JSON.stringify(marker))) === index);
        nextProperties[keeperId] = mergedProps;
      }
      const output = nextVideos.filter(item => !removed.has(String(item.id)));
      const keys = [VIDEO_KEY, META_KEY, 'mangaReaderVideoMarkers', propertyKey];
      const values = [output, nextMeta, nextMarkers, nextProperties];
      const commit = () => {
        const before = keys.map(key => localStorage.getItem(key));
        try {
          keys.forEach((key, index) => localStorage.setItem(key, JSON.stringify(values[index])));
        } catch (error) {
          keys.forEach((key, index) => {
            try { before[index] == null ? localStorage.removeItem(key) : localStorage.setItem(key, before[index]); } catch (_) {}
          });
          throw error;
        }
      };
      if (window.TestCodeGuest?.isActive()) commit();
      else {
        const vault = window.MangaVault;
        const pointer = window.MangaVaultPayload?.pointerPath;
        if (!vault || typeof vault.recordSyncDeletion !== 'function' || typeof pointer !== 'function') return;
        const paths = [...removed].flatMap(id => [
          pointer('videos', id), pointer('videoMeta', id), pointer('videoMarkers', id),
          pointer('videoPropertyValues', id)]);
        await vault.recordSyncDeletion(paths, commit);
      }
      loadLibraryState();
      render();
      scheduleVaultSync();
    } catch (error) {
      console.error('Video URL migration failed; original records retained where possible', error);
      setStatus('既存URLの統合を保存できませんでした。', true);
    } finally { urlMigrationRunning = false; }
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
    const isBookmark = Data.videoEntryKind(video, state.meta[String(video.id)]) === 'bookmark';
    const metadata = [];
    const service = Data.deriveService(video.url, video.a);
    if (service && !isBookmark) metadata.push(service);
    if (video.folderId && folderName(video.folderId)) metadata.push(folderName(video.folderId));
    if (video.seriesId && effectiveVideos().some(item => item.id !== video.id && item.seriesId === video.seriesId)) metadata.push('シリーズ');
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
    // Legacy publications used a link to a special player as their stored
    // URL. Give them the exact same MP4 thumbnail and dimensions as all new
    // published video cards, without rewriting saved IDs or metadata.
    let cardMedia = video;
    if (state.meta[String(video.id)]?.virtualPublishedEdit) {
      const publication = state.meta[String(video.id)].virtualPublishedEdit;
      const first = publication.edit?.clips?.[0];
      const source = first && state.baseVideos.find((item) => String(item.id) === first.sourceVideoId);
      if (source) {
        const sourceMeta = state.meta[String(source.id)] || {};
        const mediaUrl = typeof sourceMeta.url === 'string' ? sourceMeta.url : source.url;
        if (Data.isDirectVideoUrl(mediaUrl)) {
          cardMedia = { ...video, url: mediaUrl,
            thumbnailTimeSeconds: video.thumbnailTimeSeconds == null ? first.startSeconds : video.thumbnailTimeSeconds,
            rotate90Direction: first.rotation === 90 ? 'right' : first.rotation === -90 ? 'left' : 'none',
            virtualThumbRotation: first.rotation || 0 };
        }
      }
    }
    const card = VideoCard.create(cardMedia, {
      documentRef: document, layout: state.view === 'compact' ? 'compact' : 'grid', openClass: 'vl-open',
      bookmark: isBookmark, openHref: isBookmark && video.embedPage !== true ? video.url : null, serviceLabel: service,
      title, metadata, tags: Array.isArray(video.tags) ? video.tags : [], customLabels,
      progressPercent: isBookmark ? null : progressPercent(video),
      thumbnailRenderer: window.MangaReaderVideoThumbnailRenderer,
      thumbnailOptions: { fallbackClass: 'vl-thumb-fallback', videoClass: 'vl-thumb-direct-video', serviceLabel: service || 'VIDEO' },
      onOpen: () => openVideo(video.id),
      menuActions: [{ label: video.favorite ? 'お気に入りを解除' : 'お気に入りに追加', onSelect: () => { updateMeta(video.id, { favorite: !video.favorite }); render(); } },
        ...(video.seriesId && effectiveVideos().some(item => item.id !== video.id && item.seriesId === video.seriesId)
          ? [{ label: 'シリーズから外す', onSelect: () => commitSeries('remove', [video.id]) }] : [])],
      editHref: 'video-edit.html?id=' + encodeURIComponent(video.id) + '&return=list',
    });
    card.classList.add('vl-card');
    card.dataset.videoId = String(video.id);
    if (state.seriesSelecting) {
      const pick = document.createElement('label');
      pick.className = 'vl-series-pick';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = state.seriesSelected.has(String(video.id));
      checkbox.setAttribute('aria-label', title + 'をシリーズ用に選択');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.seriesSelected.add(String(video.id));
        else state.seriesSelected.delete(String(video.id));
        render();
      });
      pick.append(checkbox, document.createTextNode('選択'));
      card.append(pick);
    }
    return card;
  }

  function createSeriesCard(group) {
    const section = document.createElement('section');
    section.className = 'vl-series';
    section.dataset.seriesId = group.id;
    const heading = document.createElement('div');
    heading.className = 'vl-series-heading';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'vl-series-toggle';
    const expanded = state.expandedSeries.has(group.id);
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = (expanded ? '▾ ' : '▸ ') + 'シリーズ · ' + group.videos.length + '本';
    toggle.addEventListener('click', () => {
      if (expanded) state.expandedSeries.delete(group.id);
      else state.expandedSeries.add(group.id);
      render();
    });
    heading.append(toggle);
    if (state.seriesSelecting) {
      const label = document.createElement('label');
      label.className = 'vl-series-select-all';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = group.videos.every(video => state.seriesSelected.has(String(video.id)));
      checkbox.setAttribute('aria-label', 'このシリーズ内の動画をすべて選択');
      checkbox.addEventListener('change', () => {
        group.videos.forEach(video => {
          if (checkbox.checked) state.seriesSelected.add(String(video.id));
          else state.seriesSelected.delete(String(video.id));
        });
        render();
      });
      label.append(checkbox, document.createTextNode('まとめて選択'));
      heading.append(label);
    }
    section.append(heading);
    if (expanded) {
      const grid = document.createElement('div');
      grid.className = 'vl-series-videos';
      group.videos.forEach(video => grid.append(createCard(video)));
      section.append(grid);
    }
    return section;
  }

  function commitSeries(action, videoIds) {
    if (!canReadProtectedData()) return false;
    // Rebase grouping on the latest local snapshot, including edits made on
    // the standalone video details page.
    loadLibraryState();
    const plan = Data.planSeriesChanges(effectiveVideos(), videoIds, action, () => id('vs'));
    const errors = {
      selection: '動画を選択してください。',
      minimum: 'シリーズにまとめるには2本以上選んでください。',
      multiple: '別々のシリーズの動画を同時にまとめることはできません。',
      id: 'シリーズを作成できませんでした。',
      action: '操作を確認してください。',
    };
    if (plan.error) { setStatus(errors[plan.error] || 'シリーズを変更できませんでした。', true); return false; }
    if (!Object.keys(plan.changes).length) { setStatus('シリーズの変更はありません。'); return false; }
    const original = state.meta;
    state.meta = { ...original };
    const now = Date.now();
    Object.entries(plan.changes).forEach(([videoId, seriesId]) => {
      state.meta[videoId] = { ...(state.meta[videoId] || {}), seriesId, updatedAt: now };
    });
    if (!persistAux()) {
      state.meta = original;
      setStatus('シリーズを保存できませんでした。端末の保存状態を確認してください。', true);
      return false;
    }
    state.seriesSelected.clear();
    state.seriesSelecting = false;
    render();
    setStatus(action === 'group' ? 'シリーズにまとめました。' : 'シリーズから外しました。');
    return true;
  }

  function updateSeriesControls() {
    const allowed = canReadProtectedData();
    dom.seriesMode.textContent = state.seriesSelecting ? '選択を終了' : 'シリーズ';
    dom.seriesMode.setAttribute('aria-pressed', String(state.seriesSelecting));
    dom.seriesBar.hidden = !state.seriesSelecting;
    dom.seriesCount.textContent = state.seriesSelected.size + '本選択中';
    dom.seriesGroup.disabled = !allowed || state.seriesSelected.size < 2;
    dom.seriesRemove.disabled = !allowed || !state.seriesSelected.size;
  }

  function renderFilterOptions(videos) {
    const currentFolder = state.folderId, currentTag = state.tag, currentService = state.service;
    fillSelect(dom.folder, state.folders.map((folder) => ({ value: folder.id, label: folder.name })), currentFolder, '全フォルダ');
    const tags = [...new Set(videos.flatMap((video) => video.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
    fillSelect(dom.tag, tags.map((tag) => ({ value: tag, label: '#' + tag })), currentTag, '全タグ');
    const services = [...new Set(videos.map((video) => Data.deriveService(video.url, video.a)).filter(Boolean))].sort();
    fillSelect(dom.service, services.map((service) => ({ value: service, label: service })), currentService, '全サービス');
    dom.kind.value = state.kind;
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
    const all = effectiveVideos();
    // Initial local/Vault hydration can be asynchronous. Do not lose the
    // return intent when the target is not yet available.
    const target = all.find(video => String(video.id) === targetId);
    if (!target) return;
    // A hidden video is no longer in the ordinary list. Do not jump to the
    // hidden folder to manufacture a page containing it. Return to page 1 of
    // the regular list instead, even when it was opened from the hidden list.
    if (target.hidden) {
      clearReturnIntent();
      state.showHidden = false;
      state.page = 1;
      state.query = ''; state.quick = 'all'; state.folderId = ''; state.tag = ''; state.service = ''; state.kind = 'all'; state.customFilters = {};
      if (dom.search) dom.search.value = '';
      return;
    }
    // Reapply only for videos that still belong to the regular list.
    restoreReturnContext(targetId);
    const findInCurrentView = () => {
      const scoped = all.filter(video => video.hidden === state.showHidden);
      const visible = Data.filterVideos(scoped, { showHidden: state.showHidden, query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, kind: state.kind, videoMeta: state.meta, folders: state.folders });
      const filtered = CustomProperties ? visible.filter(video => CustomProperties.matchesFilters(video, state.customDefinitions, state.customValues, Object.values(state.customFilters))) : visible;
      return sortForReturn(filtered);
    };
    let list = findInCurrentView();
    let index = list.findIndex(video => String(video.id) === targetId);
    if (index < 0) {
      const target = all.find(video => String(video.id) === targetId);
      if (target) {
        state.showHidden = false;
        state.query = ''; state.quick = 'all'; state.folderId = ''; state.tag = ''; state.service = ''; state.kind = 'all'; state.customFilters = {};
        if (dom.search) dom.search.value = '';
        list = findInCurrentView();
        index = list.findIndex(video => String(video.id) === targetId);
      }
    }
    if (index < 0) return;
    // Pagination counts boxes rather than the individual grouped videos.
    const boxes = Data.groupVideosBySeries(list);
    const boxIndex = boxes.findIndex(item => item.kind === 'series'
      ? item.videos.some(video => String(video.id) === targetId)
      : String(item.video.id) === targetId);
    if (boxIndex < 0) return;
    // Open the returned member once, but let the user collapse it afterward.
    if (boxes[boxIndex].kind === 'series' && !returnIntent.seriesRevealed) {
      state.expandedSeries.add(boxes[boxIndex].id);
      returnIntent.seriesRevealed = true;
    }
    const calculatedPage = Math.floor(boxIndex / Pagination.PAGE_SIZE) + 1;
    const originPage = returnIntent.page;
    const candidate = Number.isSafeInteger(originPage) && originPage > 0 ? originPage : calculatedPage;
    const pageStart = (candidate - 1) * Pagination.PAGE_SIZE;
    state.page = boxes.slice(pageStart, pageStart + Pagination.PAGE_SIZE).some(item => item.kind === 'series'
      ? item.videos.some(video => String(video.id) === targetId)
      : String(item.video.id) === targetId) ? candidate : calculatedPage;
  }

  function render(pageDirection = 0) {
    loadLibraryState();
    restoreVideoPage();
    syncAccessUi();
    const all = effectiveVideos();
    const validIds = new Set(all.map(video => String(video.id)));
    for (const selectedId of state.seriesSelected) if (!validIds.has(selectedId)) state.seriesSelected.delete(selectedId);
    const scoped = all.filter((video) => video.hidden === state.showHidden);
    renderFilterOptions(scoped);
    renderCustomFilters();
    const baseFiltered = Data.filterVideos(scoped, { showHidden: state.showHidden, query: state.query, quick: state.quick === 'all' ? '' : state.quick, folderId: state.folderId, tag: state.tag, service: state.service, kind: state.kind, videoMeta: state.meta, folders: state.folders });
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
    updateSeriesControls();
    const displayItems = Data.groupVideosBySeries(videos);
    const pageModel = Pagination.derive(displayItems, state.page, Pagination.PAGE_SIZE);
    state.page = pageModel.page;
    state.totalPages = pageModel.totalPages;
    dom.pagination.hidden = !pageModel.hasMultiplePages;
    dom.prevPage.disabled = state.page <= 1;
    dom.nextPage.disabled = state.page >= state.totalPages;
    dom.pageLabel.textContent = state.page + ' / ' + state.totalPages;
    // Reuse existing thumbnail nodes when only watch-count bookkeeping changes.
    const visualVideo = ({ openCount, lastOpenedAt, updatedAt, ...visual }) => ({
      ...visual, selected: state.seriesSelected.has(String(visual.id)), selectionMode: state.seriesSelecting,
    });
    const visibleItems = pageModel.items.map(item => item.kind === 'series'
      ? { kind: 'series', id: item.id, expanded: state.expandedSeries.has(item.id),
          videos: item.videos.map(visualVideo), selectionMode: state.seriesSelecting }
      : { kind: 'video', video: visualVideo(item.video) });
    const resultsKey = JSON.stringify([state.view, state.showHidden, state.page, visibleItems]);
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
      const grid = document.createElement('div'); grid.className = 'vl-grid' + (state.view === 'compact' ? ' compact' : ''); pageModel.items.forEach(item => grid.append(item.kind === 'series' ? createSeriesCard(item) : createCard(item.video))); incoming.append(grid);
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
    const matchingIndex = list.findIndex(item => item.virtualEdition !== true
      && !state.meta[String(item.id)]?.virtualPublishedEdit
      && [item.url, ...(item.alternateUrls || [])].some(candidate => Data.videoUrlIdentity(candidate) === Data.videoUrlIdentity(url)));
    if (matchingIndex >= 0) {
      if (list[matchingIndex].url === url) return Data.normalizeVideo(list[matchingIndex]);
      if (!markLocalChangesPending()) throw new Error('未同期状態を記録できませんでした。');
      list[matchingIndex] = Data.promoteVideoUrl(list[matchingIndex], url);
      if (!writeJson(VIDEO_KEY, list)) throw new Error('URLを保存できませんでした。');
      scheduleVaultSync();
      return Data.normalizeVideo(list[matchingIndex]);
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
    dom.embedPage.checked = videoId ? video.embedPage === true : false;
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
      title, url, folderId: text(dom.editFolder.value) || null, tags: Data.parseTags(dom.tags.value), memo: text(dom.memo.value), favorite: !!dom.favorite.checked, embedPage: dom.embedPage.checked && classified.kind !== 'direct',
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
      state.seriesSelecting = false; state.seriesSelected.clear(); renderedResultsKey = null;
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
    dom.kind.addEventListener('change', () => { clearReturnIntent(); state.kind = dom.kind.value; state.page = 1; savePrefs(); render(); });
    dom.sort.addEventListener('change', () => { clearReturnIntent(); state.sort = dom.sort.value; savePrefs(); render(); });
    dom.view.addEventListener('click', () => { clearReturnIntent(); state.view = state.view === 'card' ? 'compact' : 'card'; savePrefs(); render(); });
    dom.thumbnailSize.addEventListener('change', () => { state.thumbnailSize = ['small', 'normal', 'large'].includes(dom.thumbnailSize.value) ? dom.thumbnailSize.value : 'normal'; savePrefs(); dom.app.dataset.thumbnailSize = state.thumbnailSize; });
    dom.hiddenBtn.addEventListener('click', () => { clearReturnIntent(); state.showHidden = !state.showHidden; state.seriesSelected.clear(); state.query = ''; dom.search.value = ''; state.folderId = ''; state.tag = ''; state.service = ''; render(); });
    dom.seriesMode.addEventListener('click', () => {
      if (!canReadProtectedData()) return;
      state.seriesSelecting = !state.seriesSelecting;
      state.seriesSelected.clear();
      render();
    });
    dom.seriesGroup.addEventListener('click', () => commitSeries('group', [...state.seriesSelected]));
    dom.seriesRemove.addEventListener('click', () => commitSeries('remove', [...state.seriesSelected]));
    dom.seriesCancel.addEventListener('click', () => { state.seriesSelecting = false; state.seriesSelected.clear(); render(); });
    dom.add.addEventListener('click', () => {
      if (!canReadProtectedData()) return;
      window.location.href = new URL('video-edit.html?mode=add&return=list', location.href).href;
    }); dom.shorts.addEventListener('click', () => { window.location.href = new URL('video-shorts.html', location.href).href; });
    dom.cancel.addEventListener('click', closeSheet); dom.form.addEventListener('submit', saveEditor); dom.deleteBtn.addEventListener('click', () => state.editorId && deleteVideoFromLibrary(state.editorId));
    dom.urlEdit.addEventListener('click', () => setUrlEditing(true));
    dom.url.addEventListener('input', () => { dom.rotate90Direction.disabled = !Data.isDirectVideoUrl(dom.url.value); });
    dom.createFolder.addEventListener('click', createFolder); dom.newFolder.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); createFolder(); } });
    dom.sheet.addEventListener('click', (event) => { if (event.target === dom.sheet) return; });
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
    if (dom.seriesMode) dom.seriesMode.disabled = !allowed;
    if (!allowed) { state.seriesSelecting = false; state.seriesSelected.clear(); }
    if (dom.deleteBtn) dom.deleteBtn.disabled = !allowed;
    if (dom.createFolder) dom.createFolder.disabled = !allowed;
    if (dom.form) dom.form.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = !allowed; });
    if (!allowed && dom.sheet) setSheetVisible(false);
  }

  function init(access) {
    if (access) mediaAccess = access;
    if (!document.getElementById('videoListSection')) return;
    loadPrefs(); loadLibraryState(); if (!View.setupMarkup(document, dom)) return; bindEvents(); if (dom.search) dom.search.value = state.query; render(); resumePendingLocalSync(); migrateExistingVideoUrls();
  }

  function refreshFromStorage() {
    if (!canReadProtectedData() || !dom.results) return;
    loadLibraryState();
    render();
  }

  // video-list-route.js is the sole bootstrap owner. This module exposes the
  // API without scheduling an independent DOMContentLoaded/timer initialization.
  window.MangaReaderVideoLibrary = Object.freeze({ init, syncAccessUi, captureReturnContext, refreshFromStorage });
})();
