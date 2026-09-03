(()=>{
'use strict';
const DB_NAME = 'mangaReaderEncryptedChunks';
const DB_VERSION = 1;
const STORE = 'chunks';
let dbPromise = null;
function requireIndexedDb() {
  if (!globalThis.indexedDB) throw new Error('このブラウザはオフライン索引に対応していません。');
  return globalThis.indexedDB;
}
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = requireIndexedDb().open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'chunkId' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => { dbPromise = null; reject(request.error || new Error('索引キャッシュを開けませんでした。')); };
  });
  return dbPromise;
}
async function withStore(mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = work(store); } catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(result && typeof result.then === 'function' ? result : result);
    tx.onerror = () => reject(tx.error || new Error('索引キャッシュの操作に失敗しました。'));
    tx.onabort = () => reject(tx.error || new Error('索引キャッシュの操作が中止されました。'));
  });
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('索引キャッシュを読み込めませんでした。'));
  });
}
async function list() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error('索引キャッシュを読み込めませんでした。'));
  });
}
async function get(chunkId) {
  const db = await open();
  const tx = db.transaction(STORE, 'readonly');
  return requestResult(tx.objectStore(STORE).get(String(chunkId)));
}
async function put(record) {
  if (!record || !record.chunkId || !record.payload) throw new Error('暗号化チャンクのキャッシュ形式が正しくありません。');
  const safe = {
    chunkId: String(record.chunkId),
    revision: Number.isFinite(Number(record.revision)) ? Number(record.revision) : 0,
    deletedAt: record.deletedAt || null,
    updatedAt: record.updatedAt || null,
    payload: record.payload,
    pendingAction: ['insert','replace','delete'].includes(record.pendingAction) ? record.pendingAction : null,
    baseRevision: Number.isFinite(Number(record.baseRevision)) ? Number(record.baseRevision) : null
  };
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(safe);
    tx.oncomplete = () => resolve(safe);
    tx.onerror = () => reject(tx.error || new Error('索引キャッシュを保存できませんでした。'));
  });
}
async function remove(chunkId) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(String(chunkId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('索引キャッシュを削除できませんでした。'));
  });
}
async function clear() {
  if (!globalThis.indexedDB) return;
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('索引キャッシュを消去できませんでした。'));
  });
}
const api = { DB_NAME, DB_VERSION, STORE, open, list, get, put, remove, clear };
if (typeof window !== 'undefined') window.EncryptedChunkCache = api;
if (typeof module !== 'undefined') module.exports = api;
})();
