(() => {
  'use strict';

  const cryptoApi = typeof require === 'function' ? require('./encrypted-asset-crypto.js') : window.EncryptedAssetCrypto;
  const cacheApi = typeof require === 'function' ? require('./encrypted-asset-cache.js') : window.EncryptedAssetCache;
  const backendApi = typeof require === 'function' ? require('./encrypted-asset-backend.js') : window.EncryptedAssetBackend;
  const remoteAccessApi = typeof require === 'function' ? require('./image-remote-access.js') : window.ImageRemoteAccess;

  function positiveRevision(value) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError('targetRevision must be positive');
    return value;
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) {
      const error = new Error('Operation was aborted');
      error.name = 'AbortError';
      throw error;
    }
  }

  function equalBytes(a, b) {
    const left = a instanceof Uint8Array ? a : new Uint8Array(a);
    const right = b instanceof Uint8Array ? b : new Uint8Array(b);
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
  }

  function objectPlan(processed) {
    const levels = processed?.manifest?.zoom?.levels || [];
    const ids = ['preview'];
    for (const level of [...levels].sort((a, b) => a.level - b.level)) {
      for (const tile of [...level.tiles].sort((a, b) => a.y - b.y || a.x - b.x)) ids.push(cryptoApi.tileObjectId(level.level, tile.x, tile.y));
    }
    return ids;
  }

  function conflict(assetId, reason, targetRevision, remote) {
    return { ok: false, conflict: { assetId, reason, targetRevision, remoteRevision: remote?.revision ?? null, remoteDeletedAt: remote?.deletedAt ?? null } };
  }

  async function stageProcessedRevision({ cache, masterKey, assetId, targetRevision, processed, signal, onProgress }) {
    const target = positiveRevision(targetRevision);
    const ids = objectPlan(processed);
    const expectedTiles = ids.length - 1;
    if (!processed?.previewBlob || processed.tileBlobs?.length !== expectedTiles) throw new Error('processed tile count does not match manifest');
    const encryptedBytes = {};
    const inputs = [processed.previewBlob, ...processed.tileBlobs];
    onProgress?.({ phase: 'encrypt', completed: 0, total: ids.length });
    for (let index = 0; index < ids.length; index += 1) {
      throwIfAborted(signal);
      const objectId = ids[index];
      const existing = await cache.get(assetId, target, objectId);
      if (existing) {
        if (existing.retention !== 'pending') throw new Error('published cache object cannot be restaged');
        encryptedBytes[objectId] = new Uint8Array(existing.encryptedBytes);
        onProgress?.({ phase: 'encrypt', completed: index + 1, total: ids.length, reused: true });
        continue;
      }
      const encrypted = await cryptoApi.encryptAssetObject(masterKey, assetId, objectId, inputs[index]);
      throwIfAborted(signal);
      await cache.put({ assetId, revision: target, objectId, encryptedBytes: encrypted, retention: 'pending' });
      encryptedBytes[objectId] = encrypted;
      onProgress?.({ phase: 'encrypt', completed: index + 1, total: ids.length });
    }
    return { assetId, targetRevision: target, objectIds: ids, encryptedBytes };
  }

  async function session(vault, callback) {
    return vault.withSession((token, user) => callback(token, user));
  }

  async function localObjects(cache, assetId, revision, objectIds, allowCache) {
    const result = {};
    const records = {};
    for (const objectId of objectIds) {
      const record = await cache.get(assetId, revision, objectId);
      if (!record || record.revision !== revision || (record.retention !== 'pending' && (!allowCache || record.retention !== 'cache'))) throw new Error(`missing-pending-object:${objectId}`);
      cryptoApi.validateEncryptedAsset(record.encryptedBytes);
      result[objectId] = new Uint8Array(record.encryptedBytes);
      records[objectId] = record;
    }
    return { bytes: result, records };
  }

  function validateObjectIds(objectIds) {
    if (!Array.isArray(objectIds) || !objectIds.includes('preview') || new Set(objectIds).size !== objectIds.length) throw new Error('objectIds are invalid');
    objectIds.forEach(backendApi.objectId);
  }

  function objectKind(objectId) {
    return objectId === 'preview' ? 'preview' : 'zoom';
  }

  async function verifyRemoteObjects({ storage, token, userId, assetId, revision, objectIds, pending, signal, transferStorage, now, mediaAccess }) {
    for (const objectId of objectIds) {
      const path = backendApi.buildStorageObjectPath(userId, assetId, revision, objectId);
      const remote = await remoteAccessApi.runRemoteRead({
        estimatedBytes: pending[objectId].byteLength,
        kind: objectKind(objectId),
        transferStorage,
        storage: transferStorage,
        now,
        mediaAccess,
        signal,
      }, ({ signal: remoteSignal, recordObserved }) => storage.download(path, token, remoteSignal).then((bytes) => {
        if (bytes) recordObserved(bytes.byteLength);
        return bytes;
      }));
      if (!remote || !equalBytes(remote, pending[objectId])) return false;
    }
    return true;
  }

  async function uploadObjects({ storage, token, userId, assetId, revision, objectIds, pending, signal, transferStorage, now, mediaAccess, onProgress }) {
    const totalBytes = objectIds.reduce((total, objectId) => total + pending[objectId].byteLength, 0);
    let confirmedBytes = 0;
    for (let index = 0; index < objectIds.length; index += 1) {
      const objectId = objectIds[index];
      onProgress?.({ phase: 'upload', completed: index, total: objectIds.length, confirmedBytes, totalBytes, currentBytes: pending[objectId].byteLength });
      const path = backendApi.buildStorageObjectPath(userId, assetId, revision, objectId);
      const result = await storage.upload(path, token, pending[objectId], signal);
      if (result.exists && !(await verifyRemoteObjects({ storage, token, userId, assetId, revision, objectIds: [objectId], pending, signal, transferStorage, now, mediaAccess }))) {
        return { ok: false, reason: 'storage-object-mismatch' };
      }
      confirmedBytes += pending[objectId].byteLength;
      onProgress?.({ phase: 'upload', completed: index + 1, total: objectIds.length, confirmedBytes, totalBytes, currentBytes: 0 });
    }
    return { ok: true };
  }

  async function finalize(cache, assetId, revision, objectIds) {
    for (const objectId of objectIds) {
      const changed = await cache.setRetention(assetId, revision, objectId, 'cache');
      if (changed === false) throw new Error(`local finalize failed:${objectId}`);
    }
  }

  async function publishPendingRevision({ vault, storage, cache, assetId, targetRevision, objectIds, signal, transferStorage, now, mediaAccess, onProgress }) {
    const target = positiveRevision(targetRevision);
    validateObjectIds(objectIds);
    onProgress?.({ phase: 'checking', completed: 0, total: objectIds.length });
    const local = await localObjects(cache, assetId, target, objectIds, true);
    const remote = await backendApi.fetchRemoteAsset(vault, assetId);
    const recovery = remote && remote.revision === target && !remote.deletedAt;
    if (!recovery && Object.values(local.records).some((record) => record.retention !== 'pending')) {
      throw new Error('missing-pending-object');
    }
    const pending = local.bytes;
    throwIfAborted(signal);
    if (recovery) {
      const verified = await session(vault, (token, user) => verifyRemoteObjects({ storage, token, userId: user.id, assetId, revision: target, objectIds, pending, signal, transferStorage, now, mediaAccess }));
      if (verified) { await finalize(cache, assetId, target, objectIds); onProgress?.({ phase: 'registered' }); return { ok: true, resumed: true }; }
      return conflict(assetId, 'published-revision-mismatch', target, remote);
    }
    if (target === 1) {
      if (remote) {
        return conflict(assetId, 'remote-exists', target, remote);
      }
    } else if (!remote || remote.deletedAt) {
      return conflict(assetId, remote ? 'remote-deleted' : 'remote-missing', target, remote);
    } else if (remote.revision !== target - 1) {
      return conflict(assetId, 'revision-mismatch', target, remote);
    }

    const uploaded = await session(vault, (token, user) => uploadObjects({ storage, token, userId: user.id, assetId, revision: target, objectIds, pending, signal, transferStorage, now, mediaAccess, onProgress }));
    if (!uploaded.ok) return conflict(assetId, uploaded.reason, target, remote);
    throwIfAborted(signal);
    onProgress?.({ phase: 'register' });
    const published = target === 1 ? await backendApi.createRemoteAsset(vault, assetId) : await backendApi.publishRemoteAssetRevision(vault, assetId, target - 1);
    if (!published) {
      if (target === 1) {
        const raced = await backendApi.fetchRemoteAsset(vault, assetId);
        if (raced?.revision === 1 && !raced.deletedAt) {
          const verified = await session(vault, (token, user) => verifyRemoteObjects({ storage, token, userId: user.id, assetId, revision: target, objectIds, pending, signal, transferStorage, now, mediaAccess }));
          if (verified) { await finalize(cache, assetId, target, objectIds); onProgress?.({ phase: 'registered' }); return { ok: true, resumed: true }; }
        }
        return conflict(assetId, 'create-conflict', target, raced || remote);
      }
      return conflict(assetId, 'cas-conflict', target, remote);
    }
    await finalize(cache, assetId, target, objectIds);
    onProgress?.({ phase: 'registered' });
    return { ok: true, metadata: published };
  }

  async function loadEncryptedObject({ vault, storage, cache, assetId, revision, objectId, estimatedBytes, transferStorage, now, mediaAccess, signal }) {
    const hit = await cache.get(assetId, revision, objectId);
    const ledgerStorage = transferStorage;
    if (hit) {
      const recorded = remoteAccessApi.recordCacheHit(hit.encryptedByteLength ?? hit.encryptedBytes.byteLength, { storage: ledgerStorage, now });
      // Telemetry is intentionally best-effort: a durable encrypted cache hit must remain usable.
      return new Uint8Array(hit.encryptedBytes);
    }
    if (!Number.isInteger(estimatedBytes) || estimatedBytes < 1) throw new TypeError('estimatedBytes must be a positive integer');
    return remoteAccessApi.runRemoteRead({ estimatedBytes, kind: objectKind(objectId), transferStorage: ledgerStorage, storage: ledgerStorage, now, mediaAccess, signal }, async ({ signal: remoteSignal, recordObserved }) => {
      const remote = await backendApi.fetchRemoteAsset(vault, assetId);
      if (!remote || remote.deletedAt || remote.revision !== revision) throw new Error('remote metadata does not match requested revision');
      return session(vault, async (token, user) => {
        const path = backendApi.buildStorageObjectPath(user.id, assetId, revision, objectId);
        const encrypted = await storage.download(path, token, remoteSignal);
        if (!encrypted) return null;
        recordObserved(encrypted.byteLength);
        cryptoApi.validateEncryptedAsset(encrypted);
        await cache.put({ assetId, revision, objectId, encryptedBytes: encrypted, retention: 'cache' });
        return new Uint8Array(encrypted);
      });
    });
  }

  async function loadDecryptedObject(options) {
    const encrypted = await loadEncryptedObject(options);
    if (!encrypted) return null;
    return cryptoApi.decryptAssetObject(options.masterKey, options.assetId, options.objectId, encrypted);
  }

  async function tombstoneAsset({ vault, assetId, expectedRevision }) {
    return backendApi.tombstoneRemoteAsset(vault, assetId, expectedRevision);
  }

  // Roll back every object of a newly-created page, including files uploaded before
  // metadata creation. Keep local records if remote cleanup fails so a retry is possible.
  async function discardImportedAsset({ vault, storage, cache, assetId, expectedRevision = 1 }) {
    if (!cache || typeof cache.list !== 'function' || typeof cache.removeAsset !== 'function' || typeof storage?.remove !== 'function') {
      throw new TypeError('encrypted asset cleanup dependencies are missing');
    }
    const remote = await backendApi.fetchRemoteAsset(vault, assetId);
    if (remote && !remote.deletedAt) {
      if (remote.revision !== expectedRevision) throw new Error('cleanup revision conflict');
      const tombstone = await backendApi.tombstoneRemoteAsset(vault, assetId, expectedRevision);
      if (!tombstone?.deletedAt) throw new Error('encrypted asset tombstone failed');
    }
    const records = (await cache.list()).filter((record) => record.assetId === assetId && record.revision === expectedRevision);
    await session(vault, async (token, user) => {
      for (const record of records) {
        const path = backendApi.buildStorageObjectPath(user.id, assetId, expectedRevision, record.objectId);
        await storage.remove(path, token);
      }
    });
    await cache.removeAsset(assetId);
    return { ok: true, removedObjects: records.length };
  }

  const api = { equalBytes, stageProcessedRevision, publishPendingRevision, loadEncryptedObject, loadDecryptedObject, tombstoneAsset, discardImportedAsset };
  if (typeof window !== 'undefined') window.EncryptedAssetSync = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
