(function (root) {
  'use strict';

  const KEY_NAMES = ['savedItems', 'savedFolders', 'authorCards'];

  function create(deps) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('MangaListHostRuntimeFactory requires dependency object');
    }
    for (const name of ['safeWriteJson', 'getState', 'scheduleCloudSync', 'persistVideos']) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListHostRuntimeFactory requires function: ' + name);
      }
    }
    if (!deps.keys || typeof deps.keys !== 'object' || Array.isArray(deps.keys)) {
      throw new TypeError('MangaListHostRuntimeFactory requires keys object');
    }
    for (const name of KEY_NAMES) {
      if (typeof deps.keys[name] !== 'string' || !deps.keys[name]) {
        throw new TypeError('MangaListHostRuntimeFactory requires key: ' + name);
      }
    }

    function persistFolders() {
      deps.safeWriteJson(deps.keys.savedFolders, deps.getState().savedFolders);
      deps.scheduleCloudSync();
    }

    function persistItems() {
      deps.safeWriteJson(deps.keys.savedItems, deps.getState().savedItems);
      deps.scheduleCloudSync();
    }

    function persistAuthorCards() {
      deps.safeWriteJson(deps.keys.authorCards, deps.getState().authorCards);
      deps.scheduleCloudSync();
    }

    function persistAll() {
      persistFolders();
      persistItems();
      persistAuthorCards();
      deps.persistVideos();
    }

    return Object.freeze({ persistItems, persistFolders, persistAuthorCards, persistAll });
  }

  root.MangaListHostRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
