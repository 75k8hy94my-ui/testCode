(function (root, factory) {
  const locator = root.MangaExtensionRuleLocator || (typeof require === 'function' ? require('./rule-locator.js') : null);
  const api = factory(locator);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MangaExtensionExtractor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (RuleLocator) {
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
    if (!rootNode || !collectionRule || !collectionRule.selector) return [];
    let scope = rootNode;
    if (collectionRule.containerCandidates && RuleLocator && typeof RuleLocator.resolveLocator === 'function') {
      scope = RuleLocator.resolveLocator(rootNode, collectionRule.containerCandidates) || rootNode;
    }
    if (!scope || typeof scope.querySelectorAll !== 'function') return [];
    let nodes = [];
    try { nodes = Array.from(scope.querySelectorAll(collectionRule.selector)); } catch (_) { return []; }
    return dedupeUrls(nodes.map((node) => extractImageUrl(node, baseUrl)).filter(Boolean));
  }

  function inferImageCollection(selectedElement) {
    if (!selectedElement) return { selector: '', count: 0, urls: [], containerCandidates: [] };
    const tag = String(selectedElement.tagName || 'img').toLowerCase();
    const classes = Array.from(selectedElement.classList || []).filter(Boolean).slice(0, 2);
    const selector = tag + classes.map((name) => '.' + String(name).replace(/([^a-zA-Z0-9_-])/g, '\\$1')).join('');
    const baseUrl = selectedElement.ownerDocument && selectedElement.ownerDocument.location ? selectedElement.ownerDocument.location.href : (typeof location !== 'undefined' ? location.href : 'https://invalid.example/');
    let bestScope = selectedElement.parentElement || selectedElement.ownerDocument || null;
    let bestNodes = [selectedElement];
    let scope = bestScope;
    for (let depth = 0; scope && depth < 6; depth += 1, scope = scope.parentElement) {
      if (typeof scope.querySelectorAll !== 'function') continue;
      let nodes = [];
      try { nodes = Array.from(scope.querySelectorAll(selector)); } catch (_) { continue; }
      const valid = nodes.filter((node) => extractImageUrl(node, baseUrl));
      if (valid.length > bestNodes.length) { bestNodes = valid; bestScope = scope; }
      if (valid.length >= 200) break;
    }
    const urls = dedupeUrls(bestNodes.map((node) => extractImageUrl(node, baseUrl)).filter(Boolean));
    const containerCandidates = bestScope && bestScope !== selectedElement.ownerDocument && RuleLocator && typeof RuleLocator.generateLocatorCandidates === 'function'
      ? RuleLocator.generateLocatorCandidates(bestScope) : [];
    return { selector, count: urls.length, urls, containerCandidates };
  }

  function resolveField(rootNode, field) {
    if (!field) return null;
    if (field.candidates && RuleLocator && typeof RuleLocator.resolveLocator === 'function') return RuleLocator.resolveLocator(rootNode, field.candidates);
    if (field.selector && rootNode && typeof rootNode.querySelector === 'function') {
      try { return rootNode.querySelector(field.selector); } catch (_) { return null; }
    }
    return null;
  }

  function extractDraft(rule, rootNode, pageUrl) {
    if (!rule || !rootNode) throw new Error('抽出ルールがありません。');
    const fields = rule.fields || {};
    const draft = { version: 1, sourcePageUrl: String(pageUrl || '') };
    for (const key of ['title', 'author', 'series', 'volume', 'source']) {
      const element = resolveField(rootNode, fields[key]);
      const value = element ? normalizeText(element.textContent) : '';
      if (value) draft[key] = value;
    }
    const tagElement = resolveField(rootNode, fields.tags);
    if (tagElement) {
      const text = normalizeText(tagElement.textContent);
      const tags = text.split(/[、,|\/]+/).map(normalizeText).filter(Boolean);
      if (tags.length) draft.tags = Array.from(new Set(tags));
    }
    if (fields.allPageImages && fields.allPageImages.selector) {
      const pages = extractAllPageUrls(rootNode, fields.allPageImages, pageUrl);
      if (pages.length >= 2) draft.pages = pages;
      else if (pages.length === 1) draft.url = pages[0];
    }
    if (!draft.pages && !draft.url && fields.firstPageImage) {
      const imageElement = resolveField(rootNode, fields.firstPageImage);
      const url = extractImageUrl(imageElement, pageUrl);
      if (url) draft.url = url;
    }
    if (!draft.pages && !draft.url) throw new Error('漫画画像を取得できませんでした。画像要素を登録してください。');
    if (!draft.source) {
      try { draft.source = new URL(pageUrl).hostname; } catch (_) {}
    }
    return draft;
  }

  return { normalizeText, normalizeHttpUrl, extractImageUrl, dedupeUrls, extractAllPageUrls, inferImageCollection, extractDraft };
});