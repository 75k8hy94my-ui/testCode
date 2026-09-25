import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assetCrypto from '../encrypted-asset-crypto.js';
import cacheApi from '../encrypted-asset-cache.js';

if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;

class FakeRequest {
  constructor(action) {
    this.result = undefined;
    this.error = null;
    setTimeout(() => {
      try { this.result = action(); this.onsuccess?.(); }
      catch (error) { this.error = error; this.onerror?.(); }
    }, 0);
  }
}

class FakeStore {
  constructor(database) { this.database = database; }
  get(key) { return new FakeRequest(() => this.database.records.get(key)); }
  getAll() { return new FakeRequest(() => [...this.database.records.values()].map(record => structuredClone(record))); }
  put(record) { this.database.records.set(record.cacheKey, structuredClone(record)); return new FakeRequest(() => undefined); }
  delete(key) { this.database.records.delete(key); return new FakeRequest(() => undefined); }
  clear() { this.database.records.clear(); return new FakeRequest(() => undefined); }
}

class FakeTransaction {
  constructor(database) {
    this.database = database;
    setTimeout(() => this.oncomplete?.(), 5);
  }
  objectStore() { return new FakeStore(this.database); }
}

class FakeDatabase {
  constructor() { this.records = new Map(); this.objectStoreNames = { contains: () => true }; }
  transaction() { return new FakeTransaction(this); }
  close() {}
}

class FakeIndexedDB {
  constructor() { this.database = new FakeDatabase(); }
  open() {
    const request = new FakeRequest(() => this.database);
    request.result = this.database;
    return request;
  }
}

const masterKey = new Uint8Array(32).fill(7);
let clock = 1000;
const idb = new FakeIndexedDB();

async function encrypted(objectId = 'preview') {
  return assetCrypto.encryptAssetObject(masterKey, 'asset-1', objectId, Uint8Array.from([1, 2, 3]));
}

function newCache(options = {}) {
  return cacheApi.createCache({ indexedDB: idb, now: () => clock, ...options });
}

test('constants and cache keys are fixed and revision-sensitive', () => {
  assert.equal(cacheApi.DB_NAME, 'mangaReaderEncryptedAssets');
  assert.equal(cacheApi.STORE_NAME, 'objects');
  assert.equal(cacheApi.VERSION, 1);
  assert.equal(cacheApi.makeCacheKey('asset-1', 0, 'preview'), 'asset-1\0' + '0\0preview');
  assert.notEqual(cacheApi.makeCacheKey('asset-1', 0, 'preview'), cacheApi.makeCacheKey('asset-1', 1, 'preview'));
});

test('sanitize keeps only encrypted allowlisted fields and computes length', async () => {
  const encryptedBytes = await encrypted();
  const record = cacheApi.sanitizeRecord({
    assetId: 'asset-1', revision: 0, objectId: 'preview', encryptedBytes,
    encryptedByteLength: 1, storedAt: 1, lastAccessedAt: 2, retention: 'cache',
    fileName: 'secret.jpg', mimeType: 'image/webp', plaintext: new Blob(['secret']),
    masterKey, cryptoKey: {}, manifest: { secret: true }
  });
  assert.equal(record.encryptedByteLength, encryptedBytes.byteLength);
  assert.deepEqual(Object.keys(record).sort(), ['assetId', 'cacheKey', 'encryptedByteLength', 'encryptedBytes', 'lastAccessedAt', 'objectId', 'retention', 'revision', 'storedAt']);
  assert.equal(record.fileName, undefined);
  assert.equal(record.masterKey, undefined);
});

test('rejects Blob, malformed bytes, invalid revisions, and noncanonical IDs', async () => {
  const encryptedBytes = await encrypted('L0:0:0');
  const base = { assetId: 'asset-1', revision: 0, objectId: 'L0:0:0', encryptedBytes, storedAt: 1, lastAccessedAt: 1 };
  assert.throws(() => cacheApi.sanitizeRecord({ ...base, encryptedBytes: new Blob([encryptedBytes]) }));
  assert.throws(() => cacheApi.sanitizeRecord({ ...base, encryptedBytes: new Uint8Array([1, 2]) }));
  for (const revision of [-1, 1.5, '0']) assert.throws(() => cacheApi.sanitizeRecord({ ...base, revision }));
  for (const objectId of ['foobar', 'tile', 'L01:0:0', 'L0:00:0', 'L-1:0:0', 'L0:-1:0', 'L0:0:-1', 'L0:1.5:0']) assert.throws(() => cacheApi.sanitizeRecord({ ...base, objectId }));
});

test('put/get, miss, defensive copies, LRU touch, and usage work', async () => {
  const cache = newCache();
  await cache.clear();
  const input = await encrypted();
  await cache.put({ assetId: 'asset-1', revision: 0, objectId: 'preview', encryptedBytes: input, encryptedByteLength: 1 });
  input[20] ^= 255;
  clock = 2000;
  const hit = await cache.get('asset-1', 0, 'preview');
  assert.equal(hit.lastAccessedAt, 2000);
  assert.equal(hit.encryptedByteLength, hit.encryptedBytes.byteLength);
  const returned = hit.encryptedBytes.slice();
  returned[20] ^= 255;
  assert.deepEqual((await cache.get('asset-1', 0, 'preview')).encryptedBytes, hit.encryptedBytes);
  assert.equal(await cache.get('missing', 0, 'preview'), null);
  assert.deepEqual(await cache.getUsage(), { bytes: hit.encryptedByteLength, count: 1, pendingBytes: 0, pendingCount: 0 });
});

test('retention, remove, removeAsset, and clear work', async () => {
  const cache = newCache();
  await cache.clear();
  const data = await encrypted();
  await cache.put({ assetId: 'asset-a', revision: 0, objectId: 'preview', encryptedBytes: data });
  await cache.put({ assetId: 'asset-a', revision: 1, objectId: 'L0:0:0', encryptedBytes: await encrypted('L0:0:0'), retention: 'pending' });
  assert.equal(await cache.setRetention('asset-a', 0, 'preview', 'pending'), true);
  assert.equal((await cache.getUsage()).pendingCount, 2);
  await assert.rejects(cache.setRetention('asset-a', 0, 'preview', 'bad'));
  await cache.remove('asset-a', 0, 'preview');
  await cache.removeAsset('asset-a');
  assert.equal((await cache.list()).length, 0);
  await cache.put({ assetId: 'asset-b', revision: 0, objectId: 'preview', encryptedBytes: data });
  await cache.clear();
  assert.equal((await cache.list()).length, 0);
});

test('eviction orders higher zoom levels, then older records within each level, then preview', async () => {
  const records = [
    { assetId: 'new', revision: 0, objectId: 'preview', lastAccessedAt: 20 },
    { assetId: 'old', revision: 0, objectId: 'preview', lastAccessedAt: 10 },
    { assetId: 'new', revision: 0, objectId: 'L0:0:0', lastAccessedAt: 20 },
    { assetId: 'old', revision: 0, objectId: 'L0:0:0', lastAccessedAt: 10 },
    { assetId: 'new', revision: 0, objectId: 'L1:0:0', lastAccessedAt: 20 },
    { assetId: 'old', revision: 0, objectId: 'L1:0:0', lastAccessedAt: 10 }
  ].map(record => ({ ...record, retention: 'cache', cacheKey: cacheApi.makeCacheKey(record.assetId, 0, record.objectId) }));
  assert.deepEqual(cacheApi.selectEvictionCandidates(records).map(record => `${record.assetId}:${record.objectId}`), [
    'old:L1:0:0', 'new:L1:0:0', 'old:L0:0:0', 'new:L0:0:0', 'old:preview', 'new:preview'
  ]);
});

test('automatic eviction preserves pending records and reports overLimit when necessary', async () => {
  const cache = newCache({ maxBytes: 1 });
  await cache.clear();
  const preview = await encrypted();
  await cache.put({ assetId: 'asset-1', revision: 0, objectId: 'preview', encryptedBytes: preview });
  assert.equal((await cache.list()).length, 0);

  const pendingCache = newCache({ maxBytes: 1 });
  await pendingCache.clear();
  await pendingCache.put({ assetId: 'asset-pending', revision: 0, objectId: 'preview', encryptedBytes: preview, retention: 'pending' });
  assert.equal((await pendingCache.list()).length, 1);
  const result = await pendingCache.enforceLimit();
  assert.equal(result.overLimit, true);
  assert.equal((await pendingCache.getUsage()).pendingCount, 1);
});

test('IndexedDB absence rejects clearly and the module is a classic script', () => {
  assert.throws(() => cacheApi.createCache({ indexedDB: null }), /IndexedDB is unavailable/);
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL('../encrypted-asset-cache.js', import.meta.url), 'utf8')));
});
