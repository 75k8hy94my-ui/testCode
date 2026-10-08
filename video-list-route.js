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
    let scriptsLoaded = false;
    let bootPromise = null;
    let helperPromise = null;
    const canReadProtectedData = () => !!deps.mediaAccess && typeof deps.mediaAccess.canReadProtectedData === 'function' && deps.mediaAccess.canReadProtectedData() === true;

    async function loadFeatureScripts() {
      if (!bootPromise) {
        bootPromise = (async () => {
          await deps.loadMediaGate();
          await deps.loadScript('video-data.js?v=20260918-video-data-no-window', 'spaVideoData');
          await deps.loadScript('video-thumbnail-renderer.js?v=20261008-shared-thumbnails', 'spaVideoThumbnailRenderer');
          await deps.loadScript('video-library.js?v=20261009-ellipsis-route', 'spaVideoLibrary');
        })().catch((error) => {
          bootPromise = null;
          throw error;
        });
      }
      await bootPromise;
      if (canReadProtectedData() && !helperPromise) {
        helperPromise = (async () => {
          await deps.loadScript('video-routing-fix.js?v=20261008-vpn-data', 'spaVideoRouting');
          await deps.loadScript('video-thumbnail-time.js?v=20261008-vpn-data', 'spaVideoThumbnailTime');
        })().catch((error) => {
          helperPromise = null;
          throw error;
        });
      }
      if (helperPromise) await helperPromise;
      scriptsLoaded = true;
    }

    async function start(options) {
      if (!options || !options.mountElement || typeof options.mountElement.insertAdjacentHTML !== 'function') throw new TypeError('mountElement must be an Element');
      const mountElement = options.mountElement;
      if (!rootElement) {
        mountElement.insertAdjacentHTML('beforeend', root.MangaReaderVideoTemplate.createMarkup());
        const matches = mountElement.querySelectorAll('#videoListSection');
        if (matches.length !== 1) throw new TypeError('videoListSection must exist exactly once');
        rootElement = matches[0];
      } else if (rootElement.parentNode !== mountElement) {
        mountElement.append(rootElement);
      }
      await loadFeatureScripts();
      if (!root.MangaReaderVideoLibrary || typeof root.MangaReaderVideoLibrary.init !== 'function') throw new Error('video library runtime is unavailable');
      root.MangaReaderVideoLibrary.init(deps.mediaAccess);
      if (!scriptsLoaded || !documentRef.getElementById('videoLibraryApp')) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!documentRef.getElementById('videoLibraryApp')) throw new Error('video library did not initialize');
      return Object.freeze({ root: rootElement });
    }

    function detach() {
      if (rootElement && rootElement.parentNode) rootElement.remove();
      const sheet = documentRef.getElementById('videoLibrarySheet');
      if (sheet) sheet.hidden = true;
    }

    return Object.freeze({ start, detach });
  }

  root.VideoListRouteFactory = Object.freeze({ create });
}(typeof window !== 'undefined' ? window : globalThis));
