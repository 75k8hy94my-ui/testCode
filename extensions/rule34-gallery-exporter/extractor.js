(function (root) {
  'use strict';

  const MAX_IMAGES = 2000;
  const MAX_LIST_PAGES = 48;
  const PAGE_SIZE = 42;

  function listUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'rule34.xxx' ||
        url.username || url.password || url.port ||
        url.searchParams.get('page') !== 'post' || url.searchParams.get('s') !== 'list') {
      throw new Error('rule34.xxx の画像一覧（検索結果）ページを開いてください。');
    }
    url.hash = '';
    return url;
  }

  function toThumbnail(raw, pageUrl) {
    try {
      const rawUrl = String(raw || '').trim().replace(/&amp;/g, '&').replace(/\\\//g, '/');
      if (!rawUrl || /\s/.test(rawUrl)) return '';
      const url = new URL(rawUrl, pageUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'wimg.rule34.xxx' ||
          url.username || url.password || url.port) return '';
      const match = url.pathname.match(/^\/+(?:samples|thumbnails)\/+([0-9]+)\/+(?:sample_|thumbnail_)([a-f0-9]{32,64})\.(?:jpe?g|png|webp|avif|gif)$/i);
      if (!match) return '';
      url.pathname = '/thumbnails/' + match[1] + '/thumbnail_' + match[2].toLowerCase() + '.jpg';
      url.hash = '';
      return url.href;
    } catch (_) { return ''; }
  }

  function imageUrls(documentRef, pageUrl) {
    const seen = new Set();
    const pages = [];
    for (const thumb of documentRef.querySelectorAll('#post-list .image-list .thumb')) {
      const candidates = [];
      for (const img of thumb.querySelectorAll('img')) {
        for (const attribute of ['src', 'data-src', 'data-original', 'data-url']) {
          const value = img.getAttribute(attribute);
          if (value) candidates.push(value);
        }
      }
      for (const link of thumb.querySelectorAll('a[href]')) {
        candidates.push(link.getAttribute('href'));
      }
      for (const candidate of candidates) {
        const image = toThumbnail(candidate, pageUrl);
        if (!image) continue;
        if (!seen.has(image)) {
          seen.add(image);
          pages.push(image);
        }
        break;
      }
    }
    return pages;
  }

  function describe(documentRef, pageUrl) {
    const url = listUrl(pageUrl);
    const tags = (documentRef.querySelector('input[name="tags"]')?.value ||
                  url.searchParams.get('tags') || '').trim().replace(/\s+/g, ' ');
    const artist = Array.from(documentRef.querySelectorAll('#tag-sidebar .tag-type-artist a[href]'))
      .find(link => /(?:[?&])tags=/.test(link.getAttribute('href') || ''));
    const pid = Number(url.searchParams.get('pid') || 0);
    if (!Number.isSafeInteger(pid) || pid < 0 || pid % PAGE_SIZE !== 0) {
      throw new Error('画像一覧のページ番号が正しくありません。');
    }
    const sourceUrl = new URL(url.href);
    sourceUrl.searchParams.delete('pid');
    return {
      sourceKey: sourceUrl.href,
      sourceUrl: sourceUrl.href,
      title: 'Rule34 - ' + (tags || '画像一覧'),
      author: artist?.textContent?.trim() || '不明',
      tags: tags ? [tags.slice(0, 200)] : [],
      pid,
      pages: imageUrls(documentRef, url.href),
    };
  }

  function lastPageOffset(documentRef, currentPid, pageUrl) {
    let last = currentPid;
    for (const link of documentRef.querySelectorAll('#paginator a[href]')) {
      try {
        const url = new URL(link.getAttribute('href'), pageUrl);
        const pid = Number(url.searchParams.get('pid'));
        if (url.origin === new URL(pageUrl).origin && Number.isSafeInteger(pid) &&
            pid >= 0 && pid % PAGE_SIZE === 0) last = Math.max(last, pid);
      } catch (_) {}
    }
    return last;
  }

  async function collect(documentRef, pageUrl, { allPages = false, fetchPage = root.fetch?.bind(root), parseHtml } = {}) {
    const current = describe(documentRef, pageUrl);
    if (!current.pages.length) throw new Error('このページの画像一覧から画像URLを取得できませんでした。');
    const maxOffset = allPages ? lastPageOffset(documentRef, current.pid, pageUrl) : current.pid;
    const pageCount = allPages ? maxOffset / PAGE_SIZE + 1 : 1;
    if (pageCount > MAX_LIST_PAGES) {
      throw new Error('対象の一覧が48ページを超えています。ページ単位で追加してください。');
    }
    const batches = [];
    const source = new URL(current.sourceUrl);
    const parseDocument = parseHtml || (html => new DOMParser().parseFromString(html, 'text/html'));
    for (let offset = allPages ? 0 : current.pid; offset <= maxOffset; offset += PAGE_SIZE) {
      let result;
      if (offset === current.pid) {
        result = current;
      } else {
        if (typeof fetchPage !== 'function') throw new Error('他ページを取得できる環境ではありません。');
        const next = new URL(source.href);
        if (offset) next.searchParams.set('pid', String(offset));
        const response = await fetchPage(next.href, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('一覧の取得に失敗しました（' + response.status + '）。');
        const html = await response.text();
        result = describe(parseDocument(html), next.href);
      }
      if (!result.pages.length) throw new Error('一覧の' + (offset / PAGE_SIZE + 1) + 'ページ目に画像がありません。');
      batches.push({ pid: offset, pages: result.pages });
      if (batches.reduce((total, batch) => total + batch.pages.length, 0) > MAX_IMAGES) {
        throw new Error('画像が2000件を超えています。ページ単位で分けてください。');
      }
    }
    return { ...current, batches, pages: undefined };
  }

  root.TestCodeRule34GalleryExtractor = Object.freeze({
    MAX_IMAGES, MAX_LIST_PAGES, PAGE_SIZE, listUrl, toThumbnail, imageUrls,
    describe, lastPageOffset, collect,
  });
})(typeof self !== 'undefined' ? self : globalThis);
