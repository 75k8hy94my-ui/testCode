(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionRuleLocator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizePathPattern(input) {
    const value = String(input || '').trim();
    if (!value) return '/*';
    try {
      if (/^https?:\/\//i.test(value)) return new URL(value).pathname || '/';
    } catch (_) {}
    const withoutHash = value.split('#', 1)[0];
    const withoutQuery = withoutHash.split('?', 1)[0];
    return withoutQuery.startsWith('/') ? withoutQuery : '/' + withoutQuery;
  }

  function escapeRegex(value) {
    return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }

  function matchPathPattern(pattern, pathname) {
    const normalized = normalizePathPattern(pattern);
    const expression = '^' + normalized.split('*').map(escapeRegex).join('.*') + '$';
    return new RegExp(expression).test(String(pathname || '/'));
  }

  function specificity(rule) {
    const pattern = normalizePathPattern(rule && rule.urlPattern);
    const wildcards = (pattern.match(/\*/g) || []).length;
    return [pattern.replace(/\*/g, '').length, -wildcards];
  }

  function selectBestRule(rules, pageUrl) {
    let url;
    try { url = new URL(pageUrl); } catch (_) { return null; }
    const matching = (Array.isArray(rules) ? rules : []).filter((rule) => {
      return rule && rule.origin === url.origin && matchPathPattern(rule.urlPattern, url.pathname);
    });
    matching.sort((a, b) => {
      const sa = specificity(a), sb = specificity(b);
      if (sa[0] !== sb[0]) return sb[0] - sa[0];
      if (sa[1] !== sb[1]) return sb[1] - sa[1];
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    return matching[0] || null;
  }

  return { normalizePathPattern, matchPathPattern, selectBestRule };
});