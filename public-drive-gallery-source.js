(function (root) {
  'use strict';
  const ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;
  const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

  function folderIdFromInput(value) {
    const input = String(value || '').trim();
    if (ID_PATTERN.test(input)) return input;
    let url;
    try { url = new URL(input); } catch (_) { return ''; }
    if (url.protocol !== 'https:' || !DRIVE_HOSTS.has(url.hostname)) return '';
    const match = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    const id = match ? match[1] : url.searchParams.get('id');
    return id && ID_PATTERN.test(id) ? id : '';
  }

  function makeListUrl(folderId, apiKey, pageToken = '') {
    if (!ID_PATTERN.test(folderId)) throw new Error('Google DriveのフォルダURLまたはIDが不正です。');
    if (!String(apiKey || '').trim()) throw new Error('Google Drive APIキーを入力してください。');
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', "'" + folderId + "' in parents and trashed = false");
    url.searchParams.set('fields', 'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime)');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set('key', String(apiKey).trim());
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    return url.toString();
  }

  function normalizeImage(file) {
    if (!file || !ID_PATTERN.test(String(file.id || ''))) return null;
    if (typeof file.mimeType !== 'string' || !file.mimeType.startsWith('image/')) return null;
    return {
      id: file.id,
      name: typeof file.name === 'string' && file.name ? file.name : '名前のない画像',
      mimeType: file.mimeType,
      size: file.size || '',
      modifiedTime: file.modifiedTime || '',
    };
  }

  function imageUrls(fileId) {
    if (!ID_PATTERN.test(String(fileId || ''))) throw new Error('不正なファイルIDです。');
    const id = encodeURIComponent(fileId);
    return {
      direct: 'https://lh3.googleusercontent.com/d/' + id,
      thumbnail: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600',
      drive: 'https://drive.google.com/file/d/' + id + '/view'
    };
  }

  async function listPublicImages({ folderId, apiKey, fetcher = fetch, signal, onPage } = {}) {
    const id = folderIdFromInput(folderId);
    if (!id) throw new Error('フォルダのURLまたはIDを正しく入力してください。');
    const images = [];
    const seenFiles = new Set();
    const seenTokens = new Set();
    let pageToken = '';
    let pageCount = 0;
    do {
      const response = await fetcher(makeListUrl(id, apiKey, pageToken), { signal });
      if (!response || !response.ok) {
        let detail = '';
        try {
          const error = await response.json();
          detail = String(error?.error?.message || '').slice(0, 300);
        } catch (_) {}
        const code = response?.status || 0;
        const hint = code === 403 ? '公開設定とAPIキーのHTTPリファラー制限を確認してください。' :
          code === 400 ? 'フォルダIDとAPIキーを確認してください。' : '';
        throw new Error('Google Driveの一覧取得に失敗しました（HTTP ' + code + '）。' + (hint || detail));
      }
      const data = await response.json();
      if (data.incompleteSearch) throw new Error('Google Driveの検索結果が不完全です。再度読み込んでください。');
      if (!Array.isArray(data.files)) throw new Error('Google Driveから予期しない形式の応答がありました。');
      for (const file of data.files) {
        const normalized = normalizeImage(file);
        if (normalized && !seenFiles.has(normalized.id)) {
          seenFiles.add(normalized.id);
          images.push(normalized);
        }
      }
      pageCount += 1;
      if (onPage) onPage({ pageCount, imageCount: images.length });
      const next = data.nextPageToken || '';
      if (next && seenTokens.has(next)) throw new Error('Google Driveのページ送りが重複しました。');
      if (next) seenTokens.add(next);
      pageToken = next;
    } while (pageToken);
    const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
    images.sort((a, b) => collator.compare(a.name, b.name));
    return images;
  }

  // Store only an address book, never image bytes. Links are scoped to one folder and
  // validated against the known Google host before being restored from the Vault.
  const CACHE_VERSION = 1;
  const MAX_CACHE_BYTES = 1500000;
  function cachedImage(file) {
    if (!file || !ID_PATTERN.test(String(file.id || ''))) return null;
    const name = file.name;
    if (typeof name !== 'string' || !name || name.length > 500) return null;
    const expected = imageUrls(file.id).direct;
    if (file.directUrl !== expected) return null;
    return { id: file.id, name, directUrl: expected };
  }
  function normalizeCache(cache, folderId) {
    const id = folderIdFromInput(folderId);
    if (!id || !cache || cache.schemaVersion !== CACHE_VERSION || cache.folderId !== id ||
        typeof cache.updatedAt !== 'string' || !Number.isFinite(Date.parse(cache.updatedAt)) ||
        !Array.isArray(cache.images)) return null;
    if (JSON.stringify(cache).length > MAX_CACHE_BYTES) return null;
    const seen = new Set();
    const images = [];
    for (const file of cache.images) {
      const entry = cachedImage(file);
      if (!entry || seen.has(entry.id)) return null;
      seen.add(entry.id);
      images.push(entry);
    }
    return { schemaVersion: CACHE_VERSION, folderId: id, updatedAt: cache.updatedAt, images };
  }
  function createCache(folderId, images, updatedAt = new Date().toISOString()) {
    const id = folderIdFromInput(folderId);
    if (!id || !Array.isArray(images)) throw new Error('キャッシュする画像一覧が不正です。');
    const cache = {
      schemaVersion: CACHE_VERSION,
      folderId: id,
      updatedAt,
      images: images.map(file => {
        if (!file || !ID_PATTERN.test(String(file.id || ''))) throw new Error('画像IDが不正です。');
        const name = String(file.name || '');
        if (!name || name.length > 500) throw new Error('画像名が不正です。');
        return { id: file.id, name, directUrl: imageUrls(file.id).direct };
      })
    };
    if (new TextEncoder().encode(JSON.stringify(cache)).byteLength > MAX_CACHE_BYTES) {
      throw new Error('画像一覧がキャッシュの保存上限（約1.5MB）を超えました。画像は表示できますが、同期キャッシュには保存しません。');
    }
    const normalized = normalizeCache(cache, id);
    if (!normalized) throw new Error('画像一覧をキャッシュできませんでした。');
    return normalized;
  }
  async function loadGallery({ folderId, apiKey, cache = null, forceRefresh = false, fetcher, signal, onPage } = {}) {
    const cached = normalizeCache(cache, folderId);
    if (cached && !forceRefresh) return { images: cached.images, cache: cached, source: 'cache' };
    const images = await listPublicImages({ folderId, apiKey, fetcher, signal, onPage });
    return { images, cache: null, source: 'drive' };
  }

  const api = { folderIdFromInput, makeListUrl, normalizeImage, imageUrls, listPublicImages, createCache, normalizeCache, loadGallery, MAX_CACHE_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PublicDriveGallery = api;
})(typeof window === 'undefined' ? globalThis : window);
