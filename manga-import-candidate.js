(function (root) {
  'use strict';
  function createSavedItem(candidate, { id, addedAt }) {
    const pages = [...candidate.pages];
    return { id, title: candidate.title, author: candidate.author, circleName: candidate.circleName, sourceWork: candidate.sourceWork, isDoujin: Boolean(candidate.sourceWork), tags: [...candidate.tags], sourceUrl: candidate.sourceUrl, url: pages[0], pages, pageManifest: { version: 1, pages: [...pages], splitSpreads: false }, folderId: null, addedAt };
  }
  function gallery(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !/^z\d+\.momon-ga\.me$/.test(url.hostname)) return null;
      return /^\/galleries\/(\d+)\/[1-9]\d*\.webp$/.exec(url.pathname)?.[1] || null;
    } catch { return null; }
  }
  function firstPage(item) {
    const manifest = item.pageManifest;
    if (manifest?.version === 1 && Array.isArray(manifest.pages)) return manifest.pages[0];
    return item.pages?.[0] || item.url;
  }
  function findDuplicate(candidate, existingItems) {
    const first = candidate.pages?.[0];
    const identity = gallery(first);
    const matches = (existingItems || []).filter(item => (candidate.sourceUrl && item.sourceUrl === candidate.sourceUrl) || (first && firstPage(item) === first) || (identity && identity === gallery(firstPage(item))));
    return { duplicate: matches.length > 0, matches };
  }
  root.MangaImportCandidate = Object.freeze({ createSavedItem, findDuplicate });
})(typeof self !== 'undefined' ? self : globalThis);
