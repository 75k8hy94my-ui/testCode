(() => {
  'use strict';

  const DEFAULT_MAX_ENTRIES = 8;
  const DEFAULT_MAX_CONCURRENT = 3;
  const DEFAULT_TIMEOUT_MS = 15000;

  function preloadWindow(centerPage, pageCount, direction = 'next') {
    const center = Math.max(1, Math.floor(Number(centerPage) || 1));
    const count = Math.max(0, Math.floor(Number(pageCount) || 0));
    const sign = direction === 'prev' ? -1 : 1;
    const candidates = [center, center + sign, center - sign, center + sign * 2, center + sign * 3, center - sign * 2];
    const result = [...new Set(candidates.filter((page) => page >= 1 && page <= count))];
    for (let distance = 3; result.length < Math.min(6, count) && distance <= count; distance++) {
      const fallback = center + sign * distance;
      if (fallback >= 1 && fallback <= count && !result.includes(fallback)) result.push(fallback);
    }
    for (let distance = 3; result.length < Math.min(6, count) && distance <= count; distance++) {
      const fallback = center - sign * distance;
      if (fallback >= 1 && fallback <= count && !result.includes(fallback)) result.push(fallback);
    }
    return result;
  }

  function create(dependencies = {}) {
    const ImageConstructor = dependencies.Image;
    if (typeof ImageConstructor !== 'function') throw new TypeError('ReaderImageLoader requires Image');
    const maxEntries = Math.max(1, Number(dependencies.maxEntries) || DEFAULT_MAX_ENTRIES);
    const maxConcurrent = Math.max(1, Number(dependencies.maxConcurrent) || DEFAULT_MAX_CONCURRENT);
    const timeoutMs = Math.max(1, Number(dependencies.timeoutMs) || DEFAULT_TIMEOUT_MS);
    const nextPaint = dependencies.nextPaint || (() => new Promise((resolve) => setTimeout(resolve, 0)));
    const entries = new Map();
    const queue = [];
    const activeEntries = new Set();
    const retained = new Set();
    let windowWanted = new Set();
    let activeCount = 0;
    let sequence = 0;
    let destroyed = false;

    function touch(entry) { entry.lastUsed = ++sequence; }
    function trim() {
      while (entries.size > maxEntries) {
        const candidate = [...entries.values()]
          .filter((entry) => entry.status !== 'loading' && !retained.has(entry.url))
          .sort((a, b) => a.lastUsed - b.lastUsed)[0];
        if (!candidate) {
          const activeCandidate = [...activeEntries]
            .filter((entry) => !retained.has(entry.url) && !windowWanted.has(entry.url))
            .sort((a, b) => a.priority - b.priority || b.order - a.order)[0];
          if (!activeCandidate) return;
          const image = activeCandidate.image;
          entries.delete(activeCandidate.url);
          settle(activeCandidate, 'failed', Object.assign(new Error('Image request left the active cache window'), { name: 'AbortError' }));
          try { if (image) image.src = ''; } catch (_) {}
          continue;
        }
        entries.delete(candidate.url);
      }
    }
    function settle(entry, status, value) {
      if (entry.settled) return;
      entry.settled = true;
      clearTimeout(entry.timer);
      if (entry.image) {
        entry.image.removeEventListener?.('load', entry.onLoad);
        entry.image.removeEventListener?.('error', entry.onError);
      }
      entry.status = status;
      entry.error = status === 'failed' ? value : null;
      if (status === 'ready') entry.image = value;
      if (entry.started) activeCount = Math.max(0, activeCount - 1);
      activeEntries.delete(entry);
      touch(entry);
      if (status === 'ready') entry.resolve(value);
      else entry.reject(value);
      trim();
      pump();
    }
    async function finishLoaded(entry) {
      if (entry.settled) return;
      const image = entry.image;
      if (!image || !(image.naturalWidth > 0) || !(image.naturalHeight > 0)) {
        settle(entry, 'failed', new Error(`Image dimensions unavailable: ${entry.url}`));
        return;
      }
      try {
        if (typeof image.decode === 'function') await image.decode();
        await nextPaint();
      } catch (error) {
        settle(entry, 'failed', error instanceof Error ? error : new Error(`Image decode failed: ${entry.url}`));
        return;
      }
      if (!entry.settled && !destroyed) settle(entry, 'ready', image);
    }
    function pump() {
      if (destroyed) return;
      queue.sort((a, b) => b.priority - a.priority || a.order - b.order);
      if (activeCount >= maxConcurrent && queue[0]?.priority >= 1000) {
        const victim = [...activeEntries].filter((entry) => entry.priority < 1000).sort((a, b) => a.priority - b.priority || b.order - a.order)[0];
        if (victim) {
          const image = victim.image;
          entries.delete(victim.url);
          settle(victim, 'failed', Object.assign(new Error('Preload yielded to a visible page request'), { name: 'AbortError' }));
          try { if (image) image.src = ''; } catch (_) {}
        }
      }
      while (activeCount < maxConcurrent && queue.length) {
        const entry = queue.shift();
        if (entry.settled || entries.get(entry.url) !== entry) continue;
        entry.started = true;
        activeCount++;
        activeEntries.add(entry);
        try {
          const image = new ImageConstructor();
          entry.image = image;
          image.decoding = 'async';
          entry.onLoad = () => { finishLoaded(entry); };
          entry.onError = () => settle(entry, 'failed', new Error(`Image load failed: ${entry.url}`));
          image.addEventListener('load', entry.onLoad, { once: true });
          image.addEventListener('error', entry.onError, { once: true });
          entry.timer = setTimeout(() => {
            try { image.src = ''; } catch (_) {}
            settle(entry, 'failed', new Error(`Image load timed out: ${entry.url}`));
          }, entry.timeoutMs);
          image.src = entry.url;
        } catch (error) {
          settle(entry, 'failed', error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
    function sourceMatches(entry, url) {
      const source = entry.image && (entry.image.currentSrc || entry.image.src);
      if (source === url) return true;
      try { return !!source && source === new URL(url, dependencies.baseUrl).href; } catch (_) { return false; }
    }
    function load(url, priority = 1000, requestTimeoutMs = timeoutMs) {
      const key = String(url || '');
      if (!key) return Promise.reject(new TypeError('Image URL is required'));
      if (destroyed) return Promise.reject(new Error('ReaderImageLoader is destroyed'));
      let entry = entries.get(key);
      if (entry && entry.status === 'ready' && !sourceMatches(entry, key)) {
        entries.delete(key);
        entry = null;
      }
      if (entry) {
        touch(entry);
        if (entry.status === 'ready') return Promise.resolve(entry.image);
        if (entry.status === 'failed') return Promise.reject(entry.error);
        entry.priority = Math.max(entry.priority, Number(priority) || 0);
        pump();
        return entry.promise;
      }
      let resolvePromise, rejectPromise;
      const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
      entry = { url: key, status: 'loading', image: null, error: null, promise, resolve: resolvePromise, reject: rejectPromise, settled: false, started: false, priority: Number(priority) || 0, order: ++sequence, lastUsed: sequence, timer: null, timeoutMs: Math.max(1, Number(requestTimeoutMs) || timeoutMs) };
      entries.set(key, entry);
      queue.push(entry);
      trim();
      pump();
      return promise;
    }
    function retry(url, priority = 1000) {
      const key = String(url || '');
      const current = entries.get(key);
      if (current && current.status !== 'failed') return load(key, priority);
      if (current) entries.delete(key);
      return load(key, priority);
    }
    function retain(urls = []) {
      retained.clear();
      for (const url of urls) if (url) retained.add(String(url));
      trim();
    }
    function scheduleWindow(urls = []) {
      const candidates = [...new Set(urls.map((url) => String(url || '')).filter(Boolean))];
      const protectedUrls = candidates.filter((url) => retained.has(url));
      const ordered = [...new Set([...protectedUrls, ...candidates.filter((url) => !retained.has(url))])].slice(0, maxEntries);
      const wanted = new Set(ordered);
      windowWanted = wanted;
      for (const entry of queue.slice()) {
        if (wanted.has(entry.url)) continue;
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
        entries.delete(entry.url);
        settle(entry, 'failed', Object.assign(new Error('Image request is no longer in the preload window'), { name: 'AbortError' }));
      }
      ordered.forEach((url, index) => { load(url, ordered.length - index).catch(() => {}); });
      trim();
    }
    function getState(url) {
      const entry = entries.get(String(url || ''));
      return entry ? { status: entry.status, image: entry.status === 'ready' ? entry.image : null, error: entry.error } : { status: 'idle', image: null, error: null };
    }
    function snapshot() {
      return {
        activeCount,
        queuedCount: queue.length,
        entries: [...entries.values()].map((entry) => ({ url: entry.url, status: entry.status, priority: entry.priority, retained: retained.has(entry.url), lastUsed: entry.lastUsed })),
      };
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const entry of entries.values()) {
        if (entry.status === 'loading') {
          try { if (entry.image) entry.image.src = ''; } catch (_) {}
          settle(entry, 'failed', new Error('ReaderImageLoader destroyed'));
        }
      }
      queue.length = 0;
      activeEntries.clear();
      retained.clear();
      windowWanted.clear();
      entries.clear();
    }
    return Object.freeze({ load, retry, retain, scheduleWindow, getState, snapshot, destroy });
  }

  const api = Object.freeze({ create, preloadWindow });
  if (typeof self !== 'undefined') self.ReaderImageLoaderFactory = api;
  if (typeof window !== 'undefined') window.ReaderImageLoaderFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
