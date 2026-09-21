(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') throw new TypeError('MangaListRenderRuntimeFactory requires dependency object');
    for (const name of ['getState', 'getElements', 'deriveViewModel', 'render']) {
      if (typeof deps[name] !== 'function') throw new TypeError('MangaListRenderRuntimeFactory requires function: ' + name);
    }
    function render() {
      const state = deps.getState();
      const elements = deps.getElements();
      const viewModel = deps.deriveViewModel({ state, elements });
      return deps.render({ state, elements, viewModel });
    }
    return Object.freeze({ render });
  }

  root.MangaListRenderRuntimeFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
