(function (root) {
  'use strict';

  function create(options) {
    const settings = options || {};
    const urlApi = settings.urlApi || root.URL;
    const maxSources = Number.isInteger(settings.maxSources) && settings.maxSources > 0 ? settings.maxSources : 256;
    const maxLocalCovers = Number.isInteger(settings.maxLocalCovers) && settings.maxLocalCovers > 0 ? settings.maxLocalCovers : 80;
    const sources = new Map();
    const localCovers = new Map();

    function touch(map, key) {
      const value = map.get(key);
      if (value === undefined) return undefined;
      map.delete(key);
      map.set(key, value);
      return value;
    }
    function getSource(key) { return touch(sources, key) || ''; }
    function rememberSource(key, source) {
      sources.delete(key);
      if (source) sources.set(key, String(source));
      while (sources.size > maxSources) sources.delete(sources.keys().next().value);
    }
    function getLocalCover(key) { return touch(localCovers, key) || ''; }
    function revoke(url) { try { if (urlApi && typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url); } catch (_) {} }
    function rememberLocalCover(key, url) {
      const previous = localCovers.get(key);
      if (previous && previous !== url) revoke(previous);
      localCovers.delete(key);
      if (url) localCovers.set(key, String(url));
      while (localCovers.size > maxLocalCovers) {
        const oldest = localCovers.keys().next().value;
        revoke(localCovers.get(oldest));
        localCovers.delete(oldest);
      }
    }
    function clear() {
      for (const url of localCovers.values()) revoke(url);
      localCovers.clear();
      sources.clear();
    }
    function snapshot() { return Object.freeze({ sources: sources.size, localCovers: localCovers.size }); }

    return Object.freeze({ getSource, rememberSource, getLocalCover, rememberLocalCover, clear, snapshot, getSourceCache: () => sources });
  }

  const api = Object.freeze({ create });
  root.MangaListCoverCacheFactory = api;
  if (!root.MangaListCoverCache) {
    root.MangaListCoverCache = create({ urlApi: root.URL });
    if (root.document && typeof root.document.addEventListener === 'function') {
      root.document.addEventListener('manga-reader-vpn-status', (event) => {
        if (!event || !event.detail || event.detail.status !== 'allowed') root.MangaListCoverCache.clear();
      });
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
