(function (root) {
  'use strict';

  function activityTime(item) {
    return Number(item.updatedAt || item.addedAt || 0) || 0;
  }

  function rank(item) {
    return [
      item.lastReadAt ? 0 : 100,
      item.favorite ? 20 : 0,
      activityTime(item),
    ];
  }

  function compare(a, b) {
    const left = rank(a);
    const right = rank(b);
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return right[i] - left[i];
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function chooseFallback(items, options) {
    const config = options || {};
    const history = new Set(Array.isArray(config.history) ? config.history : []);
    const candidates = (Array.isArray(items) ? items : []).filter((item) => {
      if (!item || item.id === config.currentId || Array.isArray(item.pages)) return false;
      if (config.localReaderEnabled === false && item.localSync) return false;
      return true;
    });
    if (!candidates.length) return null;
    const fresh = candidates.filter((item) => !history.has(item.id));
    return (fresh.length ? fresh : candidates).slice().sort(compare)[0] || null;
  }

  root.MangaReaderRecommendations = { chooseFallback };

  function loadBrowserScript(src) {
    if (typeof document === 'undefined') return Promise.resolve();
    const existing = document.querySelector('script[data-video-library-src="' + src + '"]');
    if (existing) return existing.dataset.loaded === '1' ? Promise.resolve() : new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
    });
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.videoLibrarySrc = src;
      script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });
  }

  function installVideoBackupRestoreHook() {
    const backup = root.MangaReaderBackup;
    if (!backup || typeof backup.migrateBackup !== 'function' || backup.migrateBackup.__videoLibraryWrapped) return;
    const original = backup.migrateBackup.bind(backup);
    const wrapped = function (input) {
      const data = original(input);
      const originalConfirm = root.confirm;
      if (typeof originalConfirm !== 'function') return data;

      const confirmOnce = function (...args) {
        // applyImportedData() asks for confirmation immediately after
        // migrateBackup() returns. Restore the native function before calling
        // it so every later confirmation behaves normally.
        if (root.confirm === confirmOnce) root.confirm = originalConfirm;
        const accepted = originalConfirm.apply(root, args);
        if (accepted) {
          if (data && Array.isArray(data.videoFolders)) localStorage.setItem('mangaReaderVideoFolders', JSON.stringify(data.videoFolders));
          if (data && data.videoMeta && typeof data.videoMeta === 'object' && !Array.isArray(data.videoMeta)) localStorage.setItem('mangaReaderVideoMeta', JSON.stringify(data.videoMeta));
        }
        return accepted;
      };

      root.confirm = confirmOnce;
      // If the migration result is used by some future code path that does
      // not immediately ask for confirmation, do not leave the interceptor
      // installed beyond this JavaScript turn.
      setTimeout(() => {
        if (root.confirm === confirmOnce) root.confirm = originalConfirm;
      }, 0);
      return data;
    };
    wrapped.__videoLibraryWrapped = true;
    root.MangaReaderBackup.migrateBackup = wrapped;
  }

  function bootstrapVideoLibrary() {
    if (typeof document === 'undefined') return;
    installVideoBackupRestoreHook();
    loadBrowserScript('desktop-navigation.js')
      .catch((error) => console.warn('デスクトップナビの読み込みに失敗しました', error));
    loadBrowserScript('video-data.js')
      .then(() => loadBrowserScript('video-library.js'))
      .then(() => loadBrowserScript('video-routing-fix.js'))
      .then(() => loadBrowserScript('video-thumbnail-time.js'))
      .catch((error) => console.warn('動画ライブラリの読み込みに失敗しました', error));
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapVideoLibrary, { once: true });
    else setTimeout(bootstrapVideoLibrary, 0);
  }
}(typeof window !== 'undefined' ? window : globalThis));