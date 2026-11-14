(function (root) {
  'use strict';
  function cleaned(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function section(description, name) {
    const text = String(description || '');
    const label = '【' + name + '】';
    const start = text.indexOf(label);
    if (start < 0) return '';
    const rest = text.slice(start + label.length);
    const end = rest.search(/【(?:パロディ|サークル|作者|タグ)】/);
    return cleaned((end < 0 ? rest : rest.slice(0, end)).replace(/^[\s:：|｜・]+|[\s|｜・]+$/g, ''));
  }
  function normalizedImageUrl(raw, pageUrl) {
    try {
      const input = String(raw || '').replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
      if (!input || /\s/.test(input)) return '';
      const candidate = new URL(input, pageUrl);
      if (candidate.protocol !== 'https:' || candidate.username || candidate.password || !/\/1\.webp$/i.test(candidate.pathname)) return '';
      candidate.hash = '';
      return candidate.href;
    } catch (_) { return ''; }
  }
  function findFirstPage(meta, pageUrl) {
    if (!meta) return '';
    const candidates = [];
    for (const el of [meta, ...meta.querySelectorAll('*')]) {
      for (const name of ['href', 'src', 'data-src', 'data-url', 'data-original']) {
        const value = el.getAttribute?.(name);
        if (value) candidates.push(value);
      }
    }
    candidates.push(meta.textContent || '', meta.innerHTML || '');
    const pattern = /(?:https?:\/\/|\/\/|\/(?!\/))[^\s"'<>]*?\/1\.webp(?:\?[^\s"'<>]*)?|\/1\.webp(?:\?[^\s"'<>]*)?/gi;
    for (const entry of candidates) {
      const direct = normalizedImageUrl(entry, pageUrl);
      if (direct) return direct;
      const value = String(entry).replace(/\\\//g, '/').replace(/&amp;/g, '&');
      for (const match of value.matchAll(pattern)) {
        const url = normalizedImageUrl(match[0], pageUrl);
        if (url) return url;
      }
    }
    return '';
  }
  function extract(documentRef, pageUrl) {
    const title = cleaned(documentRef?.querySelector('title')?.textContent);
    const imageUrl = findFirstPage(documentRef?.querySelector('#post-meta'), pageUrl);
    const description = documentRef?.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const author = section(description, '作者');
    const errors = [];
    if (!title) errors.push('<title>の文字列が見つかりません。');
    if (!documentRef?.querySelector('#post-meta')) errors.push('#post-meta がありません。');
    else if (!imageUrl) errors.push('#post-meta 内に有効な HTTPS の /1.webp URL がありません。');
    if (!author) errors.push('description 内に【作者】の情報がありません。');
    let sourceUrl = '';
    try {
      const source = new URL(pageUrl);
      if (source.protocol === 'https:' && !source.username && !source.password) {
        source.hash = '';
        sourceUrl = source.href;
      }
    } catch (_) {}
    if (!sourceUrl) errors.push('元ページのURLがHTTPSではありません。');
    return {
      ok: !errors.length,
      errors,
      item: {
        title, author, url: imageUrl, sourceUrl,
        circleName: section(description, 'サークル'),
        sourceWork: section(description, 'パロディ'),
        tags: section(description, 'タグ').split(/[,、，\n]+/).map(cleaned).filter(Boolean),
      },
    };
  }
  root.TestCodeMangaJsonExtractor = Object.freeze({ section, findFirstPage, extract });
})(typeof self !== 'undefined' ? self : globalThis);
