(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MangaReaderAuthorSummary = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const list = (value) => Array.isArray(value) ? value : [];

  function buildAuthorSummary(card, items, videos) {
    const names = card ? [card.name, card.circleName].filter(Boolean).map(String) : [];
    const relatedItems = list(items).filter((item) => names.includes(String(item && item.author || '').trim()));
    const series = [...new Set(relatedItems.map((item) => item && item.series).filter(Boolean))];
    const tags = [...new Set(relatedItems.flatMap((item) => list(item && item.tags).filter(Boolean)))];
    const recentItems = relatedItems.slice().sort((a, b) => (Number(b.lastReadAt) || 0) - (Number(a.lastReadAt) || 0));
    return { relatedItems, series, tags, videos: list(videos).filter((video) => video && video.title), recentItems };
  }

  return { buildAuthorSummary };
});
