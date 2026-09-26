(() => {
  'use strict';

  const TABLE = 'manga_reader_encrypted_assets';
  const BUCKET = 'vault-assets';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SELECT = 'asset_id,revision,deleted_at,updated_at';

  function uuid(value, name) {
    if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(`${name} must be a UUID`);
    return value.toLowerCase();
  }

  function revision(value) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError('revision must be a positive integer');
    return value;
  }

  function objectId(value) {
    if (value === 'preview') return value;
    if (typeof value !== 'string' || !/^L(?:0|[1-9]\d*):(?:0|[1-9]\d*):(?:0|[1-9]\d*)$/.test(value)) throw new TypeError('objectId is not canonical');
    return value;
  }

  function storageObjectFileName(value) {
    const id = objectId(value);
    return `${id.replaceAll(':', '_')}.mrae`;
  }

  function buildStorageObjectPath(userId, assetId, assetRevision, object) {
    return [uuid(userId, 'userId'), uuid(assetId, 'assetId'), revision(assetRevision), storageObjectFileName(object)].join('/');
  }

  function remoteAsset(row) {
    if (!row) return null;
    return {
      assetId: uuid(row.asset_id, 'assetId'),
      revision: revision(Number(row.revision)),
      deletedAt: row.deleted_at ?? null,
      updatedAt: row.updated_at ?? null
    };
  }

  function requireVault(vault) {
    if (!vault || typeof vault.withSession !== 'function' || typeof vault.api !== 'function') throw new Error('vault API is required');
  }

  async function fetchRemoteAssetMetadata(vault) {
    requireVault(vault);
    return vault.withSession(async token => {
      const rows = await vault.api(`/rest/v1/${TABLE}?select=${SELECT}`, { token });
      return (rows || []).map(remoteAsset);
    });
  }

  async function fetchRemoteAsset(vault, assetId) {
    const id = uuid(assetId, 'assetId');
    requireVault(vault);
    return vault.withSession(async token => {
      const rows = await vault.api(`/rest/v1/${TABLE}?select=${SELECT}&asset_id=eq.${id}&limit=1`, { token });
      return rows && rows[0] ? remoteAsset(rows[0]) : null;
    });
  }

  async function callAssetRpc(vault, path, body) {
    requireVault(vault);
    return vault.withSession(async token => {
      const rows = await vault.api(`/rest/v1/rpc/${path}`, { method: 'POST', token, body: JSON.stringify(body) });
      return rows && rows[0] ? remoteAsset(rows[0]) : null;
    });
  }

  async function createRemoteAsset(vault, assetId) {
    const id = uuid(assetId, 'assetId');
    return callAssetRpc(vault, 'create_manga_reader_encrypted_asset', { expected_asset_id: id });
  }

  async function publishRemoteAssetRevision(vault, assetId, expectedRevision) {
    const id = uuid(assetId, 'assetId');
    const expected = revision(expectedRevision);
    return callAssetRpc(vault, 'publish_manga_reader_encrypted_asset_revision', { expected_asset_id: id, expected_revision: expected });
  }

  async function tombstoneRemoteAsset(vault, assetId, expectedRevision) {
    const id = uuid(assetId, 'assetId');
    const expected = revision(expectedRevision);
    return callAssetRpc(vault, 'tombstone_manga_reader_encrypted_asset', { expected_asset_id: id, expected_revision: expected });
  }

  const api = { TABLE, BUCKET, uuid, revision, objectId, storageObjectFileName, buildStorageObjectPath, remoteAsset, fetchRemoteAssetMetadata, fetchRemoteAsset, createRemoteAsset, publishRemoteAssetRevision, tombstoneRemoteAsset };
  if (typeof window !== 'undefined') window.EncryptedAssetBackend = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
