(function (global) {
  'use strict';

  const TRACKING_PARAMETERS = /^(?:fbclid|gclid|msclkid|mc_cid|mc_eid|_ga|_gl)$/i;

  function text(node) {
    return String(node?.textContent || '').trim();
  }

  function normalizeSourceUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'momon-ga.com' || url.username || url.password || url.port || !/^\/fanzine\/mo\d+\/$/.test(url.pathname)) return '';
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/^utm_/i.test(key) || TRACKING_PARAMETERS.test(key)) url.searchParams.delete(key);
      }
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function parsePageUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      const match = /^\/galleries\/(\d+)\/([1-9]\d*)\.webp$/.exec(url.pathname);
      if (url.protocol !== 'https:' || !/^z\d+\.momon-ga\.me$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !match) return null;
      const number = Number(match[2]);
      if (!Number.isSafeInteger(number)) return null;
      return { url: url.href, galleryId: match[1], number };
    } catch (_) {
      return null;
    }
  }

  function extract(documentRef, pageUrl) {
    const errors = [];
    const title = text(documentRef?.querySelector('h1'));
    if (!title) errors.push('タイトルを取得できませんでした');

    const canonical = documentRef?.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const sourceUrl = normalizeSourceUrl(canonical) || normalizeSourceUrl(pageUrl) || '';
    if (!sourceUrl) errors.push('作品ページURLが不正です');

    const metadata = Object.create(null);
    const metadataRoot = documentRef?.querySelector('#post-tag');
    if (!metadataRoot) errors.push('作品メタデータが見つかりません');
    for (const section of metadataRoot?.querySelectorAll('.post-tag-table') || []) {
      const label = text(section.querySelector('.post-tag-title'));
      if (!label) continue;
      const values = Array.from(section.querySelectorAll('.post-tags a'), text).filter(Boolean);
      metadata[label] = values;
    }

    const authors = metadata['作者'] || [];
    const author = authors[0] || '';
    if (!author) errors.push('作者情報が見つかりません');
    if (authors.length > 1) errors.push('複数の作者が見つかりました。登録前に確認してください');
    const circleName = metadata['サークル']?.[0] || '';
    if (!circleName) errors.push('サークル情報が見つかりません');
    const sourceWork = metadata['パロディ']?.[0] || '';
    if (!sourceWork) errors.push('元作品情報が見つかりません');
    const tags = [...new Set(metadata['内容'] || [])];
    if (!tags.length) errors.push('内容タグが見つかりません');

    const images = documentRef?.querySelectorAll('#post-hentai img') || [];
    const pages = [];
    const seen = new Set();
    let galleryId = '';
    let invalidPageList = images.length === 0;
    if (!images.length) errors.push('ページ画像が見つかりません');
    for (let index = 0; index < images.length; index += 1) {
      const page = parsePageUrl(images[index].getAttribute('src'));
      if (!page) {
        errors.push('許可されていない画像URLです');
        invalidPageList = true;
        continue;
      }
      if (seen.has(page.url)) {
        errors.push('ページ画像URLが重複しています');
        invalidPageList = true;
      }
      if (galleryId && galleryId !== page.galleryId) {
        errors.push('複数のgalleryが混在しています');
        invalidPageList = true;
      }
      if (page.number !== index + 1) {
        errors.push('ページURLに欠落または順序の誤りがあります');
        invalidPageList = true;
      }
      galleryId = galleryId || page.galleryId;
      seen.add(page.url);
      pages.push(page.url);
    }

    return {
      candidate: {
        schemaVersion: 1,
        title,
        author,
        circleName,
        tags,
        sourceWork,
        sourceUrl,
        pages: invalidPageList ? [] : pages,
        fallbackPagePattern: null,
      },
      errors,
    };
  }

  global.MomonGaExtractor = Object.freeze({ extract });
})(typeof self !== 'undefined' ? self : globalThis);
