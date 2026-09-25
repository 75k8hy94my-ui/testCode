(() => {
  'use strict';

  const DB_NAME = 'mangaReaderEncryptedAssets';
  const STORE_NAME = 'objects';
  const VERSION = 1;
  const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
  const VALID_RETENTION = new Set(['cache', 'pending']);
  const cryptoApi = typeof require === 'function'
    ? require('./encrypted-asset-crypto.js')
    : ((typeof window !== 'undefined' ? window : self)?.EncryptedAssetCrypto || null);

  function idb() {
    const value = globalThis.indexedDB;
    if (!value) throw new Error('IndexedDB is unavailable');
    return value;
  }

  function nonEmptyText(value, name) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new TypeError(`${name} is invalid`);
    return value;
  }

  function revisionValue(value) {
    if (!Number.isInteger(value) || value < 0) throw new TypeError('revision is invalid');
    return value;
  }

  function canonicalObjectId(value) {
    const objectId = nonEmptyText(value, 'objectId');
    if (objectId === 'preview') return objectId;
    if (!/^L(?:0|[1-9]\d*):(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/.test(objectId)) throw new TypeError('objectId is not canonical');
    return objectId;
  }

  function makeCacheKey(assetId, revision, objectId) {
    return `${nonEmptyText(assetId, 'assetId')}\0${revisionValue(revision)}\0${canonicalObjectId(objectId)}`;
  }

  function encryptedBytesValue(value) {
    if (value instanceof Uint8Array) return new Uint8Array(value);
    if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
    throw new TypeError('encryptedBytes must be Uint8Array or ArrayBuffer');
  }

  function validateEncryptedBytes(value) {
    const bytes = encryptedBytesValue(value);
    cryptoApi.validateEncryptedAsset(bytes);
    return bytes;
  }

  function sanitizeRecord(input) {
    if (!input || typeof input !== 'object') throw new TypeError('cache record is invalid');
    const encryptedBytes = validateEncryptedBytes(input.encryptedBytes);
    const assetId = nonEmptyText(input.assetId, 'assetId');
    const revision = revisionValue(input.revision);
    const objectId = canonicalObjectId(input.objectId);
    const retention = input.retention === undefined ? 'cache' : input.retention;
    if (!VALID_RETENTION.has(retention)) throw new TypeError('retention is invalid');
    if (!Number.isInteger(input.storedAt) || input.storedAt < 0) throw new TypeError('storedAt is invalid');
    if (!Number.isInteger(input.lastAccessedAt) || input.lastAccessedAt < 0) throw new TypeError('lastAccessedAt is invalid');
    return {
      cacheKey: makeCacheKey(assetId, revision, objectId),
      assetId,
      revision,
      objectId,
      encryptedBytes,
      encryptedByteLength: encryptedBytes.byteLength,
      storedAt: input.storedAt,
      lastAccessedAt: input.lastAccessedAt,
      retention
    };
  }

  function isPreview(record) { return record.objectId === 'preview'; }

  function objectLevel(record) {
    if (isPreview(record)) return -1;
    return Number(record.objectId.slice(1).split(':')[0]);
  }

  function compareEvictionPriority(a, b) {
    const levelDifference = objectLevel(b) - objectLevel(a);
    if (levelDifference) return levelDifference;
    const accessDifference = a.lastAccessedAt - b.lastAccessedAt;
    if (accessDifference) return accessDifference;
    return a.cacheKey.localeCompare(b.cacheKey);
  }

  function selectEvictionCandidates(records) {
    return records.filter(record => record.retention === 'cache').sort(compareEvictionPriority);
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
  }

  function nowValue(now) {
    const value = now();
    if (!Number.isInteger(value) || value < 0) throw new TypeError('clock must return epoch milliseconds');
    return value;
  }

  function createCache(options = {}) {
    const indexedDB = options.indexedDB || globalThis.indexedDB;
    if (!indexedDB) throw new Error('IndexedDB is unavailable');
    const maxBytes = options.maxBytes === undefined ? DEFAULT_MAX_BYTES : options.maxBytes;
    if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new TypeError('maxBytes is invalid');
    const now = options.now || (() => Date.now());
    let databasePromise;

    function open() {
      if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, VERSION);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        });
      }
      return databasePromise;
    }

    async function allRecords() {
      const database = await open();
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const values = await requestResult(transaction.objectStore(STORE_NAME).getAll());
      return values.map(sanitizeRecord);
    }

    async function replaceRecords(records) {
      const database = await open();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const record of records) store.put(sanitizeRecord(record));
      await transactionDone(transaction);
    }

    async function enforceLimit() {
      const records = await allRecords();
      let bytes = records.reduce((sum, record) => sum + record.encryptedByteLength, 0);
      const candidates = selectEvictionCandidates(records);
      const removed = [];
      const database = await open();
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const candidate of candidates) {
        if (bytes <= maxBytes) break;
        store.delete(candidate.cacheKey);
        bytes -= candidate.encryptedByteLength;
        removed.push(candidate.cacheKey);
      }
      await transactionDone(transaction);
      return { removed, overLimit: bytes > maxBytes };
    }

    return {
      async put(input) {
        const timestamp = nowValue(now);
        const record = sanitizeRecord({ ...input, storedAt: timestamp, lastAccessedAt: timestamp });
        await replaceRecords([record]);
        await enforceLimit();
        return { ...record, encryptedBytes: new Uint8Array(record.encryptedBytes) };
      },
      async get(assetId, revision, objectId) {
        const cacheKey = makeCacheKey(assetId, revision, objectId);
        const database = await open();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const value = await requestResult(transaction.objectStore(STORE_NAME).get(cacheKey));
        if (!value) return null;
        const record = sanitizeRecord(value);
        const touched = { ...record, lastAccessedAt: nowValue(now) };
        await replaceRecords([touched]);
        return { ...touched, encryptedBytes: new Uint8Array(touched.encryptedBytes) };
      },
      async list() { return allRecords(); },
      async getUsage() {
        const records = await allRecords();
        return records.reduce((usage, record) => {
          usage.bytes += record.encryptedByteLength;
          usage.count += 1;
          if (record.retention === 'pending') { usage.pendingBytes += record.encryptedByteLength; usage.pendingCount += 1; }
          return usage;
        }, { bytes: 0, count: 0, pendingBytes: 0, pendingCount: 0 });
      },
      async setRetention(assetId, revision, objectId, retention) {
        if (!VALID_RETENTION.has(retention)) throw new TypeError('retention is invalid');
        const cacheKey = makeCacheKey(assetId, revision, objectId);
        const database = await open();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const current = await requestResult(store.get(cacheKey));
        if (!current) return false;
        store.put(sanitizeRecord({ ...current, retention }));
        await transactionDone(transaction);
        return true;
      },
      async remove(assetId, revision, objectId) {
        const database = await open();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(makeCacheKey(assetId, revision, objectId));
        await transactionDone(transaction);
      },
      async removeAsset(assetId) {
        const target = nonEmptyText(assetId, 'assetId');
        const records = await allRecords();
        const database = await open();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        for (const record of records) if (record.assetId === target) store.delete(record.cacheKey);
        await transactionDone(transaction);
      },
      async enforceLimit() { return enforceLimit(); },
      async clear() {
        const database = await open();
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).clear();
        await transactionDone(transaction);
      },
      async close() {
        if (databasePromise) (await databasePromise).close();
        databasePromise = null;
      }
    };
  }

  const api = { DB_NAME, STORE_NAME, VERSION, DEFAULT_MAX_BYTES, makeCacheKey, sanitizeRecord, compareEvictionPriority, selectEvictionCandidates, createCache };
  if (typeof window !== 'undefined') window.EncryptedAssetCache = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
