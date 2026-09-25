import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assetCrypto from '../encrypted-asset-crypto.js';
import sync from '../encrypted-asset-sync.js';

if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;
const key = new Uint8Array(32).fill(4);
const userId = '00000000-0000-4000-8000-000000000001';
const assetId = '6dc3773a-a3ef-4bb8-9cbf-15096098db20';

function makeProcessed() {
  return {
    manifest: { zoom: { levels: [{ level: 0, tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }, { level: 1, tiles: [{ x: 0, y: 0 }] }] } },
    previewBlob: new Blob(['preview']), tileBlobs: [new Blob(['a']), new Blob(['b']), new Blob(['c'])]
  };
}
function makeCache() {
  const records = new Map();
  return {
    records,
    async get(a, r, o) { return records.get(`${a}:${r}:${o}`) || null; },
    async put(record) { records.set(`${record.assetId}:${record.revision}:${record.objectId}`, { ...record, encryptedBytes: new Uint8Array(record.encryptedBytes) }); },
    async setRetention(a, r, o, retention) { const item = records.get(`${a}:${r}:${o}`); if (!item) return false; item.retention = retention; return true; }
  };
}
function makeVault(remote, calls = []) {
  return { calls, async withSession(callback) { return callback('token', { id: userId }); }, async api(path, options) { calls.push({ path, options }); return remote ? [remote] : []; } };
}
function makeStorage() {
  const objects = new Map();
  const calls = [];
  return {
    objects, calls,
    async upload(path, token, bytes) { calls.push(['upload', path, token]); if (objects.has(path)) return { created: false, exists: true }; objects.set(path, new Uint8Array(bytes)); return { created: true, exists: false }; },
    async download(path) { calls.push(['download', path]); return objects.has(path) ? new Uint8Array(objects.get(path)) : null; }
  };
}
function makeTransferStorage() {
  const values = new Map();
  return { getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { values.set(key, String(value)); } };
}
const transferStorage = makeTransferStorage();
const allowedMediaAccess = { getStatus: () => 'allowed', canLoadExternalMedia: () => true };

test('stageProcessedRevision encrypts preview/tiles in deterministic order and stores pending', async () => {
  const cache = makeCache();
  const result = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  assert.deepEqual(result.objectIds, ['preview', 'L0:0:0', 'L0:1:0', 'L1:0:0']);
  assert.equal(cache.records.size, 4);
  for (const record of cache.records.values()) { assert.equal(record.retention, 'pending'); assert.equal(record.encryptedBytes[0], 0x4d); }
  assert.equal(Object.values(result.encryptedBytes).length, 4);
});

test('staging rejects tile mismatch, reuses pending, and refuses cache overwrite', async () => {
  const cache = makeCache();
  await assert.rejects(sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: { ...makeProcessed(), tileBlobs: [] } }));
  const first = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  const second = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  assert.deepEqual(second.encryptedBytes, first.encryptedBytes);
  for (const record of cache.records.values()) record.retention = 'cache';
  await assert.rejects(sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() }));
});

test('new asset publish uploads all objects before metadata create and finalizes cache', async () => {
  const cache = makeCache();
  const staged = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  const events = [];
  const storage = makeStorage();
  const vault = { async withSession(callback) { return callback('token', { id: userId }); }, async api(path, options) { events.push('metadata'); return path.includes('/rpc/create_manga_reader_encrypted_asset') ? [{ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }] : []; } };
  const result = await sync.publishPendingRevision({ vault, storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds });
  assert.equal(result.ok, true);
  assert.equal(storage.calls.filter(call => call[0] === 'upload').length, 4);
  assert.equal(events.at(-1), 'metadata');
  assert.ok([...cache.records.values()].every(record => record.retention === 'cache'));
});

test('revision mismatch, tombstone, missing pending, and abort do not upload', async () => {
  const cache = makeCache();
  const staged = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 5, processed: makeProcessed() });
  for (const remote of [
    { asset_id: assetId, revision: 6, deleted_at: null, updated_at: 'now' },
    { asset_id: assetId, revision: 4, deleted_at: 'deleted', updated_at: 'now' }
  ]) {
    const storage = makeStorage();
    const result = await sync.publishPendingRevision({ vault: makeVault(remote), storage, cache, assetId, targetRevision: 5, objectIds: staged.objectIds });
    assert.equal(result.ok, false); assert.equal(storage.calls.length, 0);
  }
  const missing = makeCache();
  await assert.rejects(sync.publishPendingRevision({ vault: makeVault(null), storage: makeStorage(), cache: missing, assetId, targetRevision: 1, objectIds: staged.objectIds }));
});

test('duplicate upload verifies exact bytes and rejects mismatches', async () => {
  const cache = makeCache();
  const staged = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  const storage = makeStorage();
  const vault = { async withSession(callback) { return callback('token', { id: userId }); }, async api(path) { return path.includes('/rpc/create_manga_reader_encrypted_asset') ? [{ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }] : []; } };
  const first = await sync.publishPendingRevision({ vault, storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds, transferStorage, mediaAccess: allowedMediaAccess });
  assert.equal(first.ok, true);
  for (const record of cache.records.values()) record.retention = 'pending';
  const retry = await sync.publishPendingRevision({ vault: makeVault({ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }), storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds, transferStorage, mediaAccess: allowedMediaAccess });
  assert.equal(retry.ok, true);
  const firstPath = [...storage.objects.keys()][0]; storage.objects.set(firstPath, new Uint8Array([99]));
  for (const record of cache.records.values()) record.retention = 'pending';
  const mismatch = await sync.publishPendingRevision({ vault: makeVault({ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }), storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds, transferStorage, mediaAccess: allowedMediaAccess });
  assert.equal(mismatch.conflict.reason, 'published-revision-mismatch');
});

test('partial finalize resumes with mixed pending and cache records after published metadata', async () => {
  const cache = makeCache();
  const staged = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  const storage = makeStorage();
  const remote = { asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' };
  for (const objectId of staged.objectIds) storage.objects.set(`${userId}/${assetId}/1/${objectId === 'preview' ? 'preview' : objectId.replaceAll(':', '_')}.mrae`, staged.encryptedBytes[objectId]);
  const originalSetRetention = cache.setRetention;
  let calls = 0;
  cache.setRetention = async (...args) => { calls += 1; if (calls === 2) throw new Error('simulated finalize failure'); return originalSetRetention(...args); };
  await assert.rejects(sync.publishPendingRevision({ vault: makeVault(remote), storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds, transferStorage, mediaAccess: allowedMediaAccess }));
  assert.equal([...cache.records.values()].filter(record => record.retention === 'cache').length, 1);
  cache.setRetention = originalSetRetention;
  const result = await sync.publishPendingRevision({ vault: makeVault(remote), storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds, transferStorage, mediaAccess: allowedMediaAccess });
  assert.equal(result.ok, true);
  assert.ok([...cache.records.values()].every(record => record.retention === 'cache'));
});

test('abort after final upload prevents metadata publish and keeps pending records', async () => {
  const cache = makeCache();
  const staged = await sync.stageProcessedRevision({ cache, masterKey: key, assetId, targetRevision: 1, processed: makeProcessed() });
  const controller = new AbortController();
  const storage = makeStorage();
  const events = [];
  const originalUpload = storage.upload;
  storage.upload = async (...args) => { const result = await originalUpload(...args); if (storage.calls.filter(call => call[0] === 'upload').length === staged.objectIds.length) controller.abort(); return result; };
  const vault = { async withSession(callback) { return callback('token', { id: userId }); }, async api(path) { events.push(path); return path.includes('/rpc/') ? [{ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }] : []; } };
  await assert.rejects(sync.publishPendingRevision({ vault, storage, cache, assetId, targetRevision: 1, objectIds: staged.objectIds, signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(events.some(path => path.includes('/rpc/')), false);
  assert.ok([...cache.records.values()].every(record => record.retention === 'pending'));
});

test('cache HIT avoids metadata/storage and cache MISS validates metadata before download and decrypts', async () => {
  const cache = makeCache();
  const encrypted = await assetCrypto.encryptAssetObject(key, assetId, 'preview', new Uint8Array([1, 2]));
  await cache.put({ assetId, revision: 1, objectId: 'preview', encryptedBytes: encrypted, retention: 'cache' });
  const storage = makeStorage(); const vault = makeVault({ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' });
  assert.deepEqual(await sync.loadDecryptedObject({ vault, storage, cache, masterKey: key, assetId, revision: 1, objectId: 'preview', transferStorage }), new Uint8Array([1, 2]));
  assert.equal(vault.calls.length, 0);
  const missCache = makeCache(); const missStorage = makeStorage();
  missStorage.objects.set(`${userId}/${assetId}/1/preview.mrae`, encrypted);
  assert.deepEqual(await sync.loadDecryptedObject({ vault: makeVault({ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }), storage: missStorage, cache: missCache, masterKey: key, assetId, revision: 1, objectId: 'preview', estimatedBytes: encrypted.byteLength, transferStorage, mediaAccess: allowedMediaAccess }), new Uint8Array([1, 2]));
});

test('remote revision mismatch or invalid binary blocks download/cache', async () => {
  const storage = makeStorage(); const cache = makeCache();
  await assert.rejects(sync.loadEncryptedObject({ vault: makeVault({ asset_id: assetId, revision: 2, deleted_at: null, updated_at: 'now' }), storage, cache, assetId, revision: 1, objectId: 'preview', estimatedBytes: 10, transferStorage: makeTransferStorage(), mediaAccess: allowedMediaAccess }));
  storage.objects.set(`${userId}/${assetId}/1/preview.mrae`, new Uint8Array([1, 2]));
  await assert.rejects(sync.loadEncryptedObject({ vault: makeVault({ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }), storage, cache, assetId, revision: 1, objectId: 'preview', estimatedBytes: 10, transferStorage: makeTransferStorage(), mediaAccess: allowedMediaAccess }));
  assert.equal(cache.records.size, 0);
});

test('cache HIT bypasses VPN, metadata, storage, and budget while recording savings', async () => {
  const cache = makeCache();
  const encrypted = await assetCrypto.encryptAssetObject(key, assetId, 'preview', new Uint8Array([7]));
  await cache.put({ assetId, revision: 1, objectId: 'preview', encryptedBytes: encrypted, encryptedByteLength: encrypted.byteLength, retention: 'cache' });
  const transfer = makeTransferStorage();
  let metadata = 0;
  const result = await sync.loadEncryptedObject({ vault: { async api() { metadata += 1; return []; } }, storage: makeStorage(), cache, assetId, revision: 1, objectId: 'preview', transferStorage: transfer, mediaAccess: { getStatus: () => 'blocked', canLoadExternalMedia: () => false } });
  assert.deepEqual(result, encrypted);
  assert.equal(metadata, 0);
  assert.equal(ledgerStats(transfer).cacheHits, 1);
  assert.equal(ledgerStats(transfer).estimatedBytes, 0);
});

test('cache HIT still returns bytes when telemetry storage fails', async () => {
  const cache = makeCache();
  const encrypted = await assetCrypto.encryptAssetObject(key, assetId, 'preview', new Uint8Array([6]));
  await cache.put({ assetId, revision: 1, objectId: 'preview', encryptedBytes: encrypted, retention: 'cache' });
  const failingStorage = { setItem() { throw new Error('quota'); }, getItem() { return null; } };
  let metadata = 0;
  const result = await sync.loadEncryptedObject({ vault: { async api() { metadata += 1; return []; } }, storage: makeStorage(), cache, assetId, revision: 1, objectId: 'preview', transferStorage: failingStorage, mediaAccess: { getStatus: () => 'blocked', canLoadExternalMedia: () => false } });
  assert.deepEqual(result, encrypted);
  assert.equal(metadata, 0);
});

test('cache MISS is VPN-gated before metadata and storage, and VPN OFF permits remote read', async () => {
  const cache = makeCache();
  const encrypted = await assetCrypto.encryptAssetObject(key, assetId, 'preview', new Uint8Array([8]));
  const storage = makeStorage();
  storage.objects.set(`${userId}/${assetId}/1/preview.mrae`, encrypted);
  const transfer = makeTransferStorage();
  const calls = [];
  const vault = { async api(path) { calls.push(path); return [{ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'now' }]; }, async withSession(callback) { return callback('token', { id: userId }); } };
  await assert.rejects(sync.loadEncryptedObject({ vault, storage, cache, assetId, revision: 1, objectId: 'preview', estimatedBytes: encrypted.byteLength, transferStorage: transfer, mediaAccess: { getStatus: () => 'blocked', canLoadExternalMedia: () => false } }), error => error.name === 'ImageVpnRequiredError');
  assert.equal(calls.length, 0); assert.equal(storage.calls.length, 0);
  transfer.setItem('mangaReaderImageVpnRequired', 'false');
  const result = await sync.loadEncryptedObject({ vault, storage, cache, assetId, revision: 1, objectId: 'preview', estimatedBytes: encrypted.byteLength, transferStorage: transfer, mediaAccess: { getStatus: () => 'blocked', canLoadExternalMedia: () => false } });
  assert.deepEqual(result, encrypted);
  assert.equal(calls.length, 1);
  assert.equal(storage.calls.filter(call => call[0] === 'download').length, 1);
});

test('cache MISS requires a positive integer estimate before any remote request', async () => {
  const calls = [];
  const vault = { async api() { calls.push('metadata'); return []; } };
  for (const estimatedBytes of [undefined, 0, -1, NaN, 1.5]) {
    await assert.rejects(sync.loadEncryptedObject({ vault, storage: makeStorage(), cache: makeCache(), assetId, revision: 1, objectId: 'preview', estimatedBytes, transferStorage: makeTransferStorage(), mediaAccess: allowedMediaAccess }), error => error instanceof TypeError);
  }
  assert.equal(calls.length, 0);
});

function ledgerStats(storage) {
  return JSON.parse(storage.getItem('mangaReaderImageTransferStats') || '{}');
}

test('tombstone wrapper delegates metadata only and module is classic', async () => {
  const vault = makeVault({ asset_id: assetId, revision: 2, deleted_at: 'deleted', updated_at: 'now' });
  assert.equal((await sync.tombstoneAsset({ vault, assetId, expectedRevision: 1 })).revision, 2);
  const source = fs.readFileSync(new URL('../encrypted-asset-sync.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|MangaVault|upload\s*\(.*File/i);
  assert.doesNotThrow(() => new vm.Script(source));
});
