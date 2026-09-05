(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const Data = window.MangaReaderVideoData;
  if (!Data) return;

  const VIDEO_KEY = 'mangaReaderVideos';
  const META_KEY = 'mangaReaderVideoMeta';
  let syncTimer = null;
  let activeVideoId = '';
  let activePlayer = null;
  let activePlayback = null;
  let editorObserver = null;
  let thumbnailObserver = null;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function ensureStyles() {
    if (document.getElementById('videoInlinePlaybackStyles')) return;
    const style = document.createElement('style');
    style.id = 'videoInlinePlaybackStyles';
    style.textContent = `
      #videoLibraryResults .vl-card.vl-inline-playing{overflow:hidden}
      #videoLibraryResults .vl-card.vl-inline-playing .vl-thumb{display:none}
      #videoLibraryResults .vl-inline-player{position:relative;aspect-ratio:16/9;width:100%;background:#000;border-radius:15px 15px 0 0;overflow:hidden;z-index:2}
      #videoLibraryResults .vl-inline-player.vl-large-player{position:fixed;inset:8vh 5vw;z-index:210;width:90vw;height:84vh;max-width:none;aspect-ratio:auto;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.65)}
      #videoLibraryResults .vl-inline-player iframe,#videoLibraryResults .vl-inline-player video{display:block;width:100%;height:100%;border:0;background:#000;object-fit:contain}
      #videoLibraryResults .vl-inline-player.vl-large-player video,#videoLibraryResults .vl-inline-player.vl-large-player iframe{object-fit:contain}
      #videoLibraryResults .vl-portrait-toggle{position:absolute;right:8px;top:8px;z-index:5;min-height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(10,12,17,.78);color:#fff;font-size:12px;font-weight:750;cursor:pointer}
      #videoLibraryResults .vl-inline-player video.vl-rotate-left{position:absolute;left:50%;top:50%;max-width:none;max-height:none;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:center center}
      #videoLibraryResults .vl-thumb .vl-thumb-direct-video{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#000;object-fit:cover;opacity:0;pointer-events:none}
      #videoLibraryResults .vl-thumb .vl-thumb-direct-video[data-frame-ready="1"]{opacity:1}
      #videoLibraryResults .vl-inline-fallback{height:100%;display:grid;place-items:center;align-content:center;gap:10px;padding:24px;text-align:center;color:#fff}
      #videoLibraryResults .vl-inline-fallback a{color:#fff;text-decoration:underline}
      #videoLibraryResults .vl-inline-site-toggle{position:absolute;left:8px;bottom:8px;z-index:5;min-height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(10,12,17,.78);color:#fff;font-size:12px;font-weight:750;cursor:pointer;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
      #videoLibraryResults .vl-grid.compact .vl-card.vl-inline-playing{display:block;min-height:0}
      #videoLibraryResults .vl-grid.compact .vl-card.vl-inline-playing .vl-open{display:block}
      #videoLibraryResults .vl-grid.compact .vl-card.vl-inline-playing .vl-body{padding:10px 70px 10px 12px}
      #videoLibraryResults .vl-grid.compact .vl-card.vl-inline-playing .vl-card-actions{top:8px;transform:none}
    `;
    document.head.append(style);
  }

  function scheduleVaultSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!window.MangaVault || !window.MangaVaultPayload || typeof MangaVault.loadActive !== 'function' || !MangaVault.loadActive()) return;
      try {
        await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());
      } catch (_) {
        // The sidecar is already persisted locally; a later ordinary sync can retry.
      }
    }, 450);
  }

  function recordOpen(base) {
    const rawMeta = readJson(META_KEY, {});
    const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};
    const current = meta[base.id] && typeof meta[base.id] === 'object' ? meta[base.id] : {};
    const previousCount = Number(current.openCount != null ? current.openCount : base.openCount) || 0;
    const now = Date.now();
    meta[base.id] = { ...current, openCount: Math.max(0, Math.trunc(previousCount)) + 1, lastOpenedAt: now, updatedAt: now };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    scheduleVaultSync();
    return meta[base.id];
  }

  function persistPlaybackProgress(base, video, options) {
    if (!base || !video) return;
    const config = options || {};
    const now = Date.now();
    if (!config.force && activePlayback && now - activePlayback.lastLocalSaveAt < 5000) return;

    const position = Number(video.currentTime);
    if (!Number.isFinite(position) || position < 0) return;
    const duration = Number(video.duration);
    const rawMeta = readJson(META_KEY, {});
    const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};
    const current = meta[base.id] && typeof meta[base.id] === 'object' ? meta[base.id] : {};
    const next = {
      ...current,
      progressSeconds: Math.max(0, Math.round(position)),
      updatedAt: now,
    };
    if (Number.isFinite(duration) && duration > 0) next.durationSeconds = Math.round(duration);
    meta[base.id] = next;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    if (activePlayback) activePlayback.lastLocalSaveAt = now;
    if (config.sync) scheduleVaultSync();
  }

  function persistActivePlayback(sync) {
    if (!activePlayback) return;
    persistPlaybackProgress(activePlayback.base, activePlayback.video, { force: true, sync: sync !== false });
  }

  function validRotationRange(base, meta) {
    const start = Number(meta && meta.rotateLeftStartSeconds != null ? meta.rotateLeftStartSeconds : base && base.rotateLeftStartSeconds);
    const end = Number(meta && meta.rotateLeftEndSeconds != null ? meta.rotateLeftEndSeconds : base && base.rotateLeftEndSeconds);
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start) return null;
    return { start, end };
  }

  function installTimedLeftRotation(player, video, base, meta) {
    const range = validRotationRange(base, meta);
    if (!range) return () => {};
    let sourceWidth = 0;
    let sourceHeight = 0;
    let rotated = false;
    let resizeObserver = null;

    const sizeRotatedVideo = () => {
      if (!rotated || !player.isConnected) return;
      const width = player.clientWidth;
      const height = player.clientHeight;
      if (width > 0 && height > 0) {
        video.style.width = height + 'px';
        video.style.height = width + 'px';
      }
    };

    const apply = () => {
      const current = Number(video.currentTime);
      const shouldRotate = Number.isFinite(current) && current >= range.start && current < range.end;
      if (shouldRotate === rotated) {
        if (rotated) sizeRotatedVideo();
        return;
      }
      rotated = shouldRotate;
      video.classList.toggle('vl-rotate-left', rotated);
      if (sourceWidth > 0 && sourceHeight > 0) {
        player.style.aspectRatio = rotated ? (sourceHeight + ' / ' + sourceWidth) : (sourceWidth + ' / ' + sourceHeight);
      }
      if (rotated) requestAnimationFrame(sizeRotatedVideo);
      else {
        video.style.width = '100%';
        video.style.height = '100%';
      }
    };

    const onMetadata = () => {
      sourceWidth = Number(video.videoWidth) || 0;
      sourceHeight = Number(video.videoHeight) || 0;
      apply();
    };
    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('timeupdate', apply);
    video.addEventListener('seeking', apply);
    video.addEventListener('seeked', apply);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (rotated) sizeRotatedVideo();
      });
      resizeObserver.observe(player);
    }
    return () => {
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('timeupdate', apply);
      video.removeEventListener('seeking', apply);
      video.removeEventListener('seeked', apply);
      if (resizeObserver) resizeObserver.disconnect();
      video.classList.remove('vl-rotate-left');
      video.style.width = '';
      video.style.height = '';
    };
  }

  function closeActivePlayer() {
    persistActivePlayback(true);
    if (activePlayback && typeof activePlayback.cleanup === 'function') activePlayback.cleanup();
    if (activePlayer && activePlayer.isConnected) {
      const card = activePlayer.closest('.vl-card');
      activePlayer.remove();
      if (card) card.classList.remove('vl-inline-playing');
    }
    activePlayback = null;
    activePlayer = null;
    activeVideoId = '';
  }

  function externalOpenLink(url, label) {
    if (!url) return null;
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label || '外部で開く';
    return link;
  }

  function appendFallback(player, url, messageText) {
    const fallback = document.createElement('div');
    fallback.className = 'vl-inline-fallback';
    const message = document.createElement('strong');
    message.textContent = messageText || 'このURLはサイト内で再生できません';
    fallback.append(message);
    const link = externalOpenLink(url, '外部で開く');
    if (link) fallback.append(link);
    player.append(fallback);
  }

  function configureSiteIframe(iframe, url, title) {
    iframe.title = title || '動画ページ';
    iframe.src = url;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.dataset.siteEmbed = '1';
    return iframe;
  }

  function appendSiteEmbedToggle(player, iframe, siteUrl, videoEmbedUrl) {
    if (!siteUrl || !iframe) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vl-inline-site-toggle';
    button.textContent = 'サイト表示を試す';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const showingSite = iframe.dataset.siteEmbed === '1';
      iframe.dataset.siteEmbed = showingSite ? '0' : '1';
      iframe.src = showingSite ? videoEmbedUrl : siteUrl;
      button.textContent = showingSite ? 'サイト表示を試す' : '動画埋め込みに戻す';
    });
    player.append(button);
  }

  function appendLargeDisplayToggle(player) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'vl-portrait-toggle'; button.textContent = '大きく表示';
    button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      const enabled = player.classList.toggle('vl-large-player');
      button.textContent = enabled ? '通常表示' : '大きく表示';
    });
    player.append(button);
  }

  function createInlinePlayer(base, meta) {
    const player = document.createElement('div');
    player.className = 'vl-inline-player';
    const storedUrl = text(meta && meta.url);
    const url = storedUrl || (text(base.a) && text(base.b) && text(base.a) !== 'url' ? Data.legacyUrl(base.a, base.b) : '');
    const classified = Data.classifyVideoUrl(url);

    if (classified.kind === 'direct') {
      const video = document.createElement('video');
      video.src = classified.url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = 'metadata';
      const cleanupRotation = installTimedLeftRotation(player, video, base, meta);
      activePlayback = { base, video, lastLocalSaveAt: 0, cleanup: cleanupRotation };

      video.addEventListener('loadedmetadata', () => {
        const width = Number(video.videoWidth);
        const height = Number(video.videoHeight);
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          player.style.aspectRatio = width + ' / ' + height;
        }
        const duration = Number(video.duration);
        const savedProgress = Number(meta && meta.progressSeconds != null ? meta.progressSeconds : base.progressSeconds);
        if (Number.isFinite(savedProgress) && savedProgress > 0 && Number.isFinite(duration) && duration > 0 && savedProgress < duration - 1) {
          try { video.currentTime = Math.min(savedProgress, Math.max(0, duration - 0.25)); } catch (_) {}
        }
        persistPlaybackProgress(base, video, { force: true, sync: false });
      });
      video.addEventListener('timeupdate', () => persistPlaybackProgress(base, video, { sync: false }));
      video.addEventListener('pause', () => persistPlaybackProgress(base, video, { force: true, sync: true }));
      video.addEventListener('ended', () => persistPlaybackProgress(base, video, { force: true, sync: true }));
      video.addEventListener('error', () => {
        if (activePlayback && activePlayback.video === video) {
          if (typeof activePlayback.cleanup === 'function') activePlayback.cleanup();
          activePlayback = null;
        }
        video.remove();
        if (!player.querySelector('.vl-inline-fallback')) {
          appendFallback(player, classified.url, 'この動画はサイト内再生を許可していないか、ブラウザで直接再生できません');
        }
      }, { once: true });
      player.append(video);
      video.addEventListener('contextmenu', (event) => event.preventDefault());
      appendLargeDisplayToggle(player);
    } else if (text(base.a) && text(base.b) && text(base.a) !== 'url') {
      const iframe = document.createElement('iframe');
      const title = text(meta && meta.title) || text(base.title) || (text(base.a) + ' / ' + text(base.b));
      const videoEmbedUrl = 'https://www.' + text(base.a) + '.com/embed/' + encodeURIComponent(text(base.b));
      iframe.title = title;
      iframe.src = videoEmbedUrl;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.dataset.siteEmbed = '0';
      player.append(iframe);
      // When the dedicated video embed is rejected, the provider's ordinary
      // page may still allow framing. Browsers do not reliably expose
      // X-Frame-Options/frame-ancestors failures to the parent page, so offer
      // an explicit in-place retry using the original site URL.
      appendSiteEmbedToggle(player, iframe, url, videoEmbedUrl);
    } else if (classified.kind === 'link') {
      const iframe = configureSiteIframe(
        document.createElement('iframe'),
        classified.url,
        text(meta && meta.title) || text(base.title) || '動画ページ'
      );
      player.append(iframe);
    } else {
      appendFallback(player, classified.kind === 'invalid' ? url : classified.url);
    }

    return player;
  }

  function directThumbnailRecord(base, meta) {
    return Data.normalizeVideo({
      ...base,
      ...meta,
      id: base.id,
      a: base.a,
      b: base.b,
      addedAt: base.addedAt,
    });
  }

  function attachDirectVideoThumbnail(card, base, meta) {
    const thumb = card && card.querySelector('.vl-thumb');
    if (!thumb || thumb.querySelector('.vl-thumb-direct-video')) return;

    const effective = directThumbnailRecord(base, meta);
    if (text(effective.thumbnailUrl) && thumb.querySelector('img')) return;
    const classified = Data.classifyVideoUrl(effective.url);
    if (classified.kind !== 'direct') return;

    const fallback = thumb.querySelector('.vl-thumb-fallback');
    const preview = document.createElement('video');
    const savedThumbnailTime = Number(effective.thumbnailTimeSeconds);
    const requestedThumbnailTime = Number.isFinite(savedThumbnailTime) && savedThumbnailTime >= 0 ? savedThumbnailTime : 0.1;
    let targetThumbnailTime = requestedThumbnailTime;
    preview.className = 'vl-thumb-direct-video';
    preview.muted = true;
    preview.defaultMuted = true;
    preview.playsInline = true;
    // metadata-only preload is not enough on several browsers to decode and
    // paint the frame reached by currentTime. Request media data for this tiny
    // muted preview so the selected frame can actually become visible.
    preview.preload = 'auto';
    preview.setAttribute('aria-hidden', 'true');
    preview.tabIndex = -1;

    const revealFrame = () => {
      preview.dataset.frameReady = '1';
      if (fallback) fallback.hidden = true;
    };
    const revealIfAtTarget = () => {
      const current = Number(preview.currentTime);
      if (!Number.isFinite(current)) return;
      if (targetThumbnailTime <= 0.05 || Math.abs(current - targetThumbnailTime) <= 0.35) revealFrame();
    };

    preview.addEventListener('loadedmetadata', () => {
      const width = Number(preview.videoWidth);
      const height = Number(preview.videoHeight);
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        thumb.style.aspectRatio = width + ' / ' + height;
      }
      const duration = Number(preview.duration);
      targetThumbnailTime = Number.isFinite(duration) && duration > 0
        ? Math.min(requestedThumbnailTime, Math.max(0, duration - 0.05))
        : Math.max(0, requestedThumbnailTime);
      preview.dataset.thumbnailTarget = String(targetThumbnailTime);
      try { preview.currentTime = targetThumbnailTime; } catch (_) {}
      revealIfAtTarget();
    });
    // seeked is the reliable signal that the browser has decoded the
    // requested frame. loadeddata/canplay cover time 0 and browsers that
    // do not emit seeked when the target is effectively the current position.
    preview.addEventListener('seeked', revealFrame);
    preview.addEventListener('loadeddata', revealIfAtTarget);
    preview.addEventListener('canplay', revealIfAtTarget);
    preview.addEventListener('error', () => {
      preview.remove();
      if (fallback) fallback.hidden = false;
    });
    preview.src = classified.url;
    thumb.append(preview);
  }

  function scanDirectVideoThumbnails() {
    const results = document.getElementById('videoLibraryResults');
    if (!results) return false;
    const rawVideos = readJson(VIDEO_KEY, []);
    const videos = Array.isArray(rawVideos) ? rawVideos : [];
    const rawMeta = readJson(META_KEY, {});
    const meta = rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta) ? rawMeta : {};
    const byId = new Map(videos.map((video) => [text(video && video.id), video]));
    results.querySelectorAll('.vl-card').forEach((card) => {
      const base = byId.get(text(card.dataset.id));
      if (!base) return;
      const current = meta[base.id] && typeof meta[base.id] === 'object' ? meta[base.id] : {};
      attachDirectVideoThumbnail(card, base, current);
    });
    return true;
  }

  function ensureDirectVideoThumbnails() {
    ensureStyles();
    const results = document.getElementById('videoLibraryResults');
    if (!results) {
      if (thumbnailObserver || typeof MutationObserver === 'undefined') return;
      thumbnailObserver = new MutationObserver(() => {
        if (!document.getElementById('videoLibraryResults')) return;
        thumbnailObserver.disconnect();
        thumbnailObserver = null;
        ensureDirectVideoThumbnails();
      });
      thumbnailObserver.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    scanDirectVideoThumbnails();
    if (thumbnailObserver) thumbnailObserver.disconnect();
    if (typeof MutationObserver === 'undefined') return;
    thumbnailObserver = new MutationObserver(() => scanDirectVideoThumbnails());
    thumbnailObserver.observe(results, { childList: true, subtree: true });
  }

  function syncUrlCompatibilityFields(urlInput, serviceInput, idInput) {
    const fields = Data.storageFieldsForVideoUrl(text(urlInput.value));
    serviceInput.value = fields ? fields.a : '';
    idInput.value = fields ? fields.b : '';
    return fields;
  }

  function installUrlOnlyEditor() {
    const urlInput = document.getElementById('videoLibraryUrl');
    const serviceInput = document.getElementById('videoLibraryLegacyService');
    const idInput = document.getElementById('videoLibraryLegacyId');
    const form = document.getElementById('videoLibraryForm');
    if (!urlInput || !serviceInput || !idInput || !form) return false;
    if (form.dataset.urlOnlyBridge === '1') return true;
    form.dataset.urlOnlyBridge = '1';

    const row = serviceInput.closest('.vl-two');
    if (row && row.contains(idInput)) row.remove();
    const thumbnail = document.getElementById('videoLibraryThumbnail');
    const details = thumbnail && thumbnail.closest('details');
    const summary = details && details.querySelector('summary');
    if (summary) summary.textContent = 'サムネイル';

    const sync = () => syncUrlCompatibilityFields(urlInput, serviceInput, idInput);
    urlInput.addEventListener('input', sync);
    form.addEventListener('submit', (event) => {
      const fields = sync();
      if (fields) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const error = document.getElementById('videoLibraryFormError');
      if (error) error.textContent = 'http(s)のURLを入力してください。';
    }, true);
    sync();
    return true;
  }

  function ensureUrlOnlyEditor() {
    if (installUrlOnlyEditor()) {
      if (editorObserver) editorObserver.disconnect();
      editorObserver = null;
      return;
    }
    if (editorObserver || typeof MutationObserver === 'undefined') return;
    editorObserver = new MutationObserver(() => ensureUrlOnlyEditor());
    editorObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function handleEnhancedOpen(event) {
    const target = event.target && typeof event.target.closest === 'function' ? event.target : null;
    const openButton = target && target.closest('#videoLibraryResults .vl-open');
    if (!openButton) return;
    const card = openButton.closest('.vl-card');
    const videoId = card && text(card.dataset.id);
    if (!videoId) return;

    const rawVideos = readJson(VIDEO_KEY, []);
    const videos = Array.isArray(rawVideos) ? rawVideos : [];
    const base = videos.find((video) => text(video && video.id) === videoId);
    if (!base) return;

    // Capture before the card's original click handler so legacy screen navigation never runs.
    event.preventDefault();
    event.stopImmediatePropagation();

    if (activeVideoId === videoId && activePlayer && activePlayer.isConnected) {
      closeActivePlayer();
      return;
    }
    closeActivePlayer();
    ensureStyles();

    const meta = recordOpen(base);
    const player = createInlinePlayer(base, meta);
    card.classList.add('vl-inline-playing');
    card.prepend(player);
    activeVideoId = videoId;
    activePlayer = player;
  }

  document.addEventListener('click', handleEnhancedOpen, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistActivePlayback(true);
  });
  window.addEventListener('pagehide', () => persistActivePlayback(false));
  setTimeout(() => {
    ensureDirectVideoThumbnails();
    ensureUrlOnlyEditor();
  }, 0);
})();
