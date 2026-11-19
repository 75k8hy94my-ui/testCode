(() => {
  'use strict';

  const IMAGE_PATH = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;
  const MAX_HASH_PAGE = 2000;
  const EMBED_COVER_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 340">' +
    '<rect width="240" height="340" rx="18" fill="#1b2432"/>' +
    '<rect x="36" y="94" width="168" height="126" rx="12" fill="#344154" stroke="#76899d" stroke-width="3"/>' +
    '<path d="M36 124h168" stroke="#76899d" stroke-width="3"/>' +
    '<circle cx="54" cy="109" r="5" fill="#ff8d77"/><circle cx="70" cy="109" r="5" fill="#f6ce7b"/>' +
    '<circle cx="86" cy="109" r="5" fill="#86cba1"/>' +
    '<text x="120" y="175" fill="#f4f6f9" font-size="25" font-family="sans-serif" font-weight="700" text-anchor="middle">WEB</text>' +
    '<text x="120" y="259" fill="#bcc8d6" font-size="15" font-family="sans-serif" text-anchor="middle">埋め込みページ</text></svg>'
  );

  const REMOTE_COVER_URL = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 340">' +
    '<rect width="240" height="340" rx="18" fill="#1b2432"/>' +
    '<rect x="36" y="94" width="168" height="126" rx="12" fill="#344154" stroke="#76899d" stroke-width="3"/>' +
    '<path d="M36 124h168" stroke="#76899d" stroke-width="3"/>' +
    '<circle cx="54" cy="109" r="5" fill="#ff8d77"/><circle cx="70" cy="109" r="5" fill="#f6ce7b"/>' +
    '<circle cx="86" cy="109" r="5" fill="#86cba1"/>' +
    '<text x="120" y="175" fill="#f4f6f9" font-size="24" font-family="sans-serif" font-weight="700" text-anchor="middle">REMOTE</text>' +
    '<text x="120" y="259" fill="#bcc8d6" font-size="15" font-family="sans-serif" text-anchor="middle">外部画像リーダー</text></svg>'
  );

  function safeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4096) return '';
    try {
      const parsed = new URL(value.trim());
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return '';
      return parsed.href;
    } catch (_) { return ''; }
  }

  function isDirectImageUrl(value) {
    const href = safeHttpUrl(value);
    return !!href && IMAGE_PATH.test(new URL(href).pathname);
  }

  const MAX_SEQUENCE_PAGE = 2000;
  function parsePageRange(startValue, endValue) {
    const bound = (value, label) => {
      if (value == null || String(value).trim() === '') return null;
      const text = String(value).trim();
      if (!/^[0-9]+$/.test(text)) throw new Error(label + 'は1～2000の整数で入力してください。');
      const number = Number(text);
      if (!Number.isSafeInteger(number) || number < 1 || number > MAX_SEQUENCE_PAGE)
        throw new Error(label + 'は1～2000の整数で入力してください。');
      return number;
    };
    const start = bound(startValue, '開始ページ') ?? 1;
    const end = bound(endValue, '終了ページ');
    if (end != null && end < start) throw new Error('終了ページは開始ページ以上にしてください。');
    return { start, end };
  }
  function getPageRange(item) {
    try { return parsePageRange(item?.pageRangeStart, item?.pageRangeEnd); }
    catch (_) { return { start: 1, end: null }; }
  }
  function isHitomiGalleryUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || !['hitomi.la', 'www.hitomi.la'].includes(url.hostname) ||
          url.username || url.password || url.port || url.hash) return false;
      return /^\/(?:reader|galleries)\/\d{1,12}\.html$/.test(url.pathname) ||
        /^\/imageset\/[^/]+-\d{1,12}\.html$/.test(url.pathname);
    } catch (_) { return false; }
  }
  function supportsPageRange(url) {
    const href = safeHttpUrl(url);
    if (!href) return false;
    if (href.endsWith('#1') || isHitomiGalleryUrl(href)) return true;
    return /\/[^/]*\d+[^/]*\.(?:jpe?g|png|webp|avif|gif)$/i.test(new URL(href).pathname);
  }

  // A source is a complete alternative location for one work, NOT a page in a
  // numbered image list. All locations have equal standing in saved metadata.
  function getSourceUrls(item) {
    const values = Array.isArray(item?.sourceUrls) && item.sourceUrls.length
      ? item.sourceUrls : [item?.url];
    const seen = new Set();
    return values.map(safeHttpUrl).filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }
  function sourcePriority(url) {
    return url.endsWith('#1') || isHitomiGalleryUrl(url) ? 1 : isDirectImageUrl(url) ? 0 : 2;
  }
  function getSourceCandidates(item) {
    return getSourceUrls(item).sort((a, b) => sourcePriority(a) - sourcePriority(b));
  }

  // Probe likely first-page image files before treating a directory-like URL
  // as an embedded web page. Group by zero-padding width so a normal /1.webp
  // is tried before speculative /01.webp, /001.webp and /0001.webp.
  function getDirectoryImageCandidates(value) {
    const href = safeHttpUrl(value);
    if (!href || href.endsWith('#1') || isDirectImageUrl(href)) return [];
    const parsed = new URL(href);
    const last = parsed.pathname.split('/').pop();
    if (last && /\.[a-z0-9]{1,8}$/i.test(last)) return [];
    if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
    parsed.hash = '';
    return [1, 2, 3, 4].map((width) => {
      const filename = String(1).padStart(width, '0');
      return ['webp', 'jpg', 'jpeg', 'png', 'avif', 'gif'].map((ext) => {
        const candidate = new URL(parsed.href);
        candidate.pathname += filename + '.' + ext;
        return candidate.href;
      });
    });
  }

  function hasPageList(item) {
    return (Array.isArray(item?.pageManifest?.pages) && item.pageManifest.pages.length > 0 && item.pageManifest.version === 1)
      || (Array.isArray(item?.pages) && item.pages.length > 0);
  }

  // Hash-page works are identified solely by the URL's exact trailing "#1".
  // Explicit image lists and local/encrypted works remain authoritative.
  function getHashPageBase(item) {
    if (!item || typeof item !== 'object' || item.localSync || item.encryptedAssets?.pages?.length || hasPageList(item)) return '';
    const href = safeHttpUrl(item.url);
    return href.endsWith('#1') ? href.slice(0, -2) : '';
  }

  function hashPageUrl(base, page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_HASH_PAGE) return '';
    const href = safeHttpUrl(base);
    if (!href) return '';
    const parsed = new URL(href);
    parsed.hash = '';
    return parsed.href + '#' + page;
  }

  function getEmbedUrl(item) {
    if (!item || typeof item !== 'object' || item.localSync || item.encryptedAssets?.pages?.length || hasPageList(item)) return '';
    const href = safeHttpUrl(item.url);
    // Remote galleries use dynamic page-image discovery, never a generic web iframe.
    if (isHitomiGalleryUrl(href)) return '';
    return href && (getHashPageBase(item) || !isDirectImageUrl(href)) ? href : '';
  }

  const api = Object.freeze({ safeHttpUrl, isDirectImageUrl, getSourceUrls, getSourceCandidates, sourcePriority, getDirectoryImageCandidates, hasPageList, getHashPageBase, hashPageUrl, MAX_HASH_PAGE, MAX_SEQUENCE_PAGE, parsePageRange, getPageRange, supportsPageRange, isHitomiGalleryUrl, getEmbedUrl, EMBED_COVER_URL, REMOTE_COVER_URL });
  if (typeof self !== 'undefined') self.MangaSourceType = api;
  if (typeof window !== 'undefined') window.MangaSourceType = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
