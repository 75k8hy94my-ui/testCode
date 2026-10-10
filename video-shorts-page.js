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
  const MAX_PROBES = 6;
  const EARLY_SWIPE_MS = 5000;
  const HOLD_TO_PAUSE_MS = 350;
  const HOLD_TO_SCRUB_MS = 450;

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
    let metadataFailureCount = 0;
    const pendingProbeCancellations = new Set();
    let queue = [];
    let queueIndex = 0;
    let currentTime = 0;
    let activeVideo = null;
    let nextVideo = null;
    let syncTimer = null;
    let metricSyncTimer = null;
    let generationToken = 0;
    let started = false;
    let stageElement = null;
    let mediaElement = null;
    let scrubArea = null;
    let scrubTrack = null;
    let scrubThumb = null;
    let scrubPreview = null;
    let scrubPreviewFrame = null;
    let previewVideo = null;
    let scrubTimeLabel = null;
    let likeButton = null;
    let rotateButton = null;
    let actionsElement = null;
    let statusElement = null;
    let playButton = null;
    let retryButton = null;
    let skipButton = null;
    let muteButton = null;
    let volumeControl = null;
    let pressTimer = null;
    let gestureState = null;
    let scrubTargetTime = 0;
    let rotatedLandscape = false;
    let entryPlayedMs = 0;
    let playStartedAt = null;
    let earlySwipeRecorded = false;
    let startedEntryKey = '';
    let activeLoadToken = 0;
    let finishedLoadToken = 0;
    let lastProgressSaveAt = -Infinity;
    let wheelUnlockTimer = null;
    let wheelLocked = false;
    let lastTapAt = 0;
    let lastTapTarget = null;
    const now = typeof deps.now === 'function' ? deps.now : Date.now;
    const playbackNow = typeof deps.playbackNow === 'function' ? deps.playbackNow
      : (windowRef && windowRef.performance && typeof windowRef.performance.now === 'function' ? () => windowRef.performance.now() : now);
    function resolveMetricClientId() {
      const key = 'mangaReaderVideoShortsCounterClient';
      try {
        const session = windowRef && windowRef.sessionStorage;
        const existing = session && session.getItem(key);
        if (existing && /^[A-Za-z0-9_-]{1,128}$/.test(existing)) return existing;
        const generated = 'shorts-' + String(now()) + '-' + Math.random().toString(36).slice(2);
        if (session && typeof session.setItem === 'function') session.setItem(key, generated);
        return generated;
      } catch (_) { return 'shorts-' + String(now()) + '-' + Math.random().toString(36).slice(2); }
    }
    const metricClientId = resolveMetricClientId();
    const schedule = typeof deps.setTimeout === 'function' ? deps.setTimeout : ((callback, delay) => root.setTimeout(callback, delay));
    const cancel = typeof deps.clearTimeout === 'function' ? deps.clearTimeout : ((timer) => root.clearTimeout(timer));
    const progressThrottleMs = 5000;
    const audioPreferenceKey = 'mangaReaderVideoShortsAudio';
    let audioPreference = { muted: false, volume: 1 };
    let audioPreferenceLoaded = false;

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

    function renderLoading(headingText, messageText) {
      if (!page || !documentRef.createElement) return;
      const section = documentRef.createElement('section'); section.className = 'profileContent shortsLoading';
      section.setAttribute('role', 'status'); section.setAttribute('aria-live', 'polite');
      const heading = documentRef.createElement('h2'); heading.textContent = headingText;
      const message = documentRef.createElement('p'); message.className = 'profileLead'; message.textContent = messageText;
      section.append(heading, message); page.replaceChildren(section);
    }

    function renderVpnChecking() {
      renderLoading('VPN接続を確認中', '確認が終わるまで、動画データにはアクセスしません。');
    }

    function renderPreparing(completed = null, total = null) {
      const message = Number.isFinite(total) && total > 0
        ? `動画情報を確認中（${completed || 0}/${total}）`
        : '保存済みの動画情報から再生順を準備しています。';
      renderLoading('動画と再生順を準備中', message);
    }

    function removeVideo(video) {
      if (!video) return;
      try { video.pause(); } catch (_) {}
      try { video.removeAttribute('src'); video.load(); } catch (_) {}
      if (video.parentNode) video.remove();
    }

    function readMetaMap() {
      try { const value = JSON.parse(storage.getItem(META_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; }
      catch (_) { return {}; }
    }

    function scheduleMetricSync() {
      if (isGuest()) return;
      const vault = windowRef.MangaVault;
      if (!vault || typeof vault.saveLocalChanges !== 'function') return;
      cancel(metricSyncTimer);
      metricSyncTimer = schedule(async () => {
        metricSyncTimer = null;
        if (!canReadProtectedData() || isGuest()) return;
        try { if (typeof vault.loadActive !== 'function' || vault.loadActive()) await vault.saveLocalChanges(); } catch (_) {}
      }, 500);
    }

    function updateShortsMeta(videoId, update) {
      if (!canReadProtectedData() || !storage || typeof storage.setItem !== 'function') return null;
      const meta = readMetaMap();
      const current = meta[String(videoId)] && typeof meta[String(videoId)] === 'object' ? meta[String(videoId)] : {};
      const normalized = Data.normalizeVideo({ ...current, id: videoId });
      const nextShorts = { ...normalized.shorts, ...update(normalized.shorts), updatedAt: now() };
      const incoming = { ...meta, [String(videoId)]: { ...current, shorts: nextShorts, updatedAt: now() } };
      const merged = Data.mergeVideoMetaPreservingThumbnailTime(meta, incoming);
      try { storage.setItem(META_KEY, JSON.stringify(merged)); } catch (_) { return null; }
      if (!isGuest()) {
        const vault = windowRef.MangaVault;
        if (vault && typeof vault.markLocalChangesPending === 'function') {
          try { if (vault.markLocalChangesPending()) scheduleMetricSync(); } catch (_) {}
        }
      }
      return merged[String(videoId)] && merged[String(videoId)].shorts || nextShorts;
    }

    function recordShortsPlay(videoId) {
      return updateShortsMeta(videoId, (shorts) => {
        const counters = { ...(shorts.playCountByClient || {}) };
        counters[metricClientId] = (counters[metricClientId] || 0) + 1;
        return { playCount: shorts.playCount + 1, playCountByClient: counters };
      });
    }

    function recordEarlySwipe(videoId) {
      if (earlySwipeRecorded) return null;
      earlySwipeRecorded = true;
      return updateShortsMeta(videoId, (shorts) => {
        const counters = { ...(shorts.earlySwipeCountByClient || {}) };
        counters[metricClientId] = (counters[metricClientId] || 0) + 1;
        return { earlySwipeCount: shorts.earlySwipeCount + 1, earlySwipeCountByClient: counters };
      });
    }

    function currentPlayedMilliseconds() {
      return entryPlayedMs + (playStartedAt == null ? 0 : Math.max(0, playbackNow() - playStartedAt));
    }

    function pausePlaybackClock() {
      if (playStartedAt != null) entryPlayedMs += Math.max(0, playbackNow() - playStartedAt);
      playStartedAt = null;
    }

    function resumePlaybackClock() {
      if (playStartedAt == null && activeVideo && !activeVideo.paused) playStartedAt = playbackNow();
    }

    function formatTime(value) {
      const total = Math.max(0, Math.floor(Number(value) || 0));
      return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    }

    function updateScrubThumb() {
      const entry = queue[queueIndex];
      if (!scrubThumb || !activeVideo || !entry || entry.endSeconds <= entry.startSeconds) return;
      const ratio = Math.max(0, Math.min(1, (activeVideo.currentTime - entry.startSeconds) / (entry.endSeconds - entry.startSeconds)));
      scrubThumb.style.left = (ratio * 100) + '%';
    }

    function setMediaStatus(message = '', kind = '') {
      if (!statusElement) return;
      statusElement.textContent = message;
      statusElement.dataset.state = kind;
      statusElement.hidden = !message;
    }

    function applyAudioPreference(video) {
      if (!video) return;
      video.muted = audioPreference.muted;
      try { video.volume = audioPreference.volume; } catch (_) {}
      if (muteButton) {
        muteButton.setAttribute('aria-pressed', String(audioPreference.muted));
        muteButton.setAttribute('aria-label', audioPreference.muted ? 'ミュート解除' : 'ミュート');
        muteButton.innerHTML = audioPreference.muted
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4zm12-1 5 6m0-6-5 6"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4zm12-1a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12"/></svg>';
      }
      if (volumeControl && documentRef.activeElement !== volumeControl) volumeControl.value = String(audioPreference.volume);
    }

    function persistAudioPreference() {
      try { storage.setItem(audioPreferenceKey, JSON.stringify(audioPreference)); } catch (_) {}
    }

    function loadAudioPreference() {
      if (audioPreferenceLoaded) return;
      audioPreferenceLoaded = true;
      try {
        const savedAudio = JSON.parse(storage.getItem(audioPreferenceKey) || 'null');
        if (savedAudio && typeof savedAudio === 'object') audioPreference = {
          muted: savedAudio.muted === true,
          volume: Number.isFinite(Number(savedAudio.volume)) ? Math.max(0, Math.min(1, Number(savedAudio.volume))) : 1,
        };
      } catch (_) {}
    }

    function toggleMute() {
      audioPreference = { ...audioPreference, muted: !audioPreference.muted };
      applyAudioPreference(activeVideo); persistAudioPreference();
    }

    function setVolume(value) {
      const volume = Math.max(0, Math.min(1, Number(value) || 0));
      audioPreference = { volume, muted: volume === 0 ? true : audioPreference.muted };
      if (volume > 0 && activeVideo) audioPreference.muted = false;
      applyAudioPreference(activeVideo); persistAudioPreference();
    }

    function currentLoad(video, entry, token) {
      return !!video && video === activeVideo && queue[queueIndex] === entry
        && Number(video.dataset.loadToken) === token && token === activeLoadToken && canReadProtectedData();
    }

    function mediaErrorMessage(video) {
      const code = video && video.error && Number(video.error.code);
      if (code === 2) return '動画の通信に失敗しました。接続を確認して再試行してください。';
      if (code === 3) return '動画データをデコードできませんでした。再試行するか次の動画へ進んでください。';
      if (code === 4) return 'この動画形式を再生できません。次の動画へ進めます。';
      return '動画を読み込めませんでした。再試行するか次の動画へ進んでください。';
    }

    function showPlaybackError(video, entry, token) {
      if (!currentLoad(video, entry, token)) return;
      setMediaStatus(mediaErrorMessage(video), 'error');
      if (playButton) playButton.hidden = true;
      if (retryButton) retryButton.hidden = false;
      if (skipButton) skipButton.hidden = queueIndex >= queue.length - 1;
    }

    function markEntryStarted(video, entry, token) {
      if (!currentLoad(video, entry, token)) return;
      const key = token + ':' + entry.generation + ':' + entry.videoId;
      if (startedEntryKey === key) return;
      startedEntryKey = key;
      recordShortsPlay(entry.videoId);
    }

    function attemptPlayback(video, entry, token, userInitiated = false) {
      if (!currentLoad(video, entry, token)) return;
      if (playButton) playButton.hidden = true;
      if (retryButton) retryButton.hidden = true;
      if (skipButton) skipButton.hidden = true;
      let result;
      try { result = video.play(); }
      catch (error) { handlePlayFailure(error, video, entry, token); return; }
      if (result && typeof result.then === 'function') result.then(() => {
        if (!currentLoad(video, entry, token)) return;
        markEntryStarted(video, entry, token);
        if (!video.paused) resumePlaybackClock();
        if (playButton) playButton.hidden = true;
        setMediaStatus('', '');
      }).catch((error) => handlePlayFailure(error, video, entry, token));
      else {
        markEntryStarted(video, entry, token);
        if (!video.paused) resumePlaybackClock();
        setMediaStatus('', '');
      }
      if (userInitiated && video.paused) setMediaStatus('再生を開始できませんでした。もう一度お試しください。', 'error');
    }

    function handlePlayFailure(error, video, entry, token) {
      if (!currentLoad(video, entry, token)) return;
      pausePlaybackClock();
      if (error && error.name === 'NotAllowedError') {
        setMediaStatus('', 'autoplay');
        if (playButton) playButton.hidden = false;
        if (retryButton) retryButton.hidden = true;
        if (skipButton) skipButton.hidden = true;
        return;
      }
      showPlaybackError(video, entry, token);
    }

    function finishActiveEntry(video, entry, token) {
      if (!currentLoad(video, entry, token) || finishedLoadToken === token) return;
      if (Number(video.currentTime) < entry.endSeconds - 0.12) return;
      finishedLoadToken = token;
      try { video.currentTime = entry.endSeconds; } catch (_) {}
      pausePlaybackClock();
      try { video.pause(); } catch (_) {}
      currentTime = entry.endSeconds;
      saveProgress(true);
      resetLandscapeRotation();
      if (queueIndex < queue.length - 1) goTo(queueIndex + 1, 'ended');
    }

    function performProgressSave() {
      if (!protectedState || !canReadProtectedData() || !stateApi || typeof stateApi.save !== 'function') return null;
      currentTime = activeVideo && Number.isFinite(activeVideo.currentTime) ? activeVideo.currentTime : currentTime;
      const next = { ...protectedState, queue, currentIndex: queueIndex, currentTime, updatedAt: now() };
      protectedState = stateApi.save(next, { sync: !isGuest() }) || protectedState;
      lastProgressSaveAt = playbackNow();
      return protectedState;
    }

    function clearPressTimer() { if (pressTimer != null) cancel(pressTimer); pressTimer = null; }

    function cleanupScrubPreview() {
      if (previewVideo) removeVideo(previewVideo);
      previewVideo = null;
      if (scrubPreview) scrubPreview.hidden = true;
      if (scrubArea) scrubArea.classList.remove('is-scrubbing');
      if (gestureState) gestureState.scrubbing = false;
    }

    function disposeGestures() {
      clearPressTimer();
      cleanupScrubPreview(); gestureState = null;
    }

    function disposeProtectedState() {
      generationToken += 1;
      pendingProbeCancellations.forEach((cancelProbe) => { try { cancelProbe(); } catch (_) {} });
      pendingProbeCancellations.clear();
      cancel(syncTimer); syncTimer = null;
      cancel(metricSyncTimer); metricSyncTimer = null;
      if (wheelUnlockTimer != null) cancel(wheelUnlockTimer); wheelUnlockTimer = null; wheelLocked = false;
      disposeGestures();
      removeVideo(activeVideo); removeVideo(nextVideo); activeVideo = null; nextVideo = null;
      protectedState = null; currentVideos = []; metadataFailureCount = 0; queue = []; queueIndex = 0; currentTime = 0;
      if (page) page.replaceChildren();
    }

    function saveProgress(immediate = false) {
      if (!protectedState || !canReadProtectedData() || !stateApi || typeof stateApi.save !== 'function') return null;
      if (immediate) { cancel(syncTimer); syncTimer = null; return performProgressSave(); }
      const elapsed = playbackNow() - lastProgressSaveAt;
      if (elapsed >= progressThrottleMs) return performProgressSave();
      if (syncTimer == null) syncTimer = schedule(() => {
        syncTimer = null;
        if (canReadProtectedData()) performProgressSave();
      }, Math.max(0, progressThrottleMs - elapsed));
      return protectedState;
    }

    function isGuest() { try { return !!windowRef.TestCodeGuest && windowRef.TestCodeGuest.isActive() === true; } catch (_) { return false; } }

    function findVideo(videoId) { return currentVideos.find((video) => String(video.id) === String(videoId)); }

    function createVideo(entry, hidden = false, entryIndex = queueIndex) {
      const videoData = findVideo(entry.videoId);
      if (!videoData) return null;
      const video = documentRef.createElement('video');
      video.className = hidden ? 'shortsPreload' : 'shortsVideo';
      video.preload = hidden ? 'auto' : 'metadata'; video.playsInline = true; video.controls = false; video.src = videoData.url;
      video.dataset.entryIndex = String(entryIndex);
      video.hidden = hidden;
      video._shortsEntry = entry;
      video.addEventListener('loadedmetadata', () => {
        const nextIndex = Number(video.dataset.entryIndex);
        if (video === nextVideo && queue[nextIndex] === entry) {
          try { video.currentTime = entry.startSeconds; } catch (_) {}
          return;
        }
        const token = Number(video.dataset.loadToken);
        if (!currentLoad(video, entry, token)) return;
        const requested = Number(video.dataset.requestedTime);
        if (Number.isFinite(requested)) { try { video.currentTime = requested; } catch (_) {} }
      });
      video.addEventListener('timeupdate', () => {
        const token = Number(video.dataset.loadToken);
        if (!currentLoad(video, entry, token)) return;
        updateScrubThumb(); saveProgress(false); finishActiveEntry(video, entry, token);
      });
      video.addEventListener('playing', () => {
        const token = Number(video.dataset.loadToken);
        if (!currentLoad(video, entry, token)) return;
        markEntryStarted(video, entry, token); resumePlaybackClock();
        if (playButton) playButton.hidden = true;
        setMediaStatus('', '');
      });
      video.addEventListener('pause', () => {
        const token = Number(video.dataset.loadToken);
        if (currentLoad(video, entry, token)) { pausePlaybackClock(); saveProgress(true); }
      });
      video.addEventListener('ended', () => finishActiveEntry(video, entry, Number(video.dataset.loadToken)));
      video.addEventListener('waiting', () => { if (currentLoad(video, entry, Number(video.dataset.loadToken))) { pausePlaybackClock(); setMediaStatus('読み込み中…', 'loading'); } });
      video.addEventListener('stalled', () => { if (currentLoad(video, entry, Number(video.dataset.loadToken))) { pausePlaybackClock(); setMediaStatus('動画データを待っています…', 'loading'); } });
      video.addEventListener('canplay', () => { if (currentLoad(video, entry, Number(video.dataset.loadToken)) && statusElement?.dataset.state === 'loading') setMediaStatus('', ''); });
      video.addEventListener('error', () => showPlaybackError(video, entry, Number(video.dataset.loadToken)));
      return video;
    }

    function releaseNext() { removeVideo(nextVideo); nextVideo = null; }

    function loadWindow(startTime) {
      if (!protectedState || !queue.length || !canReadProtectedData()) return;
      const entry = queue[queueIndex];
      if (!entry) return;
      const loadToken = ++activeLoadToken;
      finishedLoadToken = 0;
      let video = nextVideo && Number(nextVideo.dataset.entryIndex) === queueIndex ? nextVideo : null;
      if (video) { nextVideo = null; video.hidden = false; video.className = 'shortsVideo'; }
      else video = createVideo(entry, false, queueIndex);
      if (activeVideo && activeVideo !== video) removeVideo(activeVideo);
      activeVideo = video;
      if (!activeVideo) return;
      activeVideo.hidden = false; activeVideo.className = 'shortsVideo';
      activeVideo.dataset.entryIndex = String(queueIndex);
      activeVideo.dataset.loadToken = String(loadToken);
      applyAudioPreference(activeVideo);
      const start = Number.isFinite(startTime) ? startTime : (queueIndex === protectedState.currentIndex ? protectedState.currentTime : entry.startSeconds);
      const clamped = Math.max(entry.startSeconds, Math.min(start || entry.startSeconds, entry.endSeconds));
      activeVideo.dataset.requestedTime = String(clamped);
      entryPlayedMs = 0; playStartedAt = null; earlySwipeRecorded = false;
      if (Math.abs(activeVideo.currentTime - clamped) > 0.25 && activeVideo.readyState >= 1) {
        try { activeVideo.currentTime = clamped; } catch (_) {}
      }
      updateEntryUI(); updateScrubThumb();
      page.querySelector('.shortsMedia')?.append(activeVideo);
      setMediaStatus('読み込み中…', 'loading');
      const nextEntry = queue[queueIndex + 1];
      releaseNext();
      if (nextEntry) { nextVideo = createVideo(nextEntry, true, queueIndex + 1); applyAudioPreference(nextVideo); page.querySelector('.shortsMedia')?.append(nextVideo); }
      attemptPlayback(activeVideo, entry, loadToken);
    }

    function goTo(nextIndex, reason = 'navigation') {
      if (!canReadProtectedData() || !protectedState || !queue.length) return false;
      const target = Math.max(0, Math.min(queue.length - 1, Number(nextIndex) || 0));
      if (target === queueIndex) return false;
      if (reason === 'vertical-swipe' && queue[queueIndex] && currentPlayedMilliseconds() < EARLY_SWIPE_MS) recordEarlySwipe(queue[queueIndex].videoId);
      pausePlaybackClock();
      saveProgress(true);
      resetLandscapeRotation();
      queueIndex = target; currentTime = queue[target].startSeconds;
      startedEntryKey = '';
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

    function isMobileLayout() {
      try { return typeof windowRef.matchMedia === 'function' ? windowRef.matchMedia('(max-width: 899px)').matches : Number(windowRef.innerWidth) <= 899; }
      catch (_) { return false; }
    }

    function resetLandscapeRotation() {
      rotatedLandscape = false;
      if (stageElement) stageElement.classList.remove('is-rotated');
      const appRoot = documentRef.getElementById('shortsApp');
      if (appRoot) appRoot.classList.remove('is-shorts-rotated');
      if (rotateButton) rotateButton.setAttribute('aria-pressed', 'false');
    }

    function toggleLandscapeRotation() {
      if (!isMobileLayout() || !queue[queueIndex]) return;
      const video = findVideo(queue[queueIndex].videoId);
      if (!video || Number(video.videoWidth) <= Number(video.videoHeight)) return;
      rotatedLandscape = !rotatedLandscape;
      if (stageElement) stageElement.classList.toggle('is-rotated', rotatedLandscape);
      const appRoot = documentRef.getElementById('shortsApp');
      if (appRoot) appRoot.classList.toggle('is-shorts-rotated', rotatedLandscape);
      if (rotateButton) rotateButton.setAttribute('aria-pressed', String(rotatedLandscape));
    }

    function updateEntryUI() {
      const entry = queue[queueIndex];
      const video = entry && findVideo(entry.videoId);
      if (!video) { if (actionsElement) actionsElement.hidden = true; if (scrubArea) scrubArea.hidden = true; return; }
      if (actionsElement) actionsElement.hidden = false;
      if (scrubArea) scrubArea.hidden = false;
      const landscape = Number(video.videoWidth) > Number(video.videoHeight);
      if (!landscape) resetLandscapeRotation();
      if (stageElement) stageElement.classList.toggle('is-landscape', landscape);
      if (rotateButton) rotateButton.hidden = !landscape || !isMobileLayout();
      if (likeButton) {
        likeButton.setAttribute('aria-pressed', String(video.shorts && video.shorts.liked === true));
        likeButton.dataset.liked = String(video.shorts && video.shorts.liked === true);
      }
    }

    function toggleLike() {
      if (!canReadProtectedData() || !queue[queueIndex]) return;
      const video = findVideo(queue[queueIndex].videoId);
      if (!video) return;
      const liked = !(video.shorts && video.shorts.liked === true);
      const next = updateShortsMeta(video.id, () => ({ liked }));
      if (!next) return;
      video.shorts = next; updateEntryUI();
    }

    function updateScrubAt(clientX) {
      if (!gestureState || !gestureState.scrubbing || !scrubArea || !activeVideo || !queue[queueIndex]) return;
      const rect = scrubArea.getBoundingClientRect();
      const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
      const entry = queue[queueIndex];
      scrubTargetTime = entry.startSeconds + (entry.endSeconds - entry.startSeconds) * ratio;
      if (scrubThumb) scrubThumb.style.left = (ratio * 100) + '%';
      if (scrubPreview) {
        scrubPreview.style.left = (ratio * 100) + '%';
        scrubPreview.dataset.edge = ratio < 0.12 ? 'start' : (ratio > 0.88 ? 'end' : 'center');
      }
      if (scrubTimeLabel) scrubTimeLabel.textContent = formatTime(scrubTargetTime - entry.startSeconds) + ' / ' + formatTime(entry.endSeconds - entry.startSeconds);
      if (previewVideo && previewVideo.readyState >= 1) { try { previewVideo.currentTime = scrubTargetTime; previewVideo.pause(); } catch (_) {} }
    }

    function beginScrub() {
      if (!gestureState || !gestureState.onScrub || !activeVideo || !queue[queueIndex] || !canReadProtectedData()) return;
      gestureState.scrubbing = true;
      gestureState.heldWasPlaying = !activeVideo.paused;
      if (gestureState.heldWasPlaying) activeVideo.pause();
      scrubTargetTime = Number(activeVideo.currentTime) || queue[queueIndex].startSeconds;
      if (scrubArea) scrubArea.classList.add('is-scrubbing');
      if (scrubPreview) scrubPreview.hidden = false;
      if (!previewVideo) {
        previewVideo = documentRef.createElement('video'); previewVideo.className = 'shortsScrubPreviewVideo';
        previewVideo.preload = 'metadata'; previewVideo.muted = true; previewVideo.playsInline = true; previewVideo.controls = false;
        const source = activeVideo.currentSrc || activeVideo.src;
        previewVideo.src = source;
        const width = Number(activeVideo.videoWidth) || 9, height = Number(activeVideo.videoHeight) || 16;
        if (scrubPreview) scrubPreview.style.setProperty('--preview-ratio', width + ' / ' + height);
        previewVideo.addEventListener('loadedmetadata', () => { if (gestureState && gestureState.scrubbing) updateScrubAt(gestureState.lastX); });
        scrubPreviewFrame?.append(previewVideo);
        if (typeof previewVideo.load === 'function') previewVideo.load();
      }
      updateScrubAt(gestureState.lastX);
    }

    function endScrub(commit = true) {
      if (!gestureState || !gestureState.scrubbing) { cleanupScrubPreview(); return; }
      const resume = gestureState.heldWasPlaying;
      if (commit && activeVideo && canReadProtectedData()) { activeVideo.currentTime = scrubTargetTime; currentTime = scrubTargetTime; saveProgress(true); }
      cleanupScrubPreview();
      if (resume && activeVideo && canReadProtectedData()) resumeActivePlayback();
    }

    function resumeActivePlayback() {
      const entry = queue[queueIndex];
      if (entry && activeVideo && canReadProtectedData()) attemptPlayback(activeVideo, entry, activeLoadToken, true);
    }

    function handlePointerDown(event) {
      if (!canReadProtectedData() || !activeVideo || (event.button != null && event.button !== 0)) return;
      const target = event.target;
      if (target.closest?.('.shortsActions') || target.closest?.('.shortsBack') || target.closest?.('button') || target.closest?.('a')) return;
      const onScrub = target === scrubArea || target.closest?.('.shortsScrubArea') === scrubArea;
      const onVideo = target === activeVideo || target.closest?.('.shortsVideo') === activeVideo;
      if (!onScrub && !onVideo) return;
      if (event.pointerId != null && stageElement && typeof stageElement.setPointerCapture === 'function') {
        try { stageElement.setPointerCapture(event.pointerId); } catch (_) {}
      }
      clearPressTimer();
      gestureState = { startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, leftEdge: event.clientX <= 28, onScrub, onVideo, heldWasPlaying: false, scrubbing: false, longPressFired: false };
      pressTimer = schedule(() => { pressTimer = null; if (!gestureState || gestureState.moved) return; gestureState.longPressFired = true; if (gestureState.onScrub) beginScrub(); else if (gestureState.onVideo && !activeVideo.paused) { gestureState.heldWasPlaying = true; pausePlaybackClock(); activeVideo.pause(); } }, onScrub ? HOLD_TO_SCRUB_MS : HOLD_TO_PAUSE_MS);
    }

    function handlePointerMove(event) {
      if (!gestureState) return;
      gestureState.lastX = event.clientX; gestureState.lastY = event.clientY;
      if (gestureState.scrubbing) { updateScrubAt(event.clientX); return; }
      const dx = event.clientX - gestureState.startX, dy = event.clientY - gestureState.startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { gestureState.moved = true; clearPressTimer(); }
    }

    function handlePointerUp(event) {
      if (!gestureState) return;
      clearPressTimer(); gestureState.lastX = event.clientX; gestureState.lastY = event.clientY;
      if (gestureState.scrubbing) { updateScrubAt(event.clientX); endScrub(true); gestureState = null; return; }
      if (gestureState.heldWasPlaying) {
        if (activeVideo && canReadProtectedData()) resumeActivePlayback();
        gestureState = null; return;
      }
      if (gestureState.longPressFired) { gestureState = null; return; }
      const dx = event.clientX - gestureState.startX, dy = event.clientY - gestureState.startY;
      const state = gestureState; gestureState = null;
      if (state.leftEdge && dx > 64 && Math.abs(dx) > Math.abs(dy) * 1.2 && isMobileLayout()) {
        if (windowRef.history && typeof windowRef.history.back === 'function') windowRef.history.back(); else windowRef.location.href = 'video.html';
        return;
      }
      if (Math.abs(dy) > 52 && Math.abs(dy) > Math.abs(dx) * 1.15) { goTo(queueIndex + (dy > 0 ? -1 : 1), 'vertical-swipe'); return; }
      if (state.moved || state.onScrub || !state.onVideo) return;
      const time = now();
      if (lastTapTarget === activeVideo && time - lastTapAt < 350) { lastTapAt = 0; lastTapTarget = null; openOrdinaryPlayer(); }
      else { lastTapAt = time; lastTapTarget = activeVideo; }
    }

    function handlePointerCancel() {
      clearPressTimer();
      if (gestureState && gestureState.scrubbing) endScrub(false);
      else if (gestureState && gestureState.heldWasPlaying && activeVideo && canReadProtectedData()) resumeActivePlayback();
      gestureState = null;
    }

    function renderPlayer() {
      if (!page || !documentRef.createElement) return;
      loadAudioPreference();
      page.replaceChildren();
      const stage = documentRef.createElement('section'); stage.className = 'shortsStage';
      const back = documentRef.createElement('a'); back.className = 'shortsBack'; back.href = 'video.html'; back.setAttribute('aria-label', '動画一覧へ戻る'); back.textContent = '←';
      const media = documentRef.createElement('div'); media.className = 'shortsMedia'; media.tabIndex = 0; media.setAttribute('aria-label', '縦スワイプ動画');
      const actions = documentRef.createElement('div'); actions.className = 'shortsActions'; actionsElement = actions;
      likeButton = documentRef.createElement('button'); likeButton.type = 'button'; likeButton.className = 'shortsLike'; likeButton.setAttribute('aria-label', 'いいね');
      likeButton.innerHTML = '<img src="assets/shorts-heart.png" alt="" aria-hidden="true">';
      likeButton.addEventListener('click', () => toggleLike());
      rotateButton = documentRef.createElement('button'); rotateButton.type = 'button'; rotateButton.className = 'shortsRotate'; rotateButton.setAttribute('aria-label', '横向きに回転'); rotateButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h9a4 4 0 0 1 4 4v2m-3-3 3 3 3-3M17 17H8a4 4 0 0 1-4-4v-2m3 3-3-3-3 3"/></svg>';
      rotateButton.addEventListener('click', () => toggleLandscapeRotation());
      muteButton = documentRef.createElement('button'); muteButton.type = 'button'; muteButton.className = 'shortsMute'; muteButton.setAttribute('aria-label', 'ミュート'); muteButton.addEventListener('click', () => toggleMute());
      volumeControl = documentRef.createElement('input'); volumeControl.type = 'range'; volumeControl.className = 'shortsVolume'; volumeControl.min = '0'; volumeControl.max = '1'; volumeControl.step = '0.05'; volumeControl.setAttribute('aria-label', '音量'); volumeControl.addEventListener('input', () => setVolume(volumeControl.value));
      actions.append(likeButton, rotateButton, muteButton, volumeControl);
      scrubArea = documentRef.createElement('div'); scrubArea.className = 'shortsScrubArea'; scrubArea.setAttribute('aria-label', '長押しして動画をシーク');
      scrubTrack = documentRef.createElement('div'); scrubTrack.className = 'shortsScrubTrack';
      scrubThumb = documentRef.createElement('span'); scrubThumb.className = 'shortsScrubThumb';
      scrubPreview = documentRef.createElement('div'); scrubPreview.className = 'shortsScrubPreview'; scrubPreview.hidden = true;
      scrubPreviewFrame = documentRef.createElement('div'); scrubPreviewFrame.className = 'shortsScrubPreviewFrame';
      scrubTimeLabel = documentRef.createElement('span'); scrubTimeLabel.className = 'shortsScrubTime';
      scrubPreview.append(scrubPreviewFrame, scrubTimeLabel); scrubArea.append(scrubTrack, scrubThumb, scrubPreview);
      const empty = documentRef.createElement('p'); empty.className = 'shortsEmpty';
      empty.textContent = metadataFailureCount ? '動画情報を読み込めませんでした。接続を確認して再試行してください。' : (currentVideos.length ? '再生できる動画を準備できませんでした。' : '対象の動画がありません。');
      const metadataRetry = documentRef.createElement('button'); metadataRetry.type = 'button'; metadataRetry.className = 'glassBtn shortsMetadataRetry'; metadataRetry.textContent = '再試行'; metadataRetry.hidden = !metadataFailureCount;
      metadataRetry.addEventListener('click', () => { if (!canReadProtectedData()) return; disposeProtectedState(); initializeProtectedState(); });
      const emptyState = documentRef.createElement('div'); emptyState.className = 'shortsEmptyState'; emptyState.append(empty, metadataRetry);
      statusElement = documentRef.createElement('div'); statusElement.className = 'shortsMediaStatus'; statusElement.hidden = true; statusElement.setAttribute('role', 'status'); statusElement.setAttribute('aria-live', 'polite');
      playButton = documentRef.createElement('button'); playButton.type = 'button'; playButton.className = 'shortsPlayButton'; playButton.textContent = '再生'; playButton.hidden = true; playButton.setAttribute('aria-label', '動画を再生');
      playButton.addEventListener('click', () => { const entry = queue[queueIndex]; if (entry && activeVideo) attemptPlayback(activeVideo, entry, activeLoadToken, true); });
      const errorActions = documentRef.createElement('div'); errorActions.className = 'shortsErrorActions';
      retryButton = documentRef.createElement('button'); retryButton.type = 'button'; retryButton.className = 'glassBtn shortsRetry'; retryButton.textContent = '再試行'; retryButton.hidden = true;
      retryButton.addEventListener('click', () => { const entry = queue[queueIndex]; if (!entry || !activeVideo) return; setMediaStatus('再読み込み中…', 'loading'); activeVideo.load(); attemptPlayback(activeVideo, entry, activeLoadToken, true); });
      skipButton = documentRef.createElement('button'); skipButton.type = 'button'; skipButton.className = 'glassBtn shortsSkip'; skipButton.textContent = '次の動画'; skipButton.hidden = true;
      skipButton.addEventListener('click', () => goTo(queueIndex + 1, 'error-skip'));
      errorActions.append(retryButton, skipButton);
      const keyboardHelp = documentRef.createElement('span'); keyboardHelp.className = 'shortsVisuallyHidden'; keyboardHelp.textContent = 'キーボード操作: 上下矢印で動画を移動、スペースで再生と一時停止';
      keyboardHelp.hidden = !queue.length;
      stageElement = stage; mediaElement = media;
      media.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Space'); media.setAttribute('aria-describedby', 'shortsKeyboardHelp'); keyboardHelp.id = 'shortsKeyboardHelp';
      stage.append(back, media, actions, scrubArea, statusElement, playButton, errorActions, keyboardHelp); page.append(stage);
      applyAudioPreference(null);
      if (!queue.length) { actions.hidden = true; scrubArea.hidden = true; media.append(emptyState); }
      else loadWindow(protectedState.currentTime);
      const onWheel = (event) => {
        if (Math.abs(event.deltaY) <= 20) return;
        if (!wheelLocked) { wheelLocked = true; goTo(queueIndex + (event.deltaY > 0 ? 1 : -1), 'wheel'); }
        if (wheelUnlockTimer != null) cancel(wheelUnlockTimer);
        wheelUnlockTimer = schedule(() => { wheelUnlockTimer = null; wheelLocked = false; }, 240);
      };
      media.addEventListener('wheel', onWheel, { passive: true });
      media.addEventListener('keydown', (event) => {
        const target = event.target;
        const tag = String(target && target.tagName || '').toLowerCase();
        if (target && (target.isContentEditable || ['input', 'textarea', 'select', 'button', 'a'].includes(tag))) return;
        if (event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault?.(); goTo(queueIndex + 1, 'keyboard'); }
        else if (event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault?.(); goTo(queueIndex - 1, 'keyboard'); }
        else if (event.code === 'Space' || event.key === ' ') {
          event.preventDefault?.();
          if (activeVideo && !activeVideo.paused) { pausePlaybackClock(); activeVideo.pause(); saveProgress(true); }
          else if (activeVideo && queue[queueIndex]) attemptPlayback(activeVideo, queue[queueIndex], activeLoadToken, true);
        }
      });
      stage.addEventListener('pointerdown', handlePointerDown);
      stage.addEventListener('pointermove', handlePointerMove);
      stage.addEventListener('pointerup', handlePointerUp);
      stage.addEventListener('pointercancel', handlePointerCancel);
      stage.addEventListener('contextmenu', (event) => event.preventDefault());
    }

    async function probeMetadata(video) {
      if (deps.probeMetadata) return deps.probeMetadata(video);
      const element = documentRef.createElement('video'); element.preload = 'metadata'; element.muted = true;
      const result = await new Promise((resolve) => {
        let settled = false;
        let cancelProbe = null;
        const cleanup = () => { try { element.removeAttribute('src'); element.load(); } catch (_) {} if (element.parentNode) element.remove(); };
        const done = (value) => { if (settled) return; settled = true; clearTimeout(timer); if (cancelProbe) pendingProbeCancellations.delete(cancelProbe); cleanup(); resolve(value); };
        const timer = setTimeout(() => done(null), 10000);
        cancelProbe = () => done(null);
        pendingProbeCancellations.add(cancelProbe);
        element.addEventListener('loadedmetadata', () => done({ videoWidth: element.videoWidth, videoHeight: element.videoHeight, durationSeconds: element.duration }));
        element.addEventListener('error', () => done(null));
        element.src = video.url;
        if (typeof element.load === 'function') element.load();
      });
      return result;
    }

    function hasCachedMediaInfo(video) {
      return !!Data && typeof Data.stableUrlToken === 'function'
        && video.shortsMediaInfoUrlKey === Data.stableUrlToken(video.url)
        && Number(video.durationSeconds) > 0 && Number(video.videoWidth) > 0 && Number(video.videoHeight) > 0;
    }

    function persistMediaInfoCache(videos) {
      if (!canReadProtectedData() || !storage || typeof storage.setItem !== 'function') return;
      const previous = readMetaMap();
      const next = { ...previous };
      let changed = false;
      videos.forEach((video) => {
        if (!hasCachedMediaInfo(video)) return;
        const id = String(video.id);
        const current = previous[id] && typeof previous[id] === 'object' ? previous[id] : {};
        if (current.shortsMediaInfoUrlKey === video.shortsMediaInfoUrlKey
          && Number(current.durationSeconds) === Number(video.durationSeconds)
          && Number(current.videoWidth) === Number(video.videoWidth)
          && Number(current.videoHeight) === Number(video.videoHeight)) return;
        next[id] = {
          ...current,
          durationSeconds: Number(video.durationSeconds),
          videoWidth: Number(video.videoWidth),
          videoHeight: Number(video.videoHeight),
          shortsMediaInfoUrlKey: video.shortsMediaInfoUrlKey,
        };
        changed = true;
      });
      if (!changed) return;
      const merged = Data.mergeVideoMetaPreservingThumbnailTime(previous, next);
      try { storage.setItem(META_KEY, JSON.stringify(merged)); } catch (_) { return; }
      if (!isGuest()) {
        const vault = windowRef.MangaVault;
        if (vault && typeof vault.markLocalChangesPending === 'function') {
          try { if (vault.markLocalChangesPending()) scheduleMetricSync(); } catch (_) {}
        }
      }
    }

    async function probeAll(videos, token, onProgress = () => {}) {
      const direct = videos.filter((video) => Data && Data.isDirectVideoUrl(video.url));
      const results = new Array(direct.length); const pending = []; let completed = 0; let nextIndex = 0;
      direct.forEach((video, index) => {
        if (hasCachedMediaInfo(video)) results[index] = video;
        else pending.push(index);
      });
      completed = direct.length - pending.length;
      onProgress(completed, direct.length);
      const workers = Array.from({ length: Math.min(MAX_PROBES, pending.length) }, async () => {
        while (nextIndex < pending.length) {
          const index = pending[nextIndex++];
          try {
            const metadata = await probe(direct[index]);
            results[index] = metadata && typeof Data.stableUrlToken === 'function'
              ? { ...direct[index], ...metadata, shortsMediaInfoUrlKey: Data.stableUrlToken(direct[index].url) }
              : (metadata ? { ...direct[index], ...metadata } : null);
          } catch (_) { results[index] = null; }
          completed += 1;
          onProgress(completed, direct.length);
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
      if (!Array.isArray(candidate)) return false;
      const byId = new Map(videos.map((video) => [String(video.id), video]));
      if (!candidate.length && videos.length) return false;
      return candidate.every((entry) => {
        const video = byId.get(String(entry.videoId));
        return !!video && Number.isFinite(entry.startSeconds) && Number.isFinite(entry.endSeconds)
          && entry.startSeconds >= 0 && entry.endSeconds <= video.durationSeconds && entry.endSeconds >= entry.startSeconds;
      });
    }

    async function initializeProtectedState() {
      if (!canReadProtectedData() || protectedState) return;
      renderPreparing();
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
      currentVideos = await probeAll(normalized, token, renderPreparing);
      if (token !== generationToken || !canReadProtectedData() || !protectedState) return;
      metadataFailureCount = normalized.filter((video) => Data && Data.isDirectVideoUrl(video.url)).length - currentVideos.length;
      persistMediaInfoCache(currentVideos);
      const markers = markerPayload && typeof markerPayload === 'object' ? markerPayload : {};
      const savedQueueIsUsable = queueIsUsable(protectedState.queue, currentVideos);
      if (savedQueueIsUsable) queue = protectedState.queue;
      else {
        queue = Queue.generate(currentVideos, { markersByVideo: markers, generation: protectedState.generation });
        protectedState = { ...protectedState, currentIndex: 0, currentTime: 0 };
      }
      queueIndex = Math.max(0, Math.min(protectedState.currentIndex, Math.max(0, queue.length - 1)));
      currentTime = queue.length ? Math.max(queue[queueIndex].startSeconds, Math.min(protectedState.currentTime || queue[queueIndex].startSeconds, queue[queueIndex].endSeconds)) : 0;
      protectedState = { ...protectedState, queue, currentIndex: queueIndex, currentTime };
      if (!savedQueueIsUsable || (observedState && JSON.stringify(observedState.knownVideoIds) !== JSON.stringify(protectedState.knownVideoIds))) protectedState = stateApi.save(protectedState, { sync: !isGuest() }) || protectedState;
      renderPlayer();
    }

    function handleAccessStatus() {
      if (canReadProtectedData()) return initializeProtectedState();
      disposeProtectedState();
      let currentStatus = 'checking';
      try { if (mediaAccess && typeof mediaAccess.getStatus === 'function') currentStatus = mediaAccess.getStatus(); } catch (_) {}
      if (currentStatus === 'blocked') renderGate();
      else renderVpnChecking();
    }

    function handleStorage(event) {
      const relevant = new Set([VIDEO_KEY, META_KEY, MARKER_KEY, 'mangaReaderVideoShortsState']);
      if (!canReadProtectedData() || (event && event.key !== null && !relevant.has(event.key))) return;
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
