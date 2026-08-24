(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MangaReaderShelfSearch = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function values(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function buildSearchText(item, folders, videos, authorCards) {
    const current = item || {};
    const folder = values(folders).find((entry) => entry && entry.id === current.folderId);
    const relatedAuthors = values(authorCards).filter((card) => card && (card.name === current.author || card.circleName === current.author));
    const tags = values(current.tags).join(' ');
    const links = relatedAuthors.flatMap((card) => values(card.links).map((link) => link && link.url)).join(' ');
    const videoTitles = values(videos).map((video) => video && video.title).join(' ');
    return [current.title, current.author, current.circleName, current.series, current.sourceWork, tags, folder && folder.name, links, videoTitles].map(text).join(' ');
  }

  return { buildSearchText };
});
