(function (root) {
  'use strict';

  const PAGE_SIZE = 25;

  function derive(items, requestedPage, pageSize = PAGE_SIZE) {
    const list = Array.isArray(items) ? items : [];
    const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : PAGE_SIZE;
    const requested = Number.isFinite(Number(requestedPage)) ? Math.floor(Number(requestedPage)) : 1;
    const totalPages = Math.max(1, Math.ceil(list.length / size));
    const page = Math.min(Math.max(1, requested), totalPages);
    const start = (page - 1) * size;
    return Object.freeze({
      page,
      pageSize: size,
      totalPages,
      items: list.slice(start, start + size),
      hasMultiplePages: totalPages > 1,
    });
  }

  root.VideoLibraryPagination = Object.freeze({ PAGE_SIZE, derive });
})(typeof window !== 'undefined' ? window : globalThis);
