(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListFolderEventsFactory requires dependency object');
    }
    for (const name of ['onCreateStart', 'onCreateConfirm']) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListFolderEventsFactory requires function: ' + name);
      }
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListFolderEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListFolderEventsFactory requires folder buttons');
      }
      const { createButton, confirmButton } = elements;
      for (const [name, button] of Object.entries({ createButton, confirmButton })) {
        if (!button || typeof button.addEventListener !== 'function' || typeof button.removeEventListener !== 'function') {
          throw new TypeError('MangaListFolderEventsFactory requires event methods: ' + name);
        }
      }

      function handleCreateStartClick() {
        deps.onCreateStart();
      }
      function handleCreateConfirmClick() {
        deps.onCreateConfirm();
      }

      createButton.addEventListener('click', handleCreateStartClick);
      confirmButton.addEventListener('click', handleCreateConfirmClick);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        createButton.removeEventListener('click', handleCreateStartClick);
        confirmButton.removeEventListener('click', handleCreateConfirmClick);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListFolderEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
