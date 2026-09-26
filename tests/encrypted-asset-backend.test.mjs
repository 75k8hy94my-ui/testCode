import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import backend from '../encrypted-asset-backend.js';

const schema = fs.readFileSync(new URL('../supabase-schema.sql', import.meta.url), 'utf8');
const storage = fs.readFileSync(new URL('../supabase-storage-setup.sql', import.meta.url), 'utf8');
const userId = '00000000-0000-4000-8000-000000000001';
const assetId = '6dc3773a-a3ef-4bb8-9cbf-15096098db20';

function fakeVault(rows = []) {
  const calls = [];
  return {
    calls,
    async withSession(callback) { return callback('token'); },
    async api(path, options) { calls.push({ path, options }); return rows; }
  };
}

test('constants, UUID/revision/object validation, filename, and path are deterministic', () => {
  assert.equal(backend.TABLE, 'manga_reader_encrypted_assets');
  assert.equal(backend.BUCKET, 'vault-assets');
  assert.equal(backend.storageObjectFileName('preview'), 'preview.mrae');
  assert.equal(backend.storageObjectFileName('L1:3:2'), 'L1_3_2.mrae');
  assert.equal(backend.buildStorageObjectPath(userId, assetId, 3, 'L1:3:2'), `${userId}/${assetId}/3/L1_3_2.mrae`);
  for (const value of ['../preview', 'L01:0:0', 'foobar', 'L0:1.5:0']) assert.throws(() => backend.storageObjectFileName(value));
  for (const value of ['../x', 'not-uuid', '00000000/0000-4000-8000-000000000001']) assert.throws(() => backend.buildStorageObjectPath(value, assetId, 1, 'preview'));
  for (const value of [0, -1, 1.5, Number.NaN, '1']) assert.throws(() => backend.buildStorageObjectPath(userId, assetId, value, 'preview'));
});

test('metadata normalization exposes only the client metadata contract', () => {
  assert.deepEqual(backend.remoteAsset({ asset_id: assetId.toUpperCase(), revision: 4, deleted_at: null, updated_at: 'now', user_id: userId, payload: 'secret' }), {
    assetId, revision: 4, deletedAt: null, updatedAt: 'now'
  });
});

test('fetch metadata APIs select only allowed columns and normalize rows', async () => {
  const vault = fakeVault([{ asset_id: assetId, revision: 4, deleted_at: null, updated_at: 'now' }]);
  assert.deepEqual(await backend.fetchRemoteAssetMetadata(vault), [{ assetId, revision: 4, deletedAt: null, updatedAt: 'now' }]);
  assert.deepEqual(await backend.fetchRemoteAsset(vault, assetId), { assetId, revision: 4, deletedAt: null, updatedAt: 'now' });
  assert.match(vault.calls[0].path, /select=asset_id,revision,deleted_at,updated_at/);
  assert.doesNotMatch(vault.calls[0].path, /user_id|payload|manifest/);
  const empty = fakeVault([]);
  assert.equal(await backend.fetchRemoteAsset(empty, assetId), null);
});

test('create, publish CAS, and tombstone use only their RPC bodies', async () => {
  const created = fakeVault([{ asset_id: assetId, revision: 1, deleted_at: null, updated_at: 'a' }]);
  assert.equal((await backend.createRemoteAsset(created, assetId)).revision, 1);
  assert.deepEqual(JSON.parse(created.calls[0].options.body), { expected_asset_id: assetId });

  const published = fakeVault([{ asset_id: assetId, revision: 5, deleted_at: null, updated_at: 'b' }]);
  assert.equal((await backend.publishRemoteAssetRevision(published, assetId, 4)).revision, 5);
  assert.deepEqual(JSON.parse(published.calls[0].options.body), { expected_asset_id: assetId, expected_revision: 4 });

  const tombstoned = fakeVault([{ asset_id: assetId, revision: 6, deleted_at: 'deleted', updated_at: 'c' }]);
  assert.equal((await backend.tombstoneRemoteAsset(tombstoned, assetId, 5)).deletedAt, 'deleted');
  assert.deepEqual(JSON.parse(tombstoned.calls[0].options.body), { expected_asset_id: assetId, expected_revision: 5 });

  assert.equal(await backend.createRemoteAsset(fakeVault([]), assetId), null);
  assert.equal(await backend.publishRemoteAssetRevision(fakeVault([]), assetId, 4), null);
  assert.equal(await backend.tombstoneRemoteAsset(fakeVault([]), assetId, 5), null);
});

test('backend rejects invalid IDs/revisions and does not expose storage or crypto operations', async () => {
  for (const value of ['', 'not-uuid', '../asset']) await assert.rejects(backend.fetchRemoteAsset(fakeVault(), value));
  for (const value of [0, -1, 1.5, Number.NaN, '4']) await assert.rejects(backend.publishRemoteAssetRevision(fakeVault(), assetId, value));
  const source = fs.readFileSync(new URL('../encrypted-asset-backend.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /storage\.from|signed.?url|\.upload\s*\(|\.download\s*\(|\.remove\s*\(|EncryptedAssetCache|EncryptedAssetCrypto/i);
});

test('schema defines isolated metadata table, RLS, RPC security, and CAS/tombstone rules', () => {
  const table = schema.match(/create table if not exists public\.manga_reader_encrypted_assets \(([\s\S]*?)\n\);/i)?.[1] || '';
  assert.match(table, /user_id uuid not null references auth\.users\(id\) on delete cascade/i);
  assert.match(table, /asset_id uuid not null/i);
  assert.match(table, /revision bigint not null default 1 check \(revision > 0\)/i);
  assert.match(table, /deleted_at timestamptz/i);
  assert.match(table, /updated_at timestamptz not null default now\(\)/i);
  assert.match(table, /primary key \(user_id, asset_id\)/i);
  for (const forbidden of ['payload', 'manifest', 'filename', 'mime_type', 'width', 'height', 'hash', 'preview_path', 'storage_path']) assert.doesNotMatch(table, new RegExp(`\\b${forbidden}\\b`, 'i'));
  assert.match(schema, /alter table public\.manga_reader_encrypted_assets enable row level security/i);
  assert.match(schema, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  for (const rpc of ['create_manga_reader_encrypted_asset', 'publish_manga_reader_encrypted_asset_revision', 'tombstone_manga_reader_encrypted_asset']) {
    const start = schema.toLowerCase().indexOf(`create or replace function public.${rpc}`.toLowerCase());
    const end = schema.indexOf('$$;', start);
    const block = start < 0 ? '' : schema.slice(start, end < 0 ? schema.length : end + 3);
    assert.match(block, /security\s+definer/i);
    assert.match(block, /set search_path = public/i);
    assert.match(block, /auth\.uid\(\)/i);
  }
  assert.match(schema, /revision = expected_revision/i);
  assert.match(schema, /deleted_at is null/i);
  assert.match(schema, /revoke all on table public\.manga_reader_encrypted_assets from public, anon, authenticated/i);
  assert.match(schema, /grant select on table public\.manga_reader_encrypted_assets to authenticated/i);
  assert.match(schema, /revoke execute on function public\.create_manga_reader_encrypted_asset\(uuid\) from public, anon/i);
  assert.match(schema, /grant execute on function public\.tombstone_manga_reader_encrypted_asset\(uuid, bigint\) to authenticated/i);
});

test('storage SQL defines private vault-assets ownership policies without UPDATE policy', () => {
  assert.match(storage, /insert into storage\.buckets[\s\S]*'vault-assets'[\s\S]*false/i);
  assert.match(storage, /for insert[\s\S]*bucket_id = 'vault-assets'[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)::text\)/i);
  assert.match(storage, /for select[\s\S]*bucket_id = 'vault-assets'[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)::text\)/i);
  assert.match(storage, /for delete[\s\S]*bucket_id = 'vault-assets'[\s\S]*storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)::text\)/i);
  assert.doesNotMatch(storage, /create policy[\s\S]*vault assets[\s\S]*for update/i);
});

test('backend remains a classic standalone script', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL('../encrypted-asset-backend.js', import.meta.url), 'utf8')));
});
