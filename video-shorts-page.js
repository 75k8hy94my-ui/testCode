(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoShortsPage = api;
  if (root && root.document && root.document.getElementById('videoShortsPage')) {
    const instance = api.create();
    root.MangaReaderVideoShortsPageInstance = instance;
    instance.start();
  }
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const VIDEO_KEY = 'mangaReaderVideos';
  const META_KEY = 'mangaReaderVideoMeta';
  const MARKER_KEY = 'mangaReaderVideoMarkers';
  const MAX_PROBES = 3;

  function create(deps = {}) {
    const documentRef = deps.documentRef || root.document;
    const windowRef = deps.windowRef || root;
    const page = deps.page || documentRef.getElementById('videoShortsPage');
    const mediaAccess = deps.mediaAccess || windowRef.MangaReaderMediaAccess;
    const storage = deps.storage || windowRef.localStorage;
    const Data = deps.videoData || windowRef.MangaReaderVideoData;
    const Queue = deps.queue || windowRef.MangaReaderVideoShortsQueue;
    const stateModule = windowRef.MangaReaderVideoShortsState;
    const stateApi = deps.state || (stateModule && typeof stateModule.create === 'function' ? stateModule.create() : stateModule);
    const probe = deps.probeMetadata || probeMetadata;
    let protectedState = null;
    let currentVideos = [];
    let queue = [];
    let queueIndex = 0;
    let currentTime = 0;
    let activeVideo = null;
    let nextVideo = null;
    let syncTimer = null;
    let generationToken = 0;
    let started = false;

    function canReadProtectedData() {
      try { return !!mediaAccess && typeof mediaAccess.canReadProtectedData === 'function' && mediaAccess.canReadProtectedData() === true; }
      catch (_) { return false; }
    }

    function readProtectedData() {
      if (!canReadProtectedData()) return null;
      const read = (key, fallback) => {
        try { const value = JSON.parse(storage.getItem(key) || 'null'); return value == null ? fallback : value; }
        catch (_) { return fallback; }
      };
      return { videos: read(VIDEO_KEY, []), meta: read(META_KEY, {}), markers: read(MARKER_KEY, {}) };
    }

    function renderGate() {
      if (!page || !documentRef.createElement) return;
      const section = documentRef.createElement('section'); section.className = 'profileContent vpnRouteGate';
      const heading = documentRef.createElement('h2'); heading.textContent = 'VPN接続が必要です';
      const message = documentRef.createElement('p'); message.className = 'profileLead'; message.textContent = 'VPN接続を確認できるまで、動画を読み込みません。';
      const retry = documentRef.createElement('button'); retry.type = 'button'; retry.className = 'glassBtn'; retry.dataset.vpnRecheckButton = '1'; retry.textContent = 'VPN接続を再確認';
      const diagnostics = documentRef.createElement('button'); diagnostics.type = 'button'; diagnostics.className = 'glassBtn'; diagnostics.dataset.vpnDiagnosticsButton = '1'; diagnostics.textContent = 'VPN診断';
      const back = documentRef.createElement('a'); back.className = 'glassBtn'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
      section.append(heading, message, retry, diagnostics, back); page.replaceChildren(section);
      if (mediaAccess && typeof mediaAccess.syncUi === 'function') mediaAccess.syncUi();
    }

    function removeVideo(video) {
      if (!video) return;
      try { video.pause(); } catch (_) {}
      try { video.removeAttribute('src'); video.load(); } catch (_) {}
      if (video.parentNode) video.remove();
    }

    function disposeProtectedState() {
      generationToken += 1;
      clearTimeout(syncTimer); syncTimer = null;
      removeVideo(activeVideo); removeVideo(nextVideo); activeVideo = null; nextVideo = null;
      protectedState = null; currentVideos = []; queue = []; queueIndex = 0; currentTime = 0;
      if (page) page.replaceChildren();
    }

    function saveProgress(immediate = false) {
      if (!protectedState || !canReadProtectedData() || !stateApi || typeof stateApi.save !== 'function') return null;
      currentTime = activeVideo && Number.isFinite(activeVideo.currentTime) ? activeVideo.currentTime : currentTime;
      const next = { ...protectedState, queue, currentIndex: queueIndex, currentTime, updatedAt: Date.now() };
      if (immediate) { clearTimeout(syncTimer); syncTimer = null; protectedState = stateApi.save(next, { sync: !isGuest() }) || protectedState; return protectedState; }
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => { syncTimer = null; if (canReadProtectedData()) protectedState = stateApi.save(next, { sync: !isGuest() }) || protectedState; }, 1200);
      return next;
    }

    function isGuest() { try { return !!windowRef.TestCodeGuest && windowRef.TestCodeGuest.isActive() === true; } catch (_) { return false; } }

    function findVideo(videoId) { return currentVideos.find((video) => String(video.id) === String(videoId)); }

    function createVideo(entry, hidden = false) {
      const videoData = findVideo(entry.videoId);
      if (!videoData) return null;
      const video = documentRef.createElement('video');
      video.className = hidden ? 'shortsPreload' : 'shortsVideo';
      video.preload = hidden ? 'auto' : 'metadata'; video.playsInline = true; video.controls = false; video.src = videoData.url;
      video.dataset.entryIndex = String(hidden ? queueIndex + 1 : queueIndex);
      video.hidden = hidden;
      video.addEventListener('timeupdate', () => { if (video === activeVideo) saveProgress(false); });
      video.addEventListener('pause', () => { if (video === activeVideo) saveProgress(true); });
      video.addEventListener('ended', () => { if (video === activeVideo) goTo(queueIndex + 1); });
      video.addEventListener('dblclick', () => openOrdinaryPlayer());
      return video;
    }

    function releaseNext() { removeVideo(nextVideo); nextVideo = null; }

    function loadWindow(startTime) {
      if (!protectedState || !queue.length || !canReadProtectedData()) return;
      const entry = queue[queueIndex];
      if (!entry) return;
      let video = nextVideo && Number(nextVideo.dataset.entryIndex) === queueIndex ? nextVideo : null;
      if (video) { nextVideo = null; }
      else video = createVideo(entry, false);
      if (activeVideo && activeVideo !== video) removeVideo(activeVideo);
      activeVideo = video;
      if (!activeVideo) return;
      activeVideo.hidden = false; activeVideo.className = 'shortsVideo';
      const start = Number.isFinite(startTime) ? startTime : (queueIndex === protectedState.currentIndex ? protectedState.currentTime : entry.startSeconds);
      const clamped = Math.max(entry.startSeconds, Math.min(start || entry.startSeconds, entry.endSeconds));
      if (Math.abs(activeVideo.currentTime - clamped) > 0.25) {
        const seekWhenReady = () => { try { activeVideo.currentTime = clamped; } catch (_) {} };
        if (activeVideo.readyState >= 1) seekWhenReady();
        else activeVideo.addEventListener('loadedmetadata', seekWhenReady, { once: true });
      }
      activeVideo.addEventListener('timeupdate', () => { if (activeVideo.currentTime >= entry.endSeconds - 0.1 && queueIndex < queue.length - 1) goTo(queueIndex + 1); }, { once: false });
      page.querySelector('.shortsMedia')?.append(activeVideo);
      const nextEntry = queue[queueIndex + 1];
      releaseNext();
      if (nextEntry) { nextVideo = createVideo(nextEntry, true); page.querySelector('.shortsMedia')?.append(nextVideo); }
      const play = activeVideo.play(); if (play && typeof play.catch === 'function') play.catch(() => {});
    }

    function goTo(nextIndex) {
      if (!canReadProtectedData() || !protectedState || !queue.length) return false;
      const target = Math.max(0, Math.min(queue.length - 1, Number(nextIndex) || 0));
      if (target === queueIndex) return false;
      saveProgress(true);
      queueIndex = target; currentTime = queue[target].startSeconds;
      protectedState = { ...protectedState, currentIndex: queueIndex, currentTime };
      loadWindow(currentTime); saveProgress(true);
      return true;
    }

    function openOrdinaryPlayer() {
      if (!activeVideo || !queue[queueIndex] || !canReadProtectedData()) return;
      saveProgress(true);
      const videoId = encodeURIComponent(queue[queueIndex].videoId);
      windowRef.location.href = 'video-player.html?id=' + videoId + '&start=' + encodeURIComponent(String(activeVideo.currentTime || currentTime));
    }

    function renderPlayer() {
      if (!page || !documentRef.createElement) return;
      page.replaceChildren();
      const stage = documentRef.createElement('section'); stage.className = 'shortsStage';
      const back = documentRef.createElement('a'); back.className = 'shortsBack'; back.href = 'video.html'; back.setAttribute('aria-label', '動画一覧へ戻る'); back.textContent = '←';
      const media = documentRef.createElement('div'); media.className = 'shortsMedia'; media.tabIndex = 0; media.setAttribute('aria-label', '縦スワイプ動画');
      const empty = documentRef.createElement('p'); empty.className = 'shortsEmpty'; empty.textContent = currentVideos.length ? '再生できる動画を準備できませんでした。' : '対象の動画がありません。';
      stage.append(back, media); page.append(stage);
      if (!queue.length) media.append(empty); else loadWindow(protectedState.currentTime);
      const onWheel = (event) => { if (Math.abs(event.deltaY) > 20) goTo(queueIndex + (event.deltaY > 0 ? 1 : -1)); };
      media.addEventListener('wheel', onWheel, { passive: true });
      media.addEventListener('keydown', (event) => { if (event.key === 'ArrowDown' || event.key === 'PageDown') goTo(queueIndex + 1); else if (event.key === 'ArrowUp' || event.key === 'PageUp') goTo(queueIndex - 1); });
    }

    async function probeMetadata(video) {
      if (deps.probeMetadata) return deps.probeMetadata(video);
      const element = documentRef.createElement('video'); element.preload = 'metadata'; element.muted = true;
      const result = await new Promise((resolve) => {
        let settled = false;
        const done = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
        const timer = setTimeout(() => done(null), 10000);
        element.addEventListener('loadedmetadata', () => done({ videoWidth: element.videoWidth, videoHeight: element.videoHeight, durationSeconds: element.duration }));
        element.addEventListener('error', () => done(null));
        element.src = video.url;
        if (typeof element.load === 'function') element.load();
      });
      try { element.removeAttribute('src'); element.load(); } catch (_) {}
      if (element.parentNode) element.remove();
      return result;
    }

    async function probeAll(videos, token) {
      const direct = videos.filter((video) => Data && Data.isDirectVideoUrl(video.url));
      const results = new Array(direct.length); let nextIndex = 0;
      const workers = Array.from({ length: Math.min(MAX_PROBES, direct.length) }, async () => {
        while (nextIndex < direct.length) {
          const index = nextIndex++;
          try { results[index] = await probe(direct[index]); } catch (_) { results[index] = null; }
          if (token !== generationToken || !canReadProtectedData()) return;
        }
      });
      await Promise.all(workers);
      if (token !== generationToken || !canReadProtectedData()) return [];
      return direct.map((video, index) => results[index] && Number(results[index].durationSeconds) > 0
        ? { ...video, ...results[index] }
        : null).filter(Boolean);
    }

    function queueIsUsable(candidate, videos) {
      if (!Array.isArray(candidate) || !candidate.length) return false;
      const byId = new Map(videos.map((video) => [String(video.id), video]));
      return candidate.every((entry) => {
        const video = byId.get(String(entry.videoId));
        return !!video && Number.isFinite(entry.startSeconds) && Number.isFinite(entry.endSeconds)
          && entry.startSeconds >= 0 && entry.endSeconds <= video.durationSeconds && entry.endSeconds >= entry.startSeconds;
      });
    }

    async function initializeProtectedState() {
      if (!canReadProtectedData() || protectedState) return;
      const token = ++generationToken;
      const raw = readProtectedData();
      if (!raw) return;
      const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
      const baseVideos = Array.isArray(raw.videos) ? raw.videos : [];
      const ids = baseVideos.map((video) => String(video && video.id || '')).filter(Boolean);
      stateApi.observeVideos(ids);
      const observedState = stateApi.load();
      const normalized = baseVideos.map((base) => Data.normalizeVideo({ ...(base || {}), ...(meta[base && base.id] || {}), id: base.id, a: base.a, b: base.b, addedAt: base.addedAt }));
      protectedState = stateApi.load();
      if (!protectedState) return;
      const markerPayload = windowRef.MangaVaultPayload && windowRef.MangaVaultPayload.normalizeVideoMarkers
        ? windowRef.MangaVaultPayload.normalizeVideoMarkers(raw.markers)
        : raw.markers;
      currentVideos = await probeAll(normalized, token);
      if (token !== generationToken || !canReadProtectedData() || !protectedState) return;
      const successfulIds = new Set(currentVideos.map((video) => String(video.id)));
      const failedDirectIds = new Set(normalized.filter((video) => Data && Data.isDirectVideoUrl(video.url) && !successfulIds.has(String(video.id))).map((video) => String(video.id)));
      if (failedDirectIds.size) protectedState = { ...protectedState, knownVideoIds: ids.filter((id) => !failedDirectIds.has(id)) };
      const markers = markerPayload && typeof markerPayload === 'object' ? markerPayload : {};
      if (queueIsUsable(protectedState.queue, currentVideos)) queue = protectedState.queue;
      else queue = Queue.generate(currentVideos, { markersByVideo: markers, generation: protectedState.generation });
      queueIndex = Math.max(0, Math.min(protectedState.currentIndex, Math.max(0, queue.length - 1)));
      currentTime = queue.length ? Math.max(queue[queueIndex].startSeconds, Math.min(protectedState.currentTime || queue[queueIndex].startSeconds, queue[queueIndex].endSeconds)) : 0;
      protectedState = { ...protectedState, queue, currentIndex: queueIndex, currentTime };
      if (!queueIsUsable(stateApi.load()?.queue, currentVideos) || failedDirectIds.size || (observedState && JSON.stringify(observedState.knownVideoIds) !== JSON.stringify(protectedState.knownVideoIds))) protectedState = stateApi.save(protectedState, { sync: !isGuest() }) || protectedState;
      renderPlayer();
    }

    function handleAccessStatus() {
      if (canReadProtectedData()) return initializeProtectedState();
      else { disposeProtectedState(); renderGate(); }
    }

    function handleStorage(event) {
      if (!canReadProtectedData() || (event && event.key !== VIDEO_KEY && event.key !== null)) return;
      disposeProtectedState(); initializeProtectedState();
    }

    function handlePageHide() { saveProgress(true); disposeProtectedState(); }
    function handlePageShow() { handleAccessStatus(); }

    function start() {
      if (started) return;
      started = true;
      documentRef.addEventListener('manga-reader-vpn-status', handleAccessStatus);
      windowRef.addEventListener('storage', handleStorage);
      windowRef.addEventListener('pagehide', handlePageHide);
      windowRef.addEventListener('pageshow', handlePageShow);
      return handleAccessStatus();
    }

    function destroy() {
      if (!started) return;
      started = false;
      documentRef.removeEventListener('manga-reader-vpn-status', handleAccessStatus);
      windowRef.removeEventListener('storage', handleStorage);
      windowRef.removeEventListener('pagehide', handlePageHide);
      windowRef.removeEventListener('pageshow', handlePageShow);
      saveProgress(true); disposeProtectedState();
    }

    return Object.freeze({ start, destroy, next: () => goTo(queueIndex + 1), previous: () => goTo(queueIndex - 1), saveProgress, openOrdinaryPlayer, getState: () => protectedState });
  }

  return Object.freeze({ MAX_PROBES, create });
}));
