(function (root) {
  'use strict';

  const DEPENDENCY_NAMES = ['activateMangaTab', 'activateMangaMobileNav', 'showMangaSection'];

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaSurfaceActivationFactory requires dependency object');
    }
    for (const name of DEPENDENCY_NAMES) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaSurfaceActivationFactory requires function: ' + name);
      }
    }
    for (const name of Object.keys(deps)) {
      if (!DEPENDENCY_NAMES.includes(name)) {
        throw new TypeError('MangaSurfaceActivationFactory does not accept dependency: ' + name);
      }
    }
    return Object.freeze({
      activateMangaTab: deps.activateMangaTab,
      activateMangaMobileNav: deps.activateMangaMobileNav,
      showMangaSection: deps.showMangaSection,
    });
  }

  root.MangaSurfaceActivationFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
