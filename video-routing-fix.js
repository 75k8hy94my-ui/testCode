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
  let editorObserver = null;

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
      #videoLibraryResults .vl-inline-player iframe,#videoLibraryResults .vl-inline-player video{display:block;width:100%;height:100%;border:0;background:#000;object-fit:contain}
      #videoLibraryResults .vl-inline-close{position:absolute;top:8px;left:8px;z-index:5;width:36px;height:36px;border:1px solid rgba(255,255,255,.3);border-radius:50%;display:grid;place-items:center;background:rgba(10,12,17,.78);color:#fff;font-size:22px;line-height:1;cursor:pointer;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
      #videoLibraryResults .vl-inline-fallback{height:100%;display:grid;place-items:center;align-content:center;gap:10px;padding:24px;text-align:center;color:#fff}
      #videoLibraryResults .vl-inline-fallback a{color:#fff;text-decoration:underline}
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

  function closeActivePlayer() {
    if (activePlayer && activePlayer.isConnected) {
      const card = activePlayer.closest('.vl-card');
      activePlayer.remove();
      if (card) card.classList.remove('vl-inline-playing');
    }
    activePlayer = null;
    activeVideoId = '';
  }

  function appendFallback(player, url) {
    const fallback = document.createElement('div');
    fallback.className = 'vl-inline-fallback';
    const message = document.createElement('strong');
    message.textContent = 'このURLは埋め込み再生できません';
    fallback.append(message);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = '元ページを開く';
      fallback.append(link);
    }
    player.append(fallback);
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
      player.append(video);
    } else if (text(base.a) && text(base.b) && text(base.a) !== 'url') {
      const iframe = document.createElement('iframe');
      iframe.title = text(meta && meta.title) || text(base.title) || (text(base.a) + ' / ' + text(base.b));
      iframe.src = 'https://www.' + text(base.a) + '.com/embed/' + encodeURIComponent(text(base.b));
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      player.append(iframe);
    } else {
      appendFallback(player, classified.kind === 'invalid' ? url : classified.url);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'vl-inline-close';
    close.textContent = '×';
    close.setAttribute('aria-label', '再生を閉じる');
    close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeActivePlayer();
    });
    player.append(close);
    return player;
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

    if (activeVideoId === videoId && activePlayer && activePlayer.isConnected) return;
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
  setTimeout(ensureUrlOnlyEditor, 0);
})();
