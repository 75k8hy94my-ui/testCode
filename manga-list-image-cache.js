(function (root) {
  'use strict';

  const DB_NAME = 'mangaReaderImageCache';
  const DB_VERSION = 2;
  const STORE_NAME = 'images';
  const CACHE_LIMIT = 500 * 1024 * 1024;

  function create(deps) {
    if (!deps || typeof deps !== 'object' || Array.isArray(deps)) {
      throw new TypeError('MangaListImageCacheFactory requires dependency object');
    }
    for (const name of ['indexedDB', 'urlApi', 'fetch', 'readStorageItem', 'recordTransferEstimate']) {
      if (!deps[name] || typeof deps[name] !== 'object' && typeof deps[name] !== 'function') {
        throw new TypeError('MangaListImageCacheFactory requires dependency: ' + name);
      }
    }
    if (typeof deps.urlApi.createObjectURL !== 'function') {
      throw new TypeError('MangaListImageCacheFactory requires urlApi.createObjectURL');
    }
    if (typeof deps.fetch !== 'function' || typeof deps.readStorageItem !== 'function' || typeof deps.recordTransferEstimate !== 'function') {
      throw new TypeError('MangaListImageCacheFactory requires callable image dependencies');
    }
    if (typeof deps.sessionKey !== 'string' || !deps.sessionKey) {
      throw new TypeError('MangaListImageCacheFactory requires sessionKey');
    }

    let dbPromise = null;

    function userId() {
      try {
        const session = JSON.parse(deps.readStorageItem(deps.sessionKey) || 'null');
        return session && session.user && session.user.id ? session.user.id : 'anonymous';
      } catch (_) {
        return 'anonymous';
      }
    }

    function cacheKey(path) {
      return userId() + ':' + path;
    }

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = deps.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (request.result.objectStoreNames.contains(STORE_NAME)) request.result.deleteObjectStore(STORE_NAME);
          request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    }

    async function read(path) {
      try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(cacheKey(path));
          request.onsuccess = () => {
            const value = request.result || null;
            if (value) {
              value.lastAccessedAt = Date.now();
              store.put(value);
            }
            resolve(value);
          };
          request.onerror = () => reject(request.error);
        });
      } catch (_) {
        return null;
      }
    }

    async function prune() {
      try {
        const db = await openDb();
        const rows = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const request = tx.objectStore(STORE_NAME).getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => reject(request.error);
        });
        let total = rows.reduce((sum, row) => sum + (row.size || 0), 0);
        rows.sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));
        if (total <= CACHE_LIMIT) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          rows.some((row) => {
            if (total <= CACHE_LIMIT) return true;
            store.delete(row.key);
            total -= row.size || 0;
            return false;
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (_) {}
    }

    async function write(path, blob) {
      try {
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put({
            key: cacheKey(path), path, userId: userId(), blob,
            size: blob.size || 0, lastAccessedAt: Date.now()
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        await prune();
      } catch (_) {}
    }

    async function loadCachedLocalImage(config, token, path, estimatedBytes) {
      const cached = await read(path);
      if (cached && cached.blob) return deps.urlApi.createObjectURL(cached.blob);
      if (!deps.recordTransferEstimate(estimatedBytes)) {
        throw new Error('本日の画像通信量上限に達したため、画像取得を停止しました。');
      }
      const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
      const signResponse = await deps.fetch(config.url + '/storage/v1/object/sign/local-manga/' + encodedPath, {
        method: 'POST',
        headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!signResponse.ok) throw new Error('Storage画像の署名URLを取得できませんでした（HTTP ' + signResponse.status + '）。');
      const signData = await signResponse.json();
      const signedPath = signData.signedURL || signData.signedUrl || '';
      if (!signedPath) throw new Error('Storage画像の署名URLが空です。');
      const signedUrl = /^https?:\/\//i.test(signedPath)
        ? signedPath
        : config.url + (signedPath.startsWith('/storage/v1') ? signedPath : '/storage/v1' + (signedPath.startsWith('/') ? signedPath : '/' + signedPath));
      const response = await deps.fetch(signedUrl);
      if (!response.ok) throw new Error('画像本体を取得できませんでした（HTTP ' + response.status + '）。');
      const blob = await response.blob();
      await write(path, blob);
      return deps.urlApi.createObjectURL(blob);
    }

    return Object.freeze({ loadCachedLocalImage });
  }

  root.MangaListImageCacheFactory = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : this);
