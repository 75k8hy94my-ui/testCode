(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoData = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const WATCH_STATUSES = new Set(['', 'later', 'watching', 'watched']);
  const asText = (value) => String(value == null ? '' : value).trim();
  const asTime = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  function parseTags(value) {
    const source = Array.isArray(value) ? value : asText(value).split(/[,、]/);
    const seen = new Set();
    const result = [];
    source.forEach((raw) => {
      const tag = asText(raw);
      const key = tag.toLocaleLowerCase('ja');
      if (!tag || seen.has(key)) return;
      seen.add(key);
      result.push(tag);
    });
    return result;
  }

  function legacyUrl(a, b) {
    const service = asText(a);
    const id = asText(b);
    return service && id ? `https://www.${service}.com/v/${encodeURIComponent(id)}` : '';
  }

  function normalizeVideo(value, now = Date.now()) {
    const x = value && typeof value === 'object' ? value : {};
    const a = asText(x.a);
    const b = asText(x.b);
    const addedAt = asTime(x.addedAt || x.createdAt, now);
    const updatedAt = asTime(x.updatedAt, addedAt);
    const watchStatus = WATCH_STATUSES.has(asText(x.watchStatus)) ? asText(x.watchStatus) : '';
    return {
      id: asText(x.id) || `v-${Math.random().toString(36).slice(2)}-${now}`,
      title: asText(x.title),
      url: asText(x.url) || legacyUrl(a, b),
      a,
      b,
      folderId: asText(x.folderId) || null,
      tags: parseTags(x.tags),
      favorite: x.favorite === true,
      memo: asText(x.memo),
      thumbnailUrl: asText(x.thumbnailUrl),
      watchStatus,
      progressSeconds: x.progressSeconds == null ? null : asTime(x.progressSeconds, 0),
      durationSeconds: x.durationSeconds == null ? null : asTime(x.durationSeconds, 0),
      openCount: Math.max(0, Math.trunc(asTime(x.openCount, 0))),
      lastOpenedAt: x.lastOpenedAt == null ? null : asTime(x.lastOpenedAt, 0),
      addedAt,
      updatedAt,
    };
  }

  function normalizeVideos(value) {
    return Array.isArray(value) ? value.map((item) => normalizeVideo(item)) : [];
  }

  function normalizeFolders(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const result = [];
    value.forEach((raw) => {
      const x = raw && typeof raw === 'object' ? raw : {};
      const id = asText(x.id);
      const name = asText(x.name);
      if (!id || !name || seen.has(id)) return;
      seen.add(id);
      result.push({ id, name, createdAt: asTime(x.createdAt || x.addedAt, Date.now()) });
    });
    return result;
  }

  function deriveService(url, fallback) {
    try {
      const host = new URL(asText(url)).hostname.toLocaleLowerCase('en-US');
      return host.replace(/^www\./, '') || asText(fallback);
    } catch (_) {
      return asText(fallback);
    }
  }

  function buildSearchText(video, folders) {
    const folderMap = new Map(normalizeFolders(folders).map((folder) => [folder.id, folder.name]));
    const v = normalizeVideo(video);
    return [v.title, v.memo, v.tags.join(' '), folderMap.get(v.folderId) || '', deriveService(v.url, v.a), v.url, v.a, v.b]
      .join(' ')
      .toLocaleLowerCase('ja');
  }

  function filterVideos(videos, options) {
    const config = options || {};
    const query = asText(config.query).toLocaleLowerCase('ja');
    const folderId = asText(config.folderId);
    const tag = asText(config.tag).toLocaleLowerCase('ja');
    const service = asText(config.service).toLocaleLowerCase('ja');
    const quick = asText(config.quick);
    return normalizeVideos(videos).filter((video) => {
      if (query && !buildSearchText(video, config.folders).includes(query)) return false;
      if (folderId && video.folderId !== folderId) return false;
      if (tag && !video.tags.some((item) => item.toLocaleLowerCase('ja') === tag)) return false;
      if (service && deriveService(video.url, video.a).toLocaleLowerCase('ja') !== service) return false;
      if (quick === 'favorite' && !video.favorite) return false;
      if (['later', 'watching', 'watched'].includes(quick) && video.watchStatus !== quick) return false;
      return true;
    });
  }

  function sortVideos(videos, mode) {
    const list = normalizeVideos(videos).slice();
    const selected = asText(mode) || 'recent-added';
    const cmpText = (a, b) => a.title.localeCompare(b.title, 'ja', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
    list.sort((a, b) => {
      if (selected === 'oldest') return a.addedAt - b.addedAt || cmpText(a, b);
      if (selected === 'recent-opened') return (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || b.addedAt - a.addedAt || cmpText(a, b);
      if (selected === 'most-opened') return b.openCount - a.openCount || (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || cmpText(a, b);
      if (selected === 'title') return cmpText(a, b);
      return b.addedAt - a.addedAt || cmpText(a, b);
    });
    return list;
  }

  function removeFolder(folders, videos, folderId) {
    const id = asText(folderId);
    return {
      folders: normalizeFolders(folders).filter((folder) => folder.id !== id),
      videos: normalizeVideos(videos).map((video) => video.folderId === id ? { ...video, folderId: null, updatedAt: Date.now() } : video),
    };
  }

  return { WATCH_STATUSES, parseTags, normalizeVideo, normalizeVideos, normalizeFolders, deriveService, buildSearchText, filterVideos, sortVideos, removeFolder, legacyUrl };
}));
