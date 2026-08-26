(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const VIDEO_KEY = 'mangaReaderVideos';
  const META_KEY = 'mangaReaderVideoMeta';
  let syncTimer = null;

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

  function findLegacyNode(base) {
    const list = document.getElementById('videoListItems');
    if (!list || !base) return null;
    const matches = [];
    list.querySelectorAll('.videoGroup').forEach((group) => {
      const header = group.querySelector('.videoGroupHeader');
      if (!header || text(header.textContent) !== text(base.a)) return;
      group.querySelectorAll('.videoItem').forEach((node) => {
        const idLabel = node.querySelector('.videoItemId');
        if (idLabel && text(idLabel.textContent) === 'B: ' + text(base.b)) matches.push(node);
      });
    });
    if (matches.length <= 1) return matches[0] || null;
    return matches.find((node) => text((node.querySelector('.videoItemTitle') || {}).textContent) === text(base.title)) || matches[0];
  }

  function scheduleVaultSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!window.MangaVault || !window.MangaVaultPayload || typeof MangaVault.loadActive !== 'function' || !MangaVault.loadActive()) return;
      try {
        await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());
      } catch (_) {
        // The sidecar is already persisted locally; the library's ordinary
        // sync status will surface any later vault conflict to the user.
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
    const node = findLegacyNode(base);
    if (!base || !node) return;

    // Stop the enhanced card's direct-hash fallback and delegate playback to
    // the legacy item. Its click handler calls openReaderScreen(), preserving
    // the reader's History API back/close behavior.
    event.preventDefault();
    event.stopImmediatePropagation();

    const meta = recordOpen(base);
    node.click();

    const title = document.getElementById('videoPlayerTitle');
    if (title) title.textContent = text(meta.title) || text(base.title) || (text(base.a) + ' / ' + text(base.b));
  }

  document.addEventListener('click', handleEnhancedOpen, true);
})();
