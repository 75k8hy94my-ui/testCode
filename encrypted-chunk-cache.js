(()=>{
'use strict';

const DB_NAME = 'mangaReaderEncryptedChunks';
const STORE_NAME = 'chunks';
const VERSION = 1;
const ENVELOPE_TYPE = 'manga-reader-encrypted-chunk';

function text(value) { return String(value ?? '').trim(); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.type !== ENVELOPE_TYPE || payload.version !== 1 || !payload.iv || !payload.ciphertext) {
    throw new Error('encrypted payload is invalid');
  }
  return clone(payload);
}

function sanitizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('cache record is invalid');
  const chunkId = text(record.chunkId);
  if (!chunkId) throw new Error('chunkId is required');
  const revision = Number(record.revision ?? 0);
  if (!Number.isInteger(revision) || revision < 0) throw new Error('revision must be a non-negative integer');
  const pendingAction = record.pendingAction == null || record.pendingAction === '' ? null : text(record.pendingAction);
  if (pendingAction && !['upsert', 'delete'].includes(pendingAction)) throw new Error('pendingAction is invalid');
  return {
    chunkId,
    revision,
    updatedAt: record.updatedAt == null ? null : text(record.updatedAt),
    deletedAt: record.deletedAt == null ? null : text(record.deletedAt),
    payload: validatePayload(record.payload),
    pendingAction
  };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(indexedDBImpl = globalThis.indexedDB, dbName = DB_NAME) {
  if (!indexedDBImpl || typeof indexedDBImpl.open !== 'function') return Promise.reject(new Error('IndexedDB is unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(dbName, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'chunkId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
  });
}

async function createCache(options = {}) {
  const db = await openDatabase(options.indexedDBImpl || globalThis.indexedDB, options.dbName || DB_NAME);
  const withStore = (mode, work) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    return { tx, value: work(store) };
  };
  return {
    async put(record) {
      const safe = sanitizeRecord(record);
      const { tx, value } = withStore('readwrite', (store) => requestResult(store.put(safe)));
      await Promise.all([value, transactionDone(tx)]);
      return safe;
    },
    async get(chunkId) {
      const id = text(chunkId);
      if (!id) return null;
      const { tx, value } = withStore('readonly', (store) => requestResult(store.get(id)));
      const [result] = await Promise.all([value, transactionDone(tx)]);
      return result ? sanitizeRecord(result) : null;
    },
    async list() {
      const { tx, value } = withStore('readonly', (store) => requestResult(store.getAll()));
      const [rows] = await Promise.all([value, transactionDone(tx)]);
      return (rows || []).map(sanitizeRecord);
    },
    async remove(chunkId) {
      const id = text(chunkId);
      if (!id) return;
      const { tx, value } = withStore('readwrite', (store) => requestResult(store.delete(id)));
      await Promise.all([value, transactionDone(tx)]);
    },
    async clear() {
      const { tx, value } = withStore('readwrite', (store) => requestResult(store.clear()));
      await Promise.all([value, transactionDone(tx)]);
    },
    close() { db.close(); }
  };
}

async function clearAll(options = {}) {
  const cache = await createCache(options);
  try { await cache.clear(); } finally { cache.close(); }
}

const api = { DB_NAME, STORE_NAME, VERSION, sanitizeRecord, createCache, clearAll };
if (typeof window !== 'undefined') window.EncryptedChunkCache = api;
if (typeof module !== 'undefined') module.exports = api;
})();
