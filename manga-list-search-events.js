(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object' || typeof deps.onSearchChange !== 'function') {
      throw new TypeError('MangaListSearchEventsFactory requires function: onSearchChange');
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListSearchEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListSearchEventsFactory requires searchInput');
      }
      const { searchInput } = elements;
      if (!searchInput || typeof searchInput.addEventListener !== 'function' || typeof searchInput.removeEventListener !== 'function') {
        throw new TypeError('MangaListSearchEventsFactory requires searchInput event methods');
      }

      function handleSearchInput(event) {
        deps.onSearchChange(event.target.value);
      }

      searchInput.addEventListener('input', handleSearchInput);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        searchInput.removeEventListener('input', handleSearchInput);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListSearchEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
