(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object' || typeof deps.onSortChange !== 'function') {
      throw new TypeError('MangaListSortEventsFactory requires function: onSortChange');
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListSortEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListSortEventsFactory requires sortSelect');
      }
      const { sortSelect } = elements;
      if (!sortSelect || typeof sortSelect.addEventListener !== 'function' || typeof sortSelect.removeEventListener !== 'function') {
        throw new TypeError('MangaListSortEventsFactory requires sortSelect event methods');
      }

      function handleSortChange(event) {
        deps.onSortChange(event.target.value);
      }

      sortSelect.addEventListener('change', handleSortChange);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        sortSelect.removeEventListener('change', handleSortChange);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListSortEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
