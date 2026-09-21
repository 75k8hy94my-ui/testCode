(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListFilterEventsFactory requires dependency object');
    }
    for (const name of ['onToggle', 'onApply', 'onClear']) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListFilterEventsFactory requires function: ' + name);
      }
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListFilterEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListFilterEventsFactory requires button elements');
      }
      const { filterButton, applyButton, clearButton } = elements;
      for (const [name, button] of Object.entries({ filterButton, applyButton, clearButton })) {
        if (!button || typeof button.addEventListener !== 'function' || typeof button.removeEventListener !== 'function') {
          throw new TypeError('MangaListFilterEventsFactory requires event methods: ' + name);
        }
      }

      function handleToggleClick() {
        deps.onToggle();
      }
      function handleApplyClick() {
        deps.onApply();
      }
      function handleClearClick() {
        deps.onClear();
      }

      filterButton.addEventListener('click', handleToggleClick);
      applyButton.addEventListener('click', handleApplyClick);
      clearButton.addEventListener('click', handleClearClick);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        filterButton.removeEventListener('click', handleToggleClick);
        applyButton.removeEventListener('click', handleApplyClick);
        clearButton.removeEventListener('click', handleClearClick);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListFilterEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
