(function (root) {
  'use strict';

  function create(deps) {
    if (!deps || typeof deps !== 'object') {
      throw new TypeError('MangaListSmartListEventsFactory requires dependency object');
    }
    for (const name of ['onHistory', 'onUnread']) {
      if (typeof deps[name] !== 'function') {
        throw new TypeError('MangaListSmartListEventsFactory requires function: ' + name);
      }
    }

    let bound = false;
    let cleaned = false;

    function bind(elements) {
      if (bound || cleaned) {
        throw new TypeError('MangaListSmartListEventsFactory bind instance is already used');
      }
      if (!elements || typeof elements !== 'object') {
        throw new TypeError('MangaListSmartListEventsFactory requires smart list buttons');
      }
      const { historyButton, unreadButton } = elements;
      for (const [name, button] of Object.entries({ historyButton, unreadButton })) {
        if (!button || typeof button.addEventListener !== 'function' || typeof button.removeEventListener !== 'function') {
          throw new TypeError('MangaListSmartListEventsFactory requires event methods: ' + name);
        }
      }

      function handleHistoryClick() {
        deps.onHistory();
      }
      function handleUnreadClick() {
        deps.onUnread();
      }

      historyButton.addEventListener('click', handleHistoryClick);
      unreadButton.addEventListener('click', handleUnreadClick);
      bound = true;

      return function cleanup() {
        if (cleaned) return;
        historyButton.removeEventListener('click', handleHistoryClick);
        unreadButton.removeEventListener('click', handleUnreadClick);
        cleaned = true;
      };
    }

    return Object.freeze({ bind });
  }

  root.MangaListSmartListEventsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
