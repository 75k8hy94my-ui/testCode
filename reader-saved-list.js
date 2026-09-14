(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const routes = window.ReaderRoutes || (window.ReaderRoutes = {});
  let mounted = null;
  function mount(container) {
    if (!container) return;
    mounted = container;
    container.dataset.readerFeature = 'saved-list';
    container.setAttribute('aria-label', '保存一覧');
    document.documentElement.classList.add('reader-saved-list-route');
  }
  function unmount(container) {
    if (container && container === mounted) {
      delete container.dataset.readerFeature;
      container.removeAttribute('aria-label');
    }
    mounted = null;
    document.documentElement.classList.remove('reader-saved-list-route');
  }
  routes.savedList = Object.freeze({ mount, unmount });
  if (window.ReaderShell && typeof window.ReaderShell.syncActive === 'function') window.ReaderShell.syncActive();
})();
