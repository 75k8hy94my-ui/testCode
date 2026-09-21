(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListBulkEventsFactory requires dependency object');
    }
    for (const name of ['onEdit', 'onUndo']) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListBulkEventsFactory requires function: ' + name);
      }
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) throw new TypeError('MangaListBulkEventsFactory bind instance is already used');
      if (!elements || typeof elements !== 'object') throw new TypeError('MangaListBulkEventsFactory requires bulk buttons');
      const { editButton, undoButton } = elements;
      for (const [name, button] of Object.entries({ editButton, undoButton })) {
        if (!button || typeof button.addEventListener !== 'function' || typeof button.removeEventListener !== 'function') {
          throw new TypeError('MangaListBulkEventsFactory requires event methods: ' + name);
        }
      }

      function handleEditClick() { deps.onEdit(); }
      function handleUndoClick() { deps.onUndo(); }
      editButton.addEventListener('click', handleEditClick);
      undoButton.addEventListener('click', handleUndoClick);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        editButton.removeEventListener('click', handleEditClick);
        undoButton.removeEventListener('click', handleUndoClick);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListBulkEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
