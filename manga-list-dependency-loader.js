(function (root) {
  'use strict';

  const coreGroup = [
    ['manga-list-template.js?v=20260922-vpn-tools', 'mangaRouteTemplate'],
    ['manga-list-search-events.js?v=20260922-search-events', 'mangaRouteSearchEvents'],
    ['manga-list-sort-events.js?v=20260922-sort-events', 'mangaRouteSortEvents'],
    ['manga-list-filter-events.js?v=20260922-filter-events', 'mangaRouteFilterEvents'],
    ['manga-list-folder-events.js?v=20260922-folder-events', 'mangaRouteFolderEvents'],
    ['manga-list-smart-list-events.js?v=20260922-smart-events', 'mangaRouteSmartEvents'],
    ['manga-list-pagination-events.js?v=20260922-pagination-events', 'mangaRoutePaginationEvents'],
    ['manga-list-navigation-events.js?v=20260922-navigation-events', 'mangaRouteNavigationEvents'],
    ['manga-list-bulk-events.js?v=20260922-bulk-events', 'mangaRouteBulkEvents'],
    ['manga-list-dom-resolver.js?v=20260922-dom-resolver', 'mangaRouteResolver'],
    ['manga-list-elements.js?v=20260922-elements', 'mangaRouteElements'],
    ['manga-list-mount.js?v=20260922-mount', 'mangaRouteMount'],
    ['manga-list-card.js?v=20260922-card', 'mangaRouteCard'],
    ['manga-list-state.js?v=20260922-state', 'mangaRouteState'],
    ['manga-list-view-model.js?v=20260922-view-model', 'mangaRouteViewModel'],
    ['manga-list-renderer.js?v=20260922-renderer', 'mangaRouteRenderer'],
    ['manga-list-state-runtime.js?v=20260922-state-runtime', 'mangaRouteStateRuntime'],
    ['manga-list-render-runtime.js?v=20260922-render-runtime', 'mangaRouteRenderRuntime'],
    ['manga-list-bootstrap.js?v=20260922-bootstrap', 'mangaRouteBootstrap'],
    ['manga-list-controller.js?v=20260922-controller', 'mangaRouteController'],
    ['manga-list-runtime-context.js?v=20261005-shelf-startup', 'mangaRouteContext'],
    ['manga-list-image-cache.js?v=20260922-image-cache', 'mangaRouteImageCache'],
    ['reader-target.js?v=20261003-reader-launch-contract', 'mangaReaderTarget'],
    ['manga-list-host-runtime.js?v=20261003-reader-launch-contract', 'mangaRouteHost'],
    ['manga-list-runtime.js?v=20261005-shelf-startup', 'mangaRouteRuntime'],
    ['manga-list-entry.js?v=20260922-entry', 'mangaRouteEntry'],
  ];

  // These groups reflect eager global reads in the UMD modules. Groups fetch
  // concurrently, but a later group is not evaluated until its prerequisites
  // have loaded.
  const encryptedImageImportGroups = [
    [
      ['image-transfer-settings.js?v=20261004-encrypted-image-import', 'encryptedImageImportSettings'],
      ['image-transfer-ledger.js?v=20261004-encrypted-image-import', 'encryptedImageImportLedger'],
      ['encrypted-asset-crypto.js?v=20261004-encrypted-image-import', 'encryptedImageImportCrypto'],
      ['encrypted-asset-backend.js?v=20261004-encrypted-image-import', 'encryptedImageImportBackend'],
      ['encrypted-asset-storage.js?v=20261004-encrypted-image-import', 'encryptedImageImportStorage'],
      ['image-compression-profile.js?v=20261004-encrypted-image-import', 'encryptedImageImportProfile'],
    ],
    [
      ['encrypted-asset-cache.js?v=20261004-encrypted-image-import', 'encryptedImageImportCache'],
      ['image-remote-access.js?v=20261004-encrypted-image-import', 'encryptedImageImportRemoteAccess'],
      ['image-pyramid-builder.js?v=20261004-encrypted-image-import', 'encryptedImageImportPyramid'],
    ],
    [
      ['encrypted-asset-sync.js?v=20261004-encrypted-image-import', 'encryptedImageImportSync'],
      ['image-photo-processor.js?v=20261004-encrypted-image-import', 'encryptedImageImportProcessor'],
    ],
    [['encrypted-asset-reader.js?v=20261004-encrypted-image-import', 'encryptedImageImportReader']],
    [['encrypted-asset-item.js?v=20261004-encrypted-image-import', 'encryptedImageImportItem']],
    [['encrypted-asset-import.js?v=20261004-import-ui', 'encryptedImageImport']],
  ];

  const loaders = new WeakMap();

  function createForDocument(documentRef) {
    const scriptPromises = new Map();
    const preloaded = new Set();
    let corePromise = null;
    let encryptedImportPromise = null;

    function markLoaded(script) {
      if (script.dataset) script.dataset.loaded = '1';
    }

    function loadScript([src, id], document) {
      if (scriptPromises.has(id)) return scriptPromises.get(id);
      const existing = document.getElementById(id);
      if (existing && existing.dataset?.loaded === '1') return Promise.resolve();
      const promise = new Promise((resolve, reject) => {
        const script = existing || document.createElement('script');
        script.async = false;
        if (!existing) {
          script.id = id;
          script.src = src;
        }
        const onLoad = () => { markLoaded(script); resolve(); };
        const onError = () => {
          script.remove?.();
          reject(new Error('manga list dependency failed to load: ' + src));
        };
        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
        if (!existing) document.body.appendChild(script);
      });
      scriptPromises.set(id, promise);
      promise.catch(() => { if (scriptPromises.get(id) === promise) scriptPromises.delete(id); });
      return promise;
    }

    function loadGroups(groups) {
      return groups.reduce((chain, group) => chain.then(() => Promise.all(group.map((script) => loadScript(script, documentRef)))), Promise.resolve());
    }

    function preloadCore() {
      coreGroup.forEach(([src]) => {
        if (preloaded.has(src)) return;
        const link = documentRef.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        link.href = src;
        link.dataset.mangaListDependencyPreload = '1';
        documentRef.head.appendChild(link);
        preloaded.add(src);
      });
      return coreGroup.length;
    }

    function loadCore() {
      if (!corePromise) {
        corePromise = loadGroups([coreGroup]).catch((error) => {
          corePromise = null;
          throw error;
        });
      }
      return corePromise;
    }

    function ensureEncryptedImageImportDependencies() {
      if (!encryptedImportPromise) {
        encryptedImportPromise = loadGroups(encryptedImageImportGroups).catch((error) => {
          encryptedImportPromise = null;
          throw error;
        });
      }
      return encryptedImportPromise;
    }

    return Object.freeze({ preloadCore, loadCore, ensureEncryptedImageImportDependencies });
  }

  function create({ documentRef } = {}) {
    if (!documentRef || typeof documentRef.createElement !== 'function') throw new TypeError('MangaListDependencyLoaderFactory requires documentRef');
    if (!loaders.has(documentRef)) loaders.set(documentRef, createForDocument(documentRef));
    return loaders.get(documentRef);
  }

  root.MangaListDependencyLoaderFactory = Object.freeze({
    create,
    CORE_GROUPS: Object.freeze([Object.freeze(coreGroup.map((entry) => Object.freeze(entry.slice())))]),
    ENCRYPTED_IMAGE_IMPORT_GROUPS: Object.freeze(encryptedImageImportGroups.map((group) => Object.freeze(group.map((entry) => Object.freeze(entry.slice()))))),
  });
  if (root.document) {
    try { create({ documentRef: root.document }).preloadCore(); } catch (_) {}
  }
})(typeof self !== 'undefined' ? self : this);
