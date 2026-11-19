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

  function matchesVideo(item, id) {
    return item.kind === 'series'
      ? item.videos.some(video => String(video.id) === id)
      : String(item.video.id) === id;
  }

  function containsVideo(items, id) {
    return items.some(item => matchesVideo(item, id));
  }

  function resolveVideoReturn(items, id, requestedPage) {
    const index = items.findIndex(item => matchesVideo(item, id));
    if (index < 0) return null;
    const calculatedPage = Math.floor(index / PAGE_SIZE) + 1;
    const candidate = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : calculatedPage;
    const start = (candidate - 1) * PAGE_SIZE;
    const page = containsVideo(items.slice(start, start + PAGE_SIZE), id) ? candidate : calculatedPage;
    return { page, seriesId: items[index].kind === 'series' ? items[index].id : null };
  }

  root.VideoLibraryPagination = Object.freeze({ PAGE_SIZE, derive, containsVideo, resolveVideoReturn });
})(typeof window !== 'undefined' ? window : globalThis);
