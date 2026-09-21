(function (root) {
  'use strict';

  const REQUIRED = [
    'getState', 'setState', 'getElements',
    'persistItems', 'persistFolders', 'persistAuthorCards', 'persistAll', 'scheduleCloudSync',
    'openReader', 'accessMedia', 'renderDashboard', 'renderAuthorDashboard'
  ];

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListRuntimeContextFactory requires dependency object');
    }
    for (const name of REQUIRED) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListRuntimeContextFactory requires function: ' + name);
      }
    }
    return Object.freeze({
      getState: deps.getState,
      setState: deps.setState,
      getElements: deps.getElements,
      persistItems: deps.persistItems,
      persistFolders: deps.persistFolders,
      persistAuthorCards: deps.persistAuthorCards,
      persistAll: deps.persistAll,
      scheduleCloudSync: deps.scheduleCloudSync,
      openReader: deps.openReader,
      accessMedia: deps.accessMedia,
      renderDashboard: deps.renderDashboard,
      renderAuthorDashboard: deps.renderAuthorDashboard
    });
  }

  root.MangaListRuntimeContextFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
