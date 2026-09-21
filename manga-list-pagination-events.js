(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object' || typeof deps.onPageChange !== 'function') {
      throw new TypeError('MangaListPaginationEventsFactory requires function: onPageChange');
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListPaginationEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListPaginationEventsFactory requires button elements');
      }
      const { prevButton, nextButton } = elements;
      if (!prevButton || typeof prevButton.addEventListener !== 'function' || typeof prevButton.removeEventListener !== 'function') {
        throw new TypeError('MangaListPaginationEventsFactory requires prevButton event methods');
      }
      if (!nextButton || typeof nextButton.addEventListener !== 'function' || typeof nextButton.removeEventListener !== 'function') {
        throw new TypeError('MangaListPaginationEventsFactory requires nextButton event methods');
      }

      function handlePreviousPage() {
        deps.onPageChange(-1);
      }

      function handleNextPage() {
        deps.onPageChange(1);
      }

      prevButton.addEventListener('click', handlePreviousPage);
      nextButton.addEventListener('click', handleNextPage);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        prevButton.removeEventListener('click', handlePreviousPage);
        nextButton.removeEventListener('click', handleNextPage);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListPaginationEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
