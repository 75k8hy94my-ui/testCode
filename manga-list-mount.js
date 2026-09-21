(function (root) {
  'use strict';

  function requireDependency(deps, name, method) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('MangaListMountFactory requires deps object');
    }
    if (!deps[name] || typeof deps[name] !== 'object' || Array.isArray(deps[name])) {
      throw new TypeError('MangaListMountFactory requires dependency: ' + name);
    }
    if (typeof deps[name][method] !== 'function') {
      throw new TypeError('MangaListMountFactory requires method: ' + name + '.' + method);
    }
  }

  function create(deps) {
    requireDependency(deps, 'template', 'createMarkup');
    requireDependency(deps, 'resolver', 'createSource');
    requireDependency(deps, 'elementsFactory', 'create');

    function mount(mountElement) {
      if (!mountElement || typeof mountElement !== 'object' || Array.isArray(mountElement) ||
          typeof mountElement.querySelectorAll !== 'function' ||
          typeof mountElement.insertAdjacentHTML !== 'function') {
        throw new TypeError('MangaListMountFactory requires mountElement with DOM APIs');
      }
      const existing = mountElement.querySelectorAll('#mangaListSection');
      if (existing.length > 0) {
        throw new TypeError('MangaListMountFactory found existing mangaListSection');
      }
      const markup = deps.template.createMarkup();
      if (typeof markup !== 'string' || markup.length === 0) {
        throw new TypeError('MangaListMountFactory requires non-empty markup');
      }
      mountElement.insertAdjacentHTML('beforeend', markup);
      const roots = mountElement.querySelectorAll('#mangaListSection');
      if (roots.length === 0) {
        throw new TypeError('MangaListMountFactory requires inserted mangaListSection');
      }
      if (roots.length > 1) {
        throw new TypeError('MangaListMountFactory found duplicate mangaListSection');
      }
      const rootElement = roots[0];
      const source = deps.resolver.createSource(rootElement);
      const elements = deps.elementsFactory.create(source);
      return Object.freeze({ root: rootElement, elements });
    }

    return Object.freeze({ mount });
  }

  root.MangaListMountFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
