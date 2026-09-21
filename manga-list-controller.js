(function (root) {
  'use strict';

  const DEPENDENCY_NAMES = ['init', 'render', 'open', 'activate', 'getElements'];

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListControllerFactory requires dependency object');
    }
    for (const name of DEPENDENCY_NAMES) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListControllerFactory requires function: ' + name);
      }
    }
    return Object.freeze({
      init: deps.init,
      render: deps.render,
      open: deps.open,
      activate: deps.activate,
      getElements: deps.getElements,
    });
  }

  root.MangaListControllerFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
