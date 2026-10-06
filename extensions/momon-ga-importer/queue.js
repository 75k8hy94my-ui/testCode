(function (global) {
  'use strict';
  const KEY = 'momonGaImportQueue';
  const MAX_BYTES = 4 * 1024 * 1024;
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  function source(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'momon-ga.com' || url.port || url.username || url.password || !/^\/fanzine\/mo\d+\/$/.test(url.pathname)) throw Error();
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(?:fbclid|gclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i.test(key)) url.searchParams.delete(key);
      return url.href;
    } catch { throw new Error('Invalid source URL'); }
  }
  function validate(candidate) {
    if (!candidate || candidate.schemaVersion !== 1) throw new Error('Invalid candidate schema');
    const sourceUrl = source(candidate.sourceUrl);
    for (const [key, limit] of [['title', 500], ['author', 300], ['circleName', 300], ['sourceWork', 300]]) {
      if (typeof candidate[key] !== 'string' || candidate[key].length > limit) throw new Error(`Invalid ${key}`);
    }
    if (!Array.isArray(candidate.tags) || candidate.tags.length > 200 || candidate.tags.some(tag => typeof tag !== 'string' || tag.length > 200)) throw new Error('Invalid tags');
    if (!Array.isArray(candidate.pages) || !candidate.pages.length) throw new Error('Invalid page list');
    if (candidate.pages.length > 3000) throw new Error('Maximum 3000 pages');
    let gallery;
    candidate.pages.forEach((value, index) => {
      let url;
      try { url = new URL(value); } catch { throw new Error('Invalid page URL'); }
      const match = /^\/galleries\/(\d+)\/([1-9]\d*)\.webp$/.exec(url.pathname);
      if (url.protocol !== 'https:' || !/^z\d+\.momon-ga\.me$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !match || Number(match[2]) !== index + 1 || (gallery && gallery !== match[1])) throw new Error('Invalid page sequence');
      gallery = match[1];
    });
    return { schemaVersion: 1, title: candidate.title, author: candidate.author, circleName: candidate.circleName, sourceWork: candidate.sourceWork, tags: [...candidate.tags], sourceUrl, pages: [...candidate.pages], fallbackPagePattern: null };
  }
  function create({ storage, maxBytes = MAX_BYTES, now = () => Date.now() }) {
    if (!storage?.get || !storage?.set) throw new Error('Storage adapter required');
    let tail = Promise.resolve();
    const mutate = operation => {
      const result = tail.then(operation);
      tail = result.catch(() => {});
      return result;
    };
    const read = async () => {
      const data = await storage.get(KEY);
      return data[KEY] || [];
    };
    const list = async () => { await tail; return read(); };
    return {
      list,
      add(raw, warnings = []) {
        return mutate(async () => {
          const candidate = validate(raw);
          if (!Array.isArray(warnings) || warnings.length > 20 || warnings.some(value => typeof value !== 'string' || value.length > 500)) throw new Error('Invalid warnings');
          const previous = await read();
          const index = previous.findIndex(item => item.candidate.sourceUrl === candidate.sourceUrl);
          if (index < 0 && previous.length >= 500) throw new Error('Maximum 500 works');
          const item = index < 0 ? { queueId: global.crypto.randomUUID(), candidate, addedAt: now(), warnings: [...warnings] } : { ...previous[index], candidate, warnings: [...warnings] };
          const next = [...previous];
          if (index < 0) next.push(item); else next[index] = item;
          if (bytes(next) > maxBytes) throw new Error('Queue serialized size exceeds bytes limit');
          await storage.set({ [KEY]: next });
          return item;
        });
      },
      remove(queueId) {
        return mutate(async () => {
          const previous = await read();
          await storage.set({ [KEY]: previous.filter(item => item.queueId !== queueId) });
        });
      },
      removeMany(queueIds) {
        return mutate(async () => {
          if (!Array.isArray(queueIds) || queueIds.some(id => typeof id !== 'string')) throw new Error('Invalid queue IDs');
          const previous = await read();
          const selected = new Set(queueIds);
          const removed = previous.filter(item => selected.has(item.queueId)).map(item => item.queueId);
          if (removed.length) await storage.set({ [KEY]: previous.filter(item => !selected.has(item.queueId)) });
          return removed;
        });
      },
      clear() { return mutate(() => storage.set({ [KEY]: [] })); },
    };
  }
  global.MomonGaImportQueue = { create };
})(typeof self !== 'undefined' ? self : globalThis);
