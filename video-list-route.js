(function (root) {
  'use strict';

  function requiredFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
  }

  function create(deps) {
    if (!deps || typeof deps !== 'object') throw new TypeError('dependencies are required');
    const documentRef = deps.documentRef;
    if (!documentRef || typeof documentRef.createElement !== 'function') throw new TypeError('documentRef must be a document');
    requiredFunction(deps.loadScript, 'loadScript');
    requiredFunction(deps.loadMediaGate, 'loadMediaGate');
    if (!root.MangaReaderVideoTemplate || typeof root.MangaReaderVideoTemplate.createMarkup !== 'function') throw new TypeError('video template is required');

    let rootElement = null;
    let bootPromise = null;
    let helperPromise = null;
    let stylesheetPromise = null;
    // Load the route-scoped stylesheet before mounting any video UI. The
    // Promise is owned by the route lifecycle, never by the library or a timer.
    function ensureStylesheet() {
      if (stylesheetPromise) return stylesheetPromise;
      if (!documentRef.head) return Promise.resolve(); // Minimal test documents.
      stylesheetPromise = new Promise((resolve, reject) => {
        const existing = documentRef.getElementById('videoLibraryStyles');
        if (existing?.dataset?.loaded === '1') { resolve(); return; }
        const link = existing || documentRef.createElement('link');
        const loaded = () => { link.dataset.loaded = '1'; resolve(); };
        const failed = (error) => { link.remove?.(); reject(error); };
        link.addEventListener('load', loaded, { once: true });
        link.addEventListener('error', failed, { once: true });
        if (!existing) {
          link.id = 'videoLibraryStyles';
          link.rel = 'stylesheet';
          link.href = 'video-library.css?v=20261118-architecture';
          documentRef.head.appendChild(link);
        }
      }).catch((error) => { stylesheetPromise = null; throw error; });
      return stylesheetPromise;
    }
    // Detaching or restarting invalidates any earlier asynchronous startup.
    let activation = 0;
    const canReadProtectedData = () => !!deps.mediaAccess && typeof deps.mediaAccess.canReadProtectedData === 'function' && deps.mediaAccess.canReadProtectedData() === true;

    async function loadFeatureScripts() {
      if (!bootPromise) {
        bootPromise = (async () => {
          await deps.loadMediaGate();
          await ensureStylesheet();
          await deps.loadScript('video-data.js?v=20261117-embed-routing', 'spaVideoData');
          await deps.loadScript('manga-list-pagination-events.js?v=20261012-video-pagination', 'spaMangaPaginationEvents');
          await deps.loadScript('video-library-pagination.js?v=20261012-video-pagination', 'spaVideoLibraryPagination');
          await deps.loadScript('video-thumbnail-cache.js?v=20261102-ios-lazy', 'spaVideoThumbnailCache');
          await deps.loadScript('video-thumbnail-renderer.js?v=20261102-ios-lazy', 'spaVideoThumbnailRenderer');
          await deps.loadScript('video-card.js?v=20261026-url-bookmarks', 'spaVideoCard');
          await deps.loadScript('video-custom-properties.js?v=20261012-video-custom-properties', 'spaVideoCustomProperties');
          await deps.loadScript('video-custom-property-store.js?v=20261012-video-custom-properties', 'spaVideoCustomPropertyStore');
          await deps.loadScript('video-library-view.js?v=20261118-architecture', 'spaVideoLibraryView');
          await deps.loadScript('video-library.js?v=20261117-embed-routing', 'spaVideoLibrary');
        })().catch((error) => {
          bootPromise = null;
          throw error;
        });
      }
      await bootPromise;
      if (canReadProtectedData() && !helperPromise) {
        helperPromise = (async () => {
          await deps.loadScript('video-link-metadata.js?v=20261026-click-title', 'spaVideoLinkMetadata');
          await deps.loadScript('video-routing-fix.js?v=20261026-click-title', 'spaVideoRouting');
          await deps.loadScript('video-thumbnail-time.js?v=20261009-vault-sync-queue', 'spaVideoThumbnailTime');
        })().catch((error) => {
          helperPromise = null;
          throw error;
        });
      }
      if (helperPromise) await helperPromise;
    }

    async function start(options) {
      if (!options || !options.mountElement || typeof options.mountElement.insertAdjacentHTML !== 'function') throw new TypeError('mountElement must be an Element');
      const mountElement = options.mountElement;
      const token = ++activation;
      if (!rootElement) {
        mountElement.insertAdjacentHTML('beforeend', root.MangaReaderVideoTemplate.createMarkup());
        const matches = mountElement.querySelectorAll('#videoListSection');
        if (matches.length !== 1) throw new TypeError('videoListSection must exist exactly once');
        rootElement = matches[0];
      } else if (rootElement.parentNode !== mountElement) {
        mountElement.append(rootElement);
      }
      await loadFeatureScripts();
      // Only the current, attached route may initialize the shared library.
      if (token !== activation || rootElement.parentNode !== mountElement) return null;
      if (!root.MangaReaderVideoLibrary || typeof root.MangaReaderVideoLibrary.init !== 'function') throw new Error('video library runtime is unavailable');
      // init() mounts synchronously. Do not race a second, timer-based auto-init.
      root.MangaReaderVideoLibrary.init(deps.mediaAccess);
      if (!documentRef.getElementById('videoLibraryApp')) throw new Error('video library did not initialize');
      return Object.freeze({ root: rootElement });
    }

    function detach() {
      activation += 1;
      if (documentRef.dispatchEvent && typeof root.CustomEvent === 'function') {
        documentRef.dispatchEvent(new root.CustomEvent('manga-video-list-route-detach'));
      }
      if (rootElement && rootElement.parentNode) rootElement.remove();
      const sheet = documentRef.getElementById('videoLibrarySheet');
      if (sheet) sheet.hidden = true;
    }

    return Object.freeze({ start, detach });
  }

  root.VideoListRouteFactory = Object.freeze({ create });
}(typeof window !== 'undefined' ? window : globalThis));

