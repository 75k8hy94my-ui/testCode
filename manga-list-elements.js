(function (root) {
  'use strict';

  const ELEMENT_KEYS = [
    'listBackBtn', 'listFolderTitle', 'listNewFolderBtn', 'listNewFolderRow',
    'editShelfBtn', 'bulkEditBtn', 'undoBulkEditBtn', 'savedListItems',
    'savedListEmpty', 'bookshelfPagination', 'bookshelfPrevBtn',
    'bookshelfNextBtn', 'bookshelfPageLabel', 'smartListRow', 'historyListBtn',
    'unreadListBtn', 'groupAuthorBtn', 'dashboard',
  ];

  function create(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError('MangaListElementsFactory requires source object');
    }
    for (const key of ELEMENT_KEYS) {
      if (source[key] === undefined || source[key] === null) {
        throw new TypeError('MangaListElementsFactory requires element: ' + key);
      }
    }
    const boundary = {};
    for (const key of ELEMENT_KEYS) boundary[key] = source[key];
    return Object.freeze(boundary);
  }

  root.MangaListElementsFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
