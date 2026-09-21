(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object' || typeof deps.onBack !== 'function') {
      throw new TypeError('MangaListNavigationEventsFactory requires function: onBack');
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListNavigationEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListNavigationEventsFactory requires backButton');
      }
      const { backButton } = elements;
      if (!backButton || typeof backButton.addEventListener !== 'function' || typeof backButton.removeEventListener !== 'function') {
        throw new TypeError('MangaListNavigationEventsFactory requires backButton event methods');
      }

      function handleBackClick() {
        deps.onBack();
      }

      backButton.addEventListener('click', handleBackClick);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        backButton.removeEventListener('click', handleBackClick);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListNavigationEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
