(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') throw new TypeError('MangaListStateRuntimeFactory requires dependency object');
    for (const name of ['load', 'migrate', 'removeHistoryFolder', 'synchronizeAuthors']) {
      if (typeof deps[name] !== 'function') throw new TypeError('MangaListStateRuntimeFactory requires function: ' + name);
    }
    let initialized = false;
    function initialize() {
      if (initialized) throw new TypeError('MangaListStateRuntimeFactory instance is already initialized');
      initialized = true;
      let state = deps.load();
      state = deps.migrate(state);
      state = deps.removeHistoryFolder(state);
      return deps.synchronizeAuthors(state);
    }
    return Object.freeze({ initialize });
  }

  root.MangaListStateRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
