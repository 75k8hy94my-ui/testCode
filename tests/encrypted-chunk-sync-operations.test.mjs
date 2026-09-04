import test from 'node:test';
import assert from 'node:assert/strict';
import syncApi from '../encrypted-chunk-sync.js';

const chunkA = '11111111-1111-4111-8111-111111111111';
const envelope = (label) => ({
  type: 'manga-reader-encrypted-chunk', version: 1,
  algorithm: 'AES-256-GCM', kdf: 'HKDF-SHA-256',
  iv: `iv-${label}`, ciphertext: `cipher-${label}`
});

function memoryCache(initial = []) {
  const rows = new Map(initial.map((row) => [row.chunkId, structuredClone(row)]));
  return {
    async list() { return [...rows.values()].map((row) => structuredClone(row)); },
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async put(row) { rows.set(row.chunkId, structuredClone(row)); return structuredClone(row); },
    async remove(id) { rows.delete(id); }
  };
}

function fakeVault() {
  const calls = [];
  const remote = {
    chunk_id: chunkA,
    revision: 5,
    updated_at: '2026-09-04T00:05:00.000Z',
    deleted_at: null,
    payload: envelope('remote')
  };
  return {
    calls,
    async withSession(work) { return work('token', { id: '00000000-0000-4000-8000-000000000001' }); },
    async api(path, options = {}) {
      calls.push({ path, options: structuredClone(options) });
      if (path.startsWith('/rest/v1/manga_reader_encrypted_chunks?select=chunk_id,payload,revision,deleted_at,updated_at')) {
        return path.includes(chunkA) ? [structuredClone(remote)] : [];
      }
      if (path === '/rest/v1/rpc/cleanup_manga_reader_encrypted_chunk_tombstones') {
        return [{ deleted_count: 2 }];
      }
      throw new Error(`unexpected API call: ${path}`);
    }
  };
}

test('fetchRemoteChunk returns the current encrypted row for one chunk', async () => {
  const vault = fakeVault();
  const remote = await syncApi.fetchRemoteChunk(vault, chunkA);
  assert.equal(remote.chunkId, chunkA);
  assert.equal(remote.revision, 5);
  assert.deepEqual(remote.payload, envelope('remote'));
  assert.equal(remote.pendingAction, null);
});

test('adoptRemoteChunk replaces local ciphertext and clears pending state', async () => {
  const cache = memoryCache([{
    chunkId: chunkA, revision: 4, updatedAt: 'old', deletedAt: null,
    payload: envelope('local'), pendingAction: 'upsert'
  }]);
  const remote = {
    chunkId: chunkA, revision: 5, updatedAt: 'new', deletedAt: null,
    payload: envelope('remote'), pendingAction: null
  };
  await syncApi.adoptRemoteChunk(cache, remote);
  const local = await cache.get(chunkA);
  assert.equal(local.revision, 5);
  assert.equal(local.pendingAction, null);
  assert.deepEqual(local.payload, envelope('remote'));
});

test('cleanupRemoteTombstones clamps retention to 90 days and returns count', async () => {
  const vault = fakeVault();
  const count = await syncApi.cleanupRemoteTombstones(vault, 3);
  assert.equal(count, 2);
  const call = vault.calls.find((item) => item.path === '/rest/v1/rpc/cleanup_manga_reader_encrypted_chunk_tombstones');
  assert.ok(call);
  assert.deepEqual(JSON.parse(call.options.body), { retention_days: 90 });
});

test('syncCache labels metadata/transport failures as the global sync error', async () => {
  const vault = {
    async withSession(work) { return work('token', { id: 'user' }); },
    async api() { throw new Error('network unavailable'); }
  };
  const result = await syncApi.syncCache({ vault, cache: memoryCache() });
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].chunkId, '__global__');
  assert.match(result.errors[0].error.message, /network unavailable/);
});
