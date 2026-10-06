(function (root) {
  'use strict';
  const limits = { title: 500, author: 300, circleName: 300, sourceWork: 300 };
  function source(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'momon-ga.com' || url.port || url.username || url.password || !/^\/fanzine\/mo\d+\/$/.test(url.pathname)) return null;
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(?:fbclid|gclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i.test(key)) url.searchParams.delete(key);
      return url.href;
    } catch { return null; }
  }
  function page(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      const match = /^\/galleries\/(\d+)\/([1-9]\d*)\.webp$/.exec(url.pathname);
      if (url.protocol !== 'https:' || !/^z\d+\.momon-ga\.me$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !match || !Number.isSafeInteger(Number(match[2]))) return null;
      return { gallery: match[1], number: Number(match[2]) };
    } catch { return null; }
  }
  function validateCandidate(candidate) {
    const errors = [];
    if (!candidate || typeof candidate !== 'object' || candidate.schemaVersion !== 1) errors.push('Invalid candidate schema');
    if (candidate && typeof candidate === 'object') {
      for (const [key, limit] of Object.entries(limits)) if (typeof candidate[key] !== 'string' || candidate[key].length > limit || ((key === 'title' || key === 'author') && !candidate[key].trim())) errors.push(`Invalid ${key}`);
      if (!Array.isArray(candidate.tags) || candidate.tags.length > 200 || candidate.tags.some(tag => typeof tag !== 'string' || tag.length > 200)) errors.push('Invalid tags');
      if (!source(candidate.sourceUrl)) errors.push('Invalid source URL');
      if (!Array.isArray(candidate.pages) || !candidate.pages.length || candidate.pages.length > 3000) errors.push('Invalid page list');
      else {
        let gallery;
        const sourceGallery = /^\/fanzine\/mo(\d+)\/$/.exec(source(candidate.sourceUrl) ? new URL(candidate.sourceUrl).pathname : '')?.[1];
        candidate.pages.forEach((value, index) => {
          const parsed = page(value);
          if (!parsed || parsed.number !== index + 1 || (gallery && gallery !== parsed.gallery) || (sourceGallery && parsed.gallery !== sourceGallery)) errors.push(`Invalid page URL at ${index}`);
          if (parsed) gallery = parsed.gallery;
        });
      }
      if (candidate.fallbackPagePattern != null) errors.push('Unsupported fallback page pattern');
    }
    return errors.length ? { ok: false, candidate: null, errors } : { ok: true, candidate: { schemaVersion: 1, title: candidate.title, author: candidate.author, circleName: candidate.circleName, sourceWork: candidate.sourceWork, tags: [...candidate.tags], sourceUrl: source(candidate.sourceUrl), pages: [...candidate.pages], fallbackPagePattern: null }, errors: [] };
  }
  function validateBatch(candidates) {
    if (!Array.isArray(candidates) || candidates.length > 500) return { ok: false, candidates: [], errors: ['Invalid candidate count'] };
    const validated = candidates.map(validateCandidate);
    const errors = validated.flatMap((result, index) => result.errors.map(message => ({ index, message })));
    return { ok: !errors.length, candidates: errors.length ? [] : validated.map(result => result.candidate), errors };
  }
  root.MangaImportValidator = Object.freeze({ validateCandidate, validateBatch });
})(typeof self !== 'undefined' ? self : globalThis);
