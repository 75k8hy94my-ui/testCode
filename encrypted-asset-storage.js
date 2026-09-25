(() => {
  'use strict';

  const BUCKET = 'vault-assets';

  function bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new TypeError('encrypted bytes must be Uint8Array or ArrayBuffer');
  }

  function encodedPath(path) {
    if (typeof path !== 'string' || !path || path.split('/').some(segment => !segment || segment.includes('..'))) throw new TypeError('storage path is invalid');
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function httpError(response, operation) {
    const error = new Error(`${operation} failed with HTTP ${response.status}`);
    error.status = response.status;
    return error;
  }

  function createStorageTransport({ baseUrl, publishableKey, fetchImpl = globalThis.fetch } = {}) {
    if (typeof baseUrl !== 'string' || !baseUrl) throw new TypeError('baseUrl is required');
    if (typeof publishableKey !== 'string' || !publishableKey) throw new TypeError('publishableKey is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required');
    const root = baseUrl.replace(/\/$/, '');

    async function upload(path, token, encryptedBytes, signal) {
      const response = await fetchImpl(`${root}/storage/v1/object/${BUCKET}/${encodedPath(path)}`, {
        method: 'POST', signal, body: bytes(encryptedBytes),
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }
      });
      if (response.status === 409) return { created: false, exists: true };
      if (!response.ok) throw httpError(response, 'storage upload');
      return { created: true, exists: false };
    }

    async function download(path, token, signal) {
      const response = await fetchImpl(`${root}/storage/v1/object/authenticated/${BUCKET}/${encodedPath(path)}`, {
        method: 'GET', signal, headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }
      });
      if (response.status === 404) return null;
      if (!response.ok) throw httpError(response, 'storage download');
      return new Uint8Array(await response.arrayBuffer());
    }

    return { upload, download };
  }

  const api = { BUCKET, encodedPath, createStorageTransport };
  if (typeof window !== 'undefined') window.EncryptedAssetStorage = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
