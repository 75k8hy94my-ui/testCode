(function (root, factory) {
  const payload = (root && root.MangaVaultPayload)
    || (typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./vault-payload.js') : null);
  const api = factory(root, payload);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoShortsState = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root, Payload) {
  'use strict';

  const STATE_KEY = 'mangaReaderVideoShortsState';
  const VIDEOS_KEY = 'mangaReaderVideos';
  const normalize = (value) => Payload.normalizeVideoShortsState(value);

  function create(options = {}) {
    const storage = Object.prototype.hasOwnProperty.call(options, 'storage')
      ? options.storage
      : (typeof window !== 'undefined' ? window.localStorage : null);
    const accessCheck = typeof options.canReadProtectedData === 'function'
      ? options.canReadProtectedData
      : () => !!root.MangaReaderMediaAccess
        && typeof root.MangaReaderMediaAccess.canReadProtectedData === 'function'
        && root.MangaReaderMediaAccess.canReadProtectedData() === true;
    const guestCheck = typeof options.isGuestMode === 'function'
      ? options.isGuestMode
      : () => !!(root.TestCodeGuest && root.TestCodeGuest.isActive());
    const vault = options.vault || root.MangaVault;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const setTimeoutRef = options.setTimeoutRef || ((callback, delay) => root.setTimeout(callback, delay));
    const clearTimeoutRef = options.clearTimeoutRef || ((id) => root.clearTimeout(id));
    let syncTimer = null;

    function canReadProtectedData() {
      try { return accessCheck() === true; } catch (_) { return false; }
    }

    function isGuestMode() {
      try { return guestCheck() === true; } catch (_) { return false; }
    }

    function readValue(key, fallback) {
      try {
        const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(key)
          : storage && typeof storage.get === 'function' ? storage.get(key)
            : storage && Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    }

    function writeValue(key, value) {
      const raw = JSON.stringify(value);
      if (storage && typeof storage.setItem === 'function') storage.setItem(key, raw);
      else if (storage && typeof storage.set === 'function') storage.set(key, raw);
      else if (storage && typeof storage === 'object') storage[key] = raw;
      else throw new TypeError('保存領域を利用できません。');
    }

    function emit(type, detail) {
      if (!root || typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
      try { root.dispatchEvent(new root.CustomEvent(type, { detail })); } catch (_) {}
    }

    function load() {
      if (!canReadProtectedData()) return null;
      return normalize(readValue(STATE_KEY, Payload.defaults.videoShortsState));
    }

    function scheduleSync() {
      if (isGuestMode() || !vault || typeof vault.saveLocalChanges !== 'function') return;
      clearTimeoutRef(syncTimer);
      syncTimer = setTimeoutRef(async () => {
        syncTimer = null;
        if (!canReadProtectedData() || isGuestMode()) return;
        try {
          if (typeof vault.loadActive === 'function' && !vault.loadActive()) return;
          await vault.saveLocalChanges();
          emit('manga-video-shorts-sync', { status: 'saved' });
        } catch (error) {
          emit('manga-video-shorts-sync', { status: 'pending', message: error && error.message ? error.message : '同期に失敗しました。' });
        }
      }, 450);
    }

    function save(value, saveOptions = {}) {
      if (!canReadProtectedData()) return null;
      const current = load();
      if (!current) return null;
      const candidate = normalize(value);
      if (candidate.revision < current.revision && candidate.updatedAt < current.updatedAt) return current;
      const timestamp = Math.max(Number(now()) || 0, current.updatedAt + 1, candidate.updatedAt);
      const next = normalize({
        ...candidate,
        revision: Math.max(current.revision, candidate.revision) + 1,
        updatedAt: timestamp,
      });
      try { writeValue(STATE_KEY, next); }
      catch (error) { emit('manga-video-shorts-sync', { status: 'error', message: error && error.message ? error.message : '端末に保存できません。' }); return null; }

      let pending = false;
      if (!isGuestMode() && vault && typeof vault.markLocalChangesPending === 'function') {
        try { pending = vault.markLocalChangesPending() === true; } catch (_) {}
      }
      if (saveOptions.sync !== false && pending) scheduleSync();
      emit('manga-video-shorts-state-saved', { state: next, pending });
      return next;
    }

    function reset() {
      if (!canReadProtectedData()) return null;
      const current = load();
      if (!current) return null;
      const videos = readValue(VIDEOS_KEY, []);
      const knownVideoIds = Array.isArray(videos)
        ? [...new Set(videos.map((video) => String(video && video.id || '').trim()).filter(Boolean))]
        : [];
      return save({
        ...current,
        queue: [],
        currentIndex: 0,
        currentTime: 0,
        knownVideoIds,
        generation: current.generation + 1,
        updatedAt: Number(now()) || current.updatedAt,
      });
    }

    function observeVideos(videoIds) {
      if (!canReadProtectedData()) return false;
      const current = load();
      if (!current) return false;
      const ids = [...new Set((Array.isArray(videoIds) ? videoIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
      const known = new Set(current.knownVideoIds);
      if (!ids.some((id) => !known.has(id))) return false;
      const next = save({
        ...current,
        queue: [],
        currentIndex: 0,
        currentTime: 0,
        knownVideoIds: ids,
        generation: current.generation + 1,
        updatedAt: Number(now()) || current.updatedAt,
      });
      return !!next;
    }

    function destroy() {
      clearTimeoutRef(syncTimer);
      syncTimer = null;
    }

    return Object.freeze({ normalize, load, save, reset, observeVideos, destroy });
  }

  const local = create();
  return Object.freeze({ STATE_KEY, normalize, create, load: local.load, save: local.save, reset: local.reset, observeVideos: local.observeVideos, destroy: local.destroy });
}));
