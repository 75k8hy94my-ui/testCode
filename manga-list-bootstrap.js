(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') throw new TypeError('MangaListBootstrapFactory requires dependency object');
    for (const name of ['mount', 'createController', 'initialize', 'bindEvents', 'activate', 'render']) {
      if (typeof deps[name] !== 'function') throw new TypeError('MangaListBootstrapFactory requires function: ' + name);
    }
    let used = false;
    function bootstrap(input) {
      if (used) throw new TypeError('MangaListBootstrapFactory instance is already used');
      if (!input || typeof input !== 'object') throw new TypeError('MangaListBootstrapFactory requires mountElement');
      used = true;
      const mounted = deps.mount(input.mountElement);
      const controller = deps.createController(mounted.elements);
      deps.initialize();
      const cleanupEvents = deps.bindEvents(mounted.elements, controller);
      if (typeof cleanupEvents !== 'function') throw new TypeError('MangaListBootstrapFactory bindEvents must return cleanup');
      deps.activate();
      deps.render();
      let cleaned = false;
      return Object.freeze({
        root: mounted.root,
        elements: mounted.elements,
        controller,
        cleanup() {
          if (cleaned) return;
          cleaned = true;
          cleanupEvents();
        },
      });
    }
    return Object.freeze({ bootstrap });
  }

  root.MangaListBootstrapFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
