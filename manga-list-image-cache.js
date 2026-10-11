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
    for (const name of ['indexedDB', 'urlApi', 'fetch', 'readStorageItem', 'remoteAccess', 'mediaAccess', 'crypto', 'getEncryptionKey']) {
      if (!deps[name] || typeof deps[name] !== 'object' && typeof deps[name] !== 'function') {
        throw new TypeError('MangaListImageCacheFactory requires dependency: ' + name);
      }
    }
    if (typeof deps.urlApi.createObjectURL !== 'function') {
      throw new TypeError('MangaListImageCacheFactory requires urlApi.createObjectURL');
    }
    if (typeof deps.fetch !== 'function' || typeof deps.readStorageItem !== 'function' || typeof deps.getEncryptionKey !== 'function' || typeof deps.remoteAccess.runRemoteRead !== 'function') {
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

    function cacheKey(path, ownerId) {
      return ownerId + ':' + path;
    }

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = deps.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((error) => { dbPromise = null; throw error; });
      return dbPromise;
    }

    async function read(path, ownerId, rawKey) {
      try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(cacheKey(path, ownerId));
          request.onsuccess = async () => {
            let value = request.result || null;
            if (value && value.encrypted && value.iv && value.ciphertext) {
              try {
                const legacyNumericArrays = Array.isArray(value.iv) || Array.isArray(value.ciphertext);
                if (legacyNumericArrays) {
                  value.iv = new Uint8Array(value.iv);
                  value.ciphertext = new Uint8Array(value.ciphertext);
                }
                const key = await deps.crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
                const plain = await deps.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(value.iv) }, key, new Uint8Array(value.ciphertext));
                value.blob = new Blob([plain], { type: value.type || 'application/octet-stream' });
              } catch (_) { value = null; }
            } else if (value && value.blob) {
              store.delete(value.key);
              value = null;
            }
            if (value && value.encrypted) {
              value.lastAccessedAt = Date.now();
              const touch = db.transaction(STORE_NAME, 'readwrite'); touch.objectStore(STORE_NAME).put(value);
            }
            resolve(value);
          };
          request.onerror = () => reject(request.error);
        });
      } catch (_) {
        return null;
      }
    }

    let cachedBytes = null;
    async function prune() {
      try {
        const db = await openDb();
        if (cachedBytes === null) {
          const initial = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly'); const request = tx.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
          });
          cachedBytes = initial.reduce((sum, row) => sum + (row.size || 0), 0);
        }
        let total = cachedBytes;
        if (total <= CACHE_LIMIT) return;
        const rows = await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly'); const request = tx.objectStore(STORE_NAME).getAll();
          request.onsuccess = () => resolve(request.result || []); request.onerror = () => reject(request.error);
        });
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
          cachedBytes = total;
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (_) {}
    }

    async function write(path, blob, ownerId, rawKey) {
      try {
        const db = await openDb();
        const key = await deps.crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
        const iv = deps.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await deps.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
        if (userId() !== ownerId || deps.getEncryptionKey() !== rawKey) return;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const previous = store.get(cacheKey(path, ownerId));
          previous.onsuccess = () => {
            if (cachedBytes !== null) cachedBytes = Math.max(0, cachedBytes - (previous.result?.size || 0)) + (blob.size || 0);
            store.put({
            key: cacheKey(path, ownerId), path, userId: ownerId, encrypted: true,
            // IndexedDB structured-clones typed arrays as compact binary data.
            // Keep legacy numeric-array rows readable in read(), but never
            // expand new ciphertext into boxed JavaScript numbers.
            iv: new Uint8Array(iv), ciphertext: new Uint8Array(ciphertext), type: blob.type || 'application/octet-stream',
            size: blob.size || 0, lastAccessedAt: Date.now()
            });
          };
          previous.onerror = () => reject(previous.error);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        await prune();
      } catch (_) {}
    }

    async function loadCachedLocalImage(config, token, path, estimatedBytes, expectedUserId) {
      const ownerId = String(expectedUserId || userId());
      const rawKey = deps.getEncryptionKey();
      if (!ownerId || ownerId === 'anonymous' || userId() !== ownerId || !deps.mediaAccess.canReadProtectedData()) throw new Error('Image cache access or session changed');
      const cached = rawKey ? await read(path, ownerId, rawKey) : null;
      if (userId() !== ownerId || !deps.mediaAccess.canReadProtectedData() || (rawKey && deps.getEncryptionKey() !== rawKey)) throw new Error('Image cache access or session changed');
      if (cached && cached.blob) return deps.urlApi.createObjectURL(cached.blob);
      const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
      return deps.remoteAccess.runRemoteRead({ estimatedBytes: Math.max(1, Number(estimatedBytes) || 1), kind: 'preview', transferStorage: root.localStorage, mediaAccess: deps.mediaAccess }, async ({ signal, recordObserved }) => {
        if (!deps.mediaAccess.canReadProtectedData() || userId() !== ownerId) throw new Error('Image access or session changed');
        const signResponse = await deps.fetch(config.url + '/storage/v1/object/sign/local-manga/' + encodedPath, {
          method: 'POST', signal,
          headers: { apikey: config.publishableKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresIn: 3600 })
        });
        if (!signResponse.ok) throw new Error('Storage画像の署名URLを取得できませんでした（HTTP ' + signResponse.status + '）。');
        const signData = await signResponse.json();
        if (!deps.mediaAccess.canReadProtectedData() || userId() !== ownerId || (rawKey && deps.getEncryptionKey() !== rawKey)) throw new Error('Image access or session changed');
        const signedPath = signData.signedURL || signData.signedUrl || '';
        if (!signedPath) throw new Error('Storage画像の署名URLが空です。');
        const signedUrl = /^https?:\/\//i.test(signedPath) ? signedPath : config.url + (signedPath.startsWith('/storage/v1') ? signedPath : '/storage/v1' + (signedPath.startsWith('/') ? signedPath : '/' + signedPath));
        const response = await deps.fetch(signedUrl, { signal });
        if (!response.ok) throw new Error('画像本体を取得できませんでした（HTTP ' + response.status + '）。');
        const blob = await response.blob();
        if (!deps.mediaAccess.canReadProtectedData() || userId() !== ownerId) throw new Error('Image access or session changed');
        recordObserved(blob.size || 0);
        if (rawKey && deps.getEncryptionKey() === rawKey) await write(path, blob, ownerId, rawKey);
        return deps.urlApi.createObjectURL(blob);
      });
    }

    async function clearUserCache(ownerId) {
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite'); const store = tx.objectStore(STORE_NAME); const request = store.getAll();
        request.onsuccess = () => (request.result || []).forEach(row => { if (row.userId === ownerId) store.delete(row.key); });
        request.onerror = () => reject(request.error); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    }
    return Object.freeze({ loadCachedLocalImage, clearUserCache });
  }

  root.MangaListImageCacheFactory = Object.freeze({ create, clearUserCache(indexedDB, ownerId) {
    const helper = create({ indexedDB, urlApi: URL, fetch: root.fetch.bind(root), readStorageItem: () => null, sessionKey: 'unused', remoteAccess: { runRemoteRead() {} }, mediaAccess: {}, crypto: root.crypto, getEncryptionKey: () => null });
    return helper.clearUserCache(ownerId);
  } });
})(typeof self !== 'undefined' ? self : this);
