(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const routes = window.ReaderRoutes || (window.ReaderRoutes = {});
  let mounted = null;
  function mount(container) {
    if (!container) return;
    mounted = container;
    container.dataset.readerFeature = 'videoList';
    container.setAttribute('aria-label', '動画一覧');
    document.documentElement.classList.add('reader-videoList-route');
  }
  function unmount(container) {
    if (container && container === mounted) {
      delete container.dataset.readerFeature;
      container.removeAttribute('aria-label');
    }
    mounted = null;
    document.documentElement.classList.remove('reader-videoList-route');
  }
  routes['videoList'] = Object.freeze({ mount, unmount });
  if (window.ReaderShell && typeof window.ReaderShell.syncActive === 'function') window.ReaderShell.syncActive();
})();
