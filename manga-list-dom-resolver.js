(function (root) {
  'use strict';

  const REQUIRED_IDS = [
    'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
    'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
    'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
    'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
    'unreadListBtn', 'groupAuthorBtn', 'dashboard',
  ];

  function createSource(rootElement) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') {
      throw new TypeError('MangaListDomResolver requires root with querySelectorAll');
    }
    const source = {};
    for (const id of REQUIRED_IDS) {
      const matches = rootElement.querySelectorAll('#' + id);
      if (matches.length === 0) {
        throw new TypeError('MangaListDomResolver requires element: ' + id);
      }
      if (matches.length > 1) {
        throw new TypeError('MangaListDomResolver found duplicate element: ' + id);
      }
      source[id] = matches[0];
    }
    return source;
  }

  root.MangaListDomResolver = Object.freeze({ createSource });
})(typeof self !== 'undefined' ? self : this);
