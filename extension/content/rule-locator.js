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

  function cssEscape(value) {
    return String(value || '').replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function looksGeneratedToken(token) {
    const value = String(token || '');
    return /^(?:css|sc|jsx)-?[a-f0-9]{5,}$/i.test(value) || /^[a-f0-9]{10,}$/i.test(value);
  }

  function generateLocatorCandidates(element) {
    if (!element) return [];
    const candidates = [];
    const seen = new Set();
    const push = (selector, kind) => {
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      candidates.push({ selector, kind });
    };
    if (element.id) push('#' + cssEscape(element.id), 'id');
    const attrs = Array.from(element.attributes || []);
    attrs.filter((attr) => /^data-[\w-]+$/i.test(attr.name) && attr.value && attr.value.length <= 120)
      .forEach((attr) => push('[' + attr.name + '=\"' + String(attr.value).replace(/\"/g, '\\\"') + '\"]', 'data'));
    const tag = String(element.tagName || '').toLowerCase() || '*';
    const classes = Array.from(element.classList || []).filter((token) => token && !looksGeneratedToken(token)).slice(0, 3);
    if (classes.length) push(tag + classes.map((token) => '.' + cssEscape(token)).join(''), 'class');
    if (element.parentElement) {
      let nth = 1;
      const siblings = Array.from(element.parentElement.children || []);
      for (const sibling of siblings) {
        if (sibling === element) break;
        if (String(sibling.tagName || '').toLowerCase() === tag) nth += 1;
      }
      push(tag + ':nth-of-type(' + nth + ')', 'nth');
    } else if (tag !== '*') push(tag, 'tag');
    return candidates;
  }

  function resolveLocator(root, candidates) {
    if (!root || typeof root.querySelector !== 'function') return null;
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      try {
        const found = root.querySelector(candidate && candidate.selector);
        if (found) return found;
      } catch (_) {}
    }
    return null;
  }

  return { normalizePathPattern, matchPathPattern, selectBestRule, generateLocatorCandidates, resolveLocator };
});