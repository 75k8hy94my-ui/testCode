(function (root) {
  'use strict';

  function activityTime(item) {
    return Number(item.updatedAt || item.addedAt || 0) || 0;
  }

  function rank(item) {
    return [
      item.lastReadAt ? 0 : 100,
      item.favorite ? 20 : 0,
      activityTime(item),
    ];
  }

  function compare(a, b) {
    const left = rank(a);
    const right = rank(b);
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return right[i] - left[i];
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function chooseFallback(items, options) {
    const config = options || {};
    const history = new Set(Array.isArray(config.history) ? config.history : []);
    const candidates = (Array.isArray(items) ? items : []).filter((item) => {
      if (!item || item.id === config.currentId || Array.isArray(item.pages)) return false;
      if (config.localReaderEnabled === false && item.localSync) return false;
      return true;
    });
    if (!candidates.length) return null;
    const fresh = candidates.filter((item) => !history.has(item.id));
    return (fresh.length ? fresh : candidates).slice().sort(compare)[0] || null;
  }

  root.MangaReaderRecommendations = { chooseFallback };
}(typeof window !== 'undefined' ? window : globalThis));
