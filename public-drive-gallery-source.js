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

  const api = { folderIdFromInput, makeListUrl, normalizeImage, imageUrls, listPublicImages };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PublicDriveGallery = api;
})(typeof window === 'undefined' ? globalThis : window);
