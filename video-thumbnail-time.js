(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const Data = window.MangaReaderVideoData;
  if (!Data || typeof Data.classifyVideoUrl !== 'function' || typeof Data.parseMediaTime !== 'function' || typeof Data.formatMediaTime !== 'function') return;

  const VIDEO_KEY = 'mangaReaderVideos';
  const META_KEY = 'mangaReaderVideoMeta';
  const DEFAULT_THUMBNAIL_TIME = 0.1;

  let currentEditorId = null;
  let selectedTimeSeconds = DEFAULT_THUMBNAIL_TIME;
  let previewDuration = 0;
  let editorInstalled = false;
  let observer = null;
  let syncTimer = null;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function installMetaPreservationBridge() {
    const proto = window.Storage && window.Storage.prototype;
    if (!proto || typeof proto.setItem !== 'function' || proto.setItem.__videoThumbnailTimeWrapped) return;
    const original = proto.setItem;
    const wrapped = function (key, value) {
      if (this === window.localStorage && String(key) === META_KEY && typeof Data.mergeVideoMetaPreservingThumbnailTime === 'function') {
        try {
          const existing = JSON.parse(this.getItem(META_KEY) || '{}');
          const incoming = JSON.parse(String(value));
          value = JSON.stringify(Data.mergeVideoMetaPreservingThumbnailTime(existing, incoming));
        } catch (_) {
          // Preserve the original write if the value is not JSON-shaped video metadata.
        }
      }
      return original.call(this, key, value);
    };
    wrapped.__videoThumbnailTimeWrapped = true;
    proto.setItem = wrapped;
  }

  function videos() {
    const raw = readJson(VIDEO_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  function metaMap() {
    const raw = readJson(META_KEY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }

  function scheduleVaultSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!window.MangaVault || !window.MangaVaultPayload || typeof MangaVault.loadActive !== 'function' || !MangaVault.loadActive()) return;
      try {
        await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());
      } catch (_) {
        // Local metadata is already safe; a later normal sync can retry.
      }
    }, 450);
  }

  function clampThumbnailTime(value, duration) {
    const n = Number(value);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;
    const d = Number(duration);
    if (!Number.isFinite(d) || d <= 0) return safe;
    return Math.min(safe, Math.max(0, d - 0.05));
  }

  function baseById(videoId) {
    return videos().find((video) => text(video && video.id) === text(videoId)) || null;
  }

  function effectiveVideo(videoId) {
    const base = baseById(videoId);
    if (!base) return null;
    const meta = metaMap();
    const current = meta[base.id] && typeof meta[base.id] === 'object' ? meta[base.id] : {};
    return Data.normalizeVideo({ ...base, ...current, id: base.id, a: base.a, b: base.b, addedAt: base.addedAt });
  }

  function resolveSavedVideoId(url, title) {
    if (currentEditorId && baseById(currentEditorId)) return currentEditorId;
    const fields = Data.storageFieldsForVideoUrl(text(url));
    if (!fields) return null;
    const titleText = text(title);
    const matches = videos().filter((video) => text(video && video.a) === fields.a && text(video && video.b) === fields.b);
    if (!matches.length) return null;
    const sameTitle = titleText ? matches.filter((video) => text(video && video.title) === titleText) : [];
    const candidates = sameTitle.length ? sameTitle : matches;
    candidates.sort((a, b) => Number(b.addedAt || b.createdAt || 0) - Number(a.addedAt || a.createdAt || 0));
    return text(candidates[0] && candidates[0].id) || null;
  }

  function ensureStyles() {
    if (document.getElementById('videoThumbnailTimeStyles')) return;
    const style = document.createElement('style');
    style.id = 'videoThumbnailTimeStyles';
    style.textContent = `
      .vl-thumbnail-time-editor{display:grid;gap:9px;margin:10px 0 2px;padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--bg-soft)}
      .vl-thumbnail-time-editor[hidden]{display:none!important}
      .vl-thumbnail-time-preview{width:100%;display:grid;place-items:center;overflow:hidden;border-radius:10px;background:#000;aspect-ratio:16/9}
      .vl-thumbnail-time-preview video{display:block;width:100%;height:100%;object-fit:contain;background:#000}
      .vl-thumbnail-time-controls{display:grid;grid-template-columns:minmax(0,1fr) 82px auto;gap:8px;align-items:center}
      .vl-thumbnail-time-controls input[type="range"]{width:100%;min-width:0}
      .vl-thumbnail-time-controls input[type="text"]{width:82px;text-align:center;padding:8px 7px;border:1px solid var(--border);border-radius:10px;background:var(--bg-soft);color:var(--text);font-size:14px}
      .vl-thumbnail-time-duration{color:var(--sub);font-size:11px;white-space:nowrap}
      .vl-thumbnail-time-note{margin:0;color:var(--sub);font-size:10px;line-height:1.45}
      @media(max-width:480px){.vl-thumbnail-time-controls{grid-template-columns:minmax(0,1fr) 72px}.vl-thumbnail-time-duration{grid-column:1/-1}.vl-thumbnail-time-controls input[type="text"]{width:72px}}
    `;
    document.head.append(style);
  }

  function editorElements() {
    return {
      form: document.getElementById('videoLibraryForm'),
      url: document.getElementById('videoLibraryUrl'),
      title: document.getElementById('videoLibraryTitle'),
      thumbnail: document.getElementById('videoLibraryThumbnail'),
      wrapper: document.getElementById('videoLibraryThumbnailTimeEditor'),
      thumbnailPreview: document.getElementById('videoLibraryThumbnailPreview'),
      thumbnailRange: document.getElementById('videoLibraryThumbnailRange'),
      thumbnailTime: document.getElementById('videoLibraryThumbnailTime'),
      duration: document.getElementById('videoLibraryThumbnailDuration'),
      error: document.getElementById('videoLibraryFormError'),
    };
  }

  function seekEditorPreview(seconds) {
    const { thumbnailPreview, thumbnailRange, thumbnailTime } = editorElements();
    if (!thumbnailPreview || !thumbnailRange || !thumbnailTime) return;
    selectedTimeSeconds = clampThumbnailTime(seconds, previewDuration);
    thumbnailRange.value = String(selectedTimeSeconds);
    thumbnailTime.value = Data.formatMediaTime(selectedTimeSeconds);
    if (thumbnailPreview.readyState >= 1) {
      try { thumbnailPreview.currentTime = selectedTimeSeconds; } catch (_) {}
    }
  }

  function configureEditorMetadata() {
    const { wrapper, thumbnailPreview, thumbnailRange, duration } = editorElements();
    if (!wrapper || !thumbnailPreview || !thumbnailRange || !duration) return;
    previewDuration = Number(thumbnailPreview.duration);
    if (!Number.isFinite(previewDuration) || previewDuration < 0) previewDuration = 0;
    thumbnailRange.max = String(Math.max(0, Math.floor(previewDuration)));
    duration.textContent = previewDuration > 0 ? '/ ' + Data.formatMediaTime(previewDuration) : '';
    const width = Number(thumbnailPreview.videoWidth);
    const height = Number(thumbnailPreview.videoHeight);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      const frame = thumbnailPreview.closest('.vl-thumbnail-time-preview');
      if (frame) frame.style.aspectRatio = width + ' / ' + height;
    }
    seekEditorPreview(selectedTimeSeconds);
  }

  function inferEditorId() {
    if (currentEditorId && baseById(currentEditorId)) return currentEditorId;
    const { url, title } = editorElements();
    return url ? resolveSavedVideoId(url.value, title && title.value) : null;
  }

  function refreshEditorPreview() {
    const { wrapper, url, thumbnailPreview, thumbnailRange, thumbnailTime, duration } = editorElements();
    if (!wrapper || !url || !thumbnailPreview || !thumbnailRange || !thumbnailTime || !duration) return;
    const classified = Data.classifyVideoUrl(text(url.value));
    if (classified.kind !== 'direct') {
      wrapper.hidden = true;
      previewDuration = 0;
      thumbnailPreview.removeAttribute('src');
      try { thumbnailPreview.load(); } catch (_) {}
      return;
    }

    wrapper.hidden = false;
    const editorId = inferEditorId();
    const video = editorId ? effectiveVideo(editorId) : null;
    selectedTimeSeconds = video && video.thumbnailTimeSeconds != null ? Number(video.thumbnailTimeSeconds) : DEFAULT_THUMBNAIL_TIME;
    if (!Number.isFinite(selectedTimeSeconds) || selectedTimeSeconds < 0) selectedTimeSeconds = DEFAULT_THUMBNAIL_TIME;
    previewDuration = 0;
    thumbnailRange.min = '0';
    thumbnailRange.max = '0';
    thumbnailRange.step = '1';
    thumbnailRange.value = String(selectedTimeSeconds);
    thumbnailTime.value = Data.formatMediaTime(selectedTimeSeconds);
    duration.textContent = '';

    const currentSrc = thumbnailPreview.getAttribute('src') || '';
    if (currentSrc !== classified.url) {
      thumbnailPreview.src = classified.url;
      thumbnailPreview.preload = 'metadata';
      try { thumbnailPreview.load(); } catch (_) {}
    } else if (thumbnailPreview.readyState >= 1) {
      configureEditorMetadata();
    }
  }

  function persistThumbnailTimeAfterSave(urlValue, titleValue, selectedValue) {
    const error = document.getElementById('videoLibraryFormError');
    if (error && text(error.textContent)) return;
    const targetId = resolveSavedVideoId(urlValue, titleValue);
    if (!targetId) return;
    const meta = metaMap();
    const current = meta[targetId] && typeof meta[targetId] === 'object' ? meta[targetId] : {};
    meta[targetId] = {
      ...current,
      thumbnailTimeSeconds: clampThumbnailTime(selectedValue, previewDuration),
      updatedAt: Date.now(),
    };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    currentEditorId = targetId;
    scheduleVaultSync();
    applySavedThumbnailTimeToCards(targetId);
  }

  function installEditor() {
    const form = document.getElementById('videoLibraryForm');
    const url = document.getElementById('videoLibraryUrl');
    const thumbnail = document.getElementById('videoLibraryThumbnail');
    if (!form || !url || !thumbnail) return false;
    if (editorInstalled || document.getElementById('videoLibraryThumbnailTimeEditor')) return true;

    ensureStyles();
    const wrapper = document.createElement('div');
    wrapper.id = 'videoLibraryThumbnailTimeEditor';
    wrapper.className = 'vl-thumbnail-time-editor';
    wrapper.hidden = true;

    const label = document.createElement('strong');
    label.textContent = '動画からサムネイル位置を選ぶ';

    const frame = document.createElement('div');
    frame.className = 'vl-thumbnail-time-preview';
    const thumbnailPreview = document.createElement('video');
    thumbnailPreview.id = 'videoLibraryThumbnailPreview';
    thumbnailPreview.muted = true;
    thumbnailPreview.defaultMuted = true;
    thumbnailPreview.playsInline = true;
    thumbnailPreview.preload = 'metadata';
    frame.append(thumbnailPreview);

    const controls = document.createElement('div');
    controls.className = 'vl-thumbnail-time-controls';
    const thumbnailRange = document.createElement('input');
    thumbnailRange.id = 'videoLibraryThumbnailRange';
    thumbnailRange.type = 'range';
    thumbnailRange.min = '0';
    thumbnailRange.max = '0';
    thumbnailRange.step = '1';
    thumbnailRange.value = '0';
    thumbnailRange.setAttribute('aria-label', 'サムネイル位置');
    const thumbnailTime = document.createElement('input');
    thumbnailTime.id = 'videoLibraryThumbnailTime';
    thumbnailTime.type = 'text';
    thumbnailTime.inputMode = 'numeric';
    thumbnailTime.autocomplete = 'off';
    thumbnailTime.placeholder = '0:00';
    thumbnailTime.setAttribute('aria-label', 'サムネイル時刻');
    const duration = document.createElement('span');
    duration.id = 'videoLibraryThumbnailDuration';
    duration.className = 'vl-thumbnail-time-duration';
    controls.append(thumbnailRange, thumbnailTime, duration);

    const note = document.createElement('p');
    note.className = 'vl-thumbnail-time-note';
    note.textContent = 'スライダーまたは mm:ss で指定できます。サムネイルURLを設定している場合は画像URLが優先されます。';

    wrapper.append(label, frame, controls, note);
    const field = thumbnail.closest('.vl-field');
    if (field) field.after(wrapper); else thumbnail.after(wrapper);

    thumbnailPreview.addEventListener('loadedmetadata', configureEditorMetadata);
    thumbnailPreview.addEventListener('durationchange', configureEditorMetadata);
    thumbnailRange.addEventListener('input', () => seekEditorPreview(Number(thumbnailRange.value)));
    thumbnailTime.addEventListener('change', () => {
      const parsed = Data.parseMediaTime(thumbnailTime.value);
      if (parsed == null) {
        thumbnailTime.value = Data.formatMediaTime(selectedTimeSeconds);
        return;
      }
      seekEditorPreview(parsed);
    });
    thumbnailTime.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      thumbnailTime.dispatchEvent(new Event('change', { bubbles: true }));
    });
    url.addEventListener('input', () => setTimeout(refreshEditorPreview, 0));
    form.addEventListener('submit', () => {
      const urlValue = text(url.value);
      const title = document.getElementById('videoLibraryTitle');
      const titleValue = title ? text(title.value) : '';
      const selectedValue = selectedTimeSeconds;
      setTimeout(() => persistThumbnailTimeAfterSave(urlValue, titleValue, selectedValue), 0);
    });

    editorInstalled = true;
    setTimeout(refreshEditorPreview, 0);
    return true;
  }

  function savedThumbnailTimeForCard(card) {
    const videoId = card && text(card.dataset.id);
    if (!videoId) return null;
    const video = effectiveVideo(videoId);
    return video && video.thumbnailTimeSeconds != null ? Number(video.thumbnailTimeSeconds) : null;
  }

  function bindCardPreview(preview) {
    if (!preview || preview.dataset.thumbnailTimeBound === '1') return;
    preview.dataset.thumbnailTimeBound = '1';
    const apply = () => {
      const card = preview.closest('.vl-card');
      const saved = savedThumbnailTimeForCard(card);
      if (!Number.isFinite(saved) || saved < 0 || preview.readyState < 1) return;
      const target = clampThumbnailTime(saved, preview.duration);
      try { preview.currentTime = target; } catch (_) {}
    };
    preview.addEventListener('loadedmetadata', apply);
    preview.addEventListener('durationchange', apply);
    if (preview.readyState >= 1) apply();
  }

  function scanCardPreviews(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches('.vl-thumb-direct-video')) bindCardPreview(scope);
    scope.querySelectorAll('.vl-thumb-direct-video').forEach(bindCardPreview);
  }

  function applySavedThumbnailTimeToCards(videoId) {
    document.querySelectorAll('#videoLibraryResults .vl-card').forEach((card) => {
      if (text(card.dataset.id) !== text(videoId)) return;
      const preview = card.querySelector('.vl-thumb-direct-video');
      if (!preview) return;
      const saved = savedThumbnailTimeForCard(card);
      if (!Number.isFinite(saved) || saved < 0 || preview.readyState < 1) return;
      try { preview.currentTime = clampThumbnailTime(saved, preview.duration); } catch (_) {}
    });
  }

  function handleEditorOpenClick(event) {
    const target = event.target && typeof event.target.closest === 'function' ? event.target : null;
    if (!target) return;
    if (target.closest('#videoLibraryAdd')) {
      currentEditorId = null;
      setTimeout(refreshEditorPreview, 0);
      return;
    }
    const button = target.closest('#videoLibraryResults .vl-menu-panel button');
    if (!button || text(button.textContent) !== '編集') return;
    const card = button.closest('.vl-card');
    currentEditorId = card ? text(card.dataset.id) : null;
    setTimeout(refreshEditorPreview, 0);
  }

  function ensureFeature() {
    installMetaPreservationBridge();
    installEditor();
    scanCardPreviews(document);
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((records) => {
      if (!editorInstalled) installEditor();
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node && node.nodeType === 1) scanCardPreviews(node);
      }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('click', handleEditorOpenClick, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureFeature, { once: true });
  else setTimeout(ensureFeature, 0);
})();
