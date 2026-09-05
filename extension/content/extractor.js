(function (root, factory) {
  const api = factory(root.MangaExtensionRuleLocator);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionExtractor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalizeHttpUrl(value, baseUrl) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const url = new URL(raw, baseUrl);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (_) { return null; }
  }

  function backgroundUrl(element) {
    let value = element && element.style && element.style.backgroundImage;
    if ((!value || value === 'none') && typeof getComputedStyle === 'function' && element) {
      try { value = getComputedStyle(element).backgroundImage; } catch (_) {}
    }
    const match = String(value || '').match(/url\((['"]?)(.*?)\1\)/i);
    return match ? match[2] : null;
  }

  function extractImageUrl(element, baseUrl) {
    if (!element) return null;
    const current = normalizeHttpUrl(element.currentSrc, baseUrl);
    if (current) return current;
    const src = normalizeHttpUrl(element.src || (element.getAttribute && element.getAttribute('src')), baseUrl);
    if (src) return src;
    const anchor = String(element.tagName || '').toUpperCase() === 'A' ? element : (typeof element.closest === 'function' ? element.closest('a[href]') : null);
    const href = normalizeHttpUrl(anchor && (anchor.href || (anchor.getAttribute && anchor.getAttribute('href'))), baseUrl);
    if (href) return href;
    return normalizeHttpUrl(backgroundUrl(element), baseUrl);
  }

  function dedupeUrls(urls) {
    const seen = new Set();
    const output = [];
    for (const value of Array.isArray(urls) ? urls : []) {
      const url = normalizeHttpUrl(value, value);
      if (url && !seen.has(url)) { seen.add(url); output.push(url); }
    }
    return output;
  }

  function extractAllPageUrls(rootNode, collectionRule, baseUrl) {
    if (!rootNode || typeof rootNode.querySelectorAll !== 'function' || !collectionRule || !collectionRule.selector) return [];
    let nodes = [];
    try { nodes = Array.from(rootNode.querySelectorAll(collectionRule.selector)); } catch (_) { return []; }
    return dedupeUrls(nodes.map((node) => extractImageUrl(node, baseUrl)).filter(Boolean));
  }

  function inferImageCollection(selectedElement) {
    if (!selectedElement) return { selector: '', count: 0, urls: [] };
    const tag = String(selectedElement.tagName || 'img').toLowerCase();
    const classes = Array.from(selectedElement.classList || []).filter(Boolean).slice(0, 2);
    const selector = tag + classes.map((name) => '.' + String(name).replace(/([^a-zA-Z0-9_-])/g, '\\$1')).join('');
    const rootNode = selectedElement.parentElement || (selectedElement.ownerDocument || null);
    let nodes = [];
    try { nodes = rootNode && rootNode.querySelectorAll ? Array.from(rootNode.querySelectorAll(selector)) : [selectedElement]; } catch (_) { nodes = [selectedElement]; }
    const baseUrl = selectedElement.ownerDocument && selectedElement.ownerDocument.location ? selectedElement.ownerDocument.location.href : (typeof location !== 'undefined' ? location.href : 'https://invalid.example/');
    const urls = dedupeUrls(nodes.map((node) => extractImageUrl(node, baseUrl)).filter(Boolean));
    return { selector, count: urls.length, urls };
  }

  return { normalizeText, normalizeHttpUrl, extractImageUrl, dedupeUrls, extractAllPageUrls, inferImageCollection };
});