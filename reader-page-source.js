(() => {
  'use strict';
  const EXTENSIONS = Object.freeze(['jpg', 'jpeg', 'png', 'webp']);
  function parseSequentialSource(url, item = {}, baseHref = globalThis.location?.href || 'https://reader.invalid/') {
    try {
      const parsed = new URL(String(url || '').trim(), baseHref);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      const match = parsed.pathname.match(/^(.*\/)([^/]*?)(\d+)([^/]*)\.([a-z0-9]+)$/i);
      let width = Math.max(1, Number(item.numberWidth) || Number(item.pagePattern?.width) || 1);
      let pattern = item.pagePattern || null;
      if (match) {
        width = Math.max(width, match[3].length);
        let prefix = match[2];
        if (!match[4] && match[3].length >= 7 && /[^0-9]/.test(prefix)) { prefix += match[3].slice(0, -3); width = 3; }
        if (!pattern && (prefix || match[4])) pattern = { prefix, suffix: match[4], width };
        parsed.pathname = match[1];
      } else parsed.pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
      const query = parsed.search;
      parsed.search = ''; parsed.hash = '';
      return { base: parsed.href, pattern, width, ...(query ? { query } : {}) };
    } catch (_) { return null; }
  }
  function numbered(source, number, extension) {
    const formatted = String(number).padStart(source.width, '0');
    return `${source.base}${source.pattern?.prefix || ''}${formatted}${source.pattern?.suffix || ''}.${extension}${source.query || ''}`;
  }
  function createLegacyResolver({ probe, maxPages = 2000, extensions = EXTENSIONS, baseHref } = {}) {
    if (typeof probe !== 'function') throw new TypeError('legacy page resolver requires an isolated probe');
    return Object.freeze({ async resolve(item, { signal } = {}) {
      const source = parseSequentialSource(item?.url, item, baseHref);
      if (!source) throw new Error('作品のページURLがありません');
      const pages = [];
      // Existing works often provide the exact first page; trust that link
      // before guessing alternative formats (and keep any required URL query).
      const initialUrl = String(item?.url || '').trim();
      const initialPath = (() => { try { return new URL(initialUrl, baseHref).pathname; } catch (_) { return ''; } })();
      const initialMatch = initialPath.match(/(\d+)(?:[^/]*)\.(jpe?g|png|webp|avif)$/i);
      const initialFormat = initialPath.match(/\.(jpe?g|png|webp|avif)$/i)?.[1]?.toLowerCase();
      const formats = [...new Set([initialFormat, ...extensions].filter(Boolean))];
      for (let number = 1; number <= maxPages; number += 1) {
        if (signal?.aborted) throw Object.assign(new Error('Page discovery cancelled'), { name: 'AbortError' });
        let found = '';
        // The original link is the strongest candidate only when it names page 1.
        const numberedCandidates = formats.map((ext) => numbered(source, number, ext));
        const candidates = number === 1 && initialFormat
          ? initialMatch && Number(initialMatch[1]) !== 1
            ? [...numberedCandidates, initialUrl]
            : [initialUrl, ...numberedCandidates]
          : numberedCandidates;
        for (const candidate of new Set(candidates)) {
          if (await probe(candidate, { signal })) { found = candidate; break; }
          if (signal?.aborted) throw Object.assign(new Error('Page discovery cancelled'), { name: 'AbortError' });
        }
        if (!found) break;
        pages.push(found);
      }
      if (!pages.length) throw new Error('画像を見つけられませんでした');
      return { version: 1, pages, splitSpreads: Boolean(item?.splitSpreads) };
    } });
  }
  function create({ legacyResolver } = {}) {
    async function resolve(item, options = {}) {
      if (!item || typeof item !== 'object') throw new TypeError('saved item required');
      const manifest = item.pageManifest;
      const manifestUrls = manifest?.version === 1 && Array.isArray(manifest.pages) && manifest.pages.length
        ? manifest.pages : null;
      if (manifestUrls) return { item, manifest, urls: manifestUrls.slice(), migrated: false };
      // An empty or invalid cached manifest must never shadow the original pages.
      // Repair only that stale metadata; do not rewrite valid explicit page lists.
      const savedUrls = Array.isArray(item.pages) && item.pages.length ? item.pages : null;
      if (savedUrls) {
        const repaired = { version: 1, pages: savedUrls.slice(), splitSpreads: Boolean(item.splitSpreads) };
        const requiresRepair = manifest != null;
        return {
          item: requiresRepair ? { ...item, pageManifest: repaired } : item,
          manifest: repaired,
          urls: savedUrls.slice(),
          migrated: requiresRepair,
        };
      }
      if (!legacyResolver) throw new Error('作品のページ一覧がありません');
      const migratedManifest = await legacyResolver.resolve(item, options);
      const migratedItem = { ...item, pageManifest: migratedManifest, pages: migratedManifest.pages.slice() };
      return { item: migratedItem, manifest: migratedManifest, urls: migratedManifest.pages.slice(), migrated: true };
    }
    return Object.freeze({ resolve });
  }
  const api = Object.freeze({ EXTENSIONS, parseSequentialSource, numberedPageUrl: numbered, createLegacyResolver, create });
  if (typeof self !== 'undefined') self.ReaderPageSourceFactory = api;
  if (typeof window !== 'undefined') window.ReaderPageSourceFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
