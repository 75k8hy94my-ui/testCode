(function (root) {
  'use strict';

  function readArray(storage, key) {
    try {
      const value = JSON.parse(storage.getItem(key) || '[]');
      return value;
    } catch (error) {
      return [];
    }
  }

  root.MangaListState = Object.freeze({
    load({ storage, keys }) {
      return {
        savedFolders: readArray(storage, keys.savedFolders),
        savedItems: readArray(storage, keys.savedItems),
        authorCards: readArray(storage, keys.authorCards)
      };
    }
  });
})(typeof self !== 'undefined' ? self : this);
