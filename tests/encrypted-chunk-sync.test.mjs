import test from 'node:test';
import assert from 'node:assert/strict';
import syncApi from '../encrypted-chunk-sync.js';

const envelope = (label) => ({
  type: 'manga-reader-encrypted-chunk', version: 1, algorithm: 'AES-256-GCM', kdf: 'HKDF-SHA-256', iv: `iv-${label}`, ciphertext: `cipher-${label}`
});

function memoryCache(initial = []) {
  const map = new Map(initial.map((row) => [row.chunkId, structuredClone(row)]));
  return {
    async list() { return [...map.values()].map((row) => structuredClone(row)); },
    async get(id) { return map.has(id) ? structuredClone(map.get(id)) : null; },
    async put(row) { map.set(row.chunkId, structuredClone(row)); return structuredClone(row); },
    async remove(id) { map.delete(id); },
    snapshot() { return [...map.values()].map((row) => structuredClone(row)); }
  };
}

function fakeVault({ userId = '00000000-0000-4000-8000-000000000001', metadata = [], rows = [], rpc = {} } = {}) {
  const calls = [];
  const state = { metadata: structuredClone(metadata), rows: structuredClone(rows) };
  return {
    calls,
    state,
    async withSession(work) { return work('token', { id: userId }); },
    async api(path, options = {}) {
      calls.push({ path, options: structuredClone(options) });
      if (path.startsWith('/rest/v1/manga_reader_encrypted_chunks?select=chunk_id,revision,deleted_at,updated_at')) return structuredClone(state.metadata);
      if (path.startsWith('/rest/v1/manga_reader_encrypted_chunks?select=chunk_id,payload,revision,deleted_at,updated_at')) {
        return structuredClone(state.rows.filter((row) => path.includes(row.chunk_id)));
      }
      if (path.startsWith('/rest/v1/manga_reader_encrypted_chunks?on_conflict=')) {
        const body = JSON.parse(options.body);
        const row = { chunk_id: body.chunk_id, payload: body.payload, revision: 1, deleted_at: null, updated_at: '2026-09-04T00:01:00.000Z' };
        state.metadata.push({ chunk_id: row.chunk_id, revision: 1, deleted_at: null, updated_at: row.updated_at });
        state.rows.push(row);
        return [structuredClone(row)];
      }
      if (path === '/rest/v1/rpc/update_manga_reader_encrypted_chunk') {
        const body = JSON.parse(options.body);
        if (rpc.update === 'conflict') return [];
        const meta = state.metadata.find((item) => item.chunk_id === body.expected_chunk_id);
        if (!meta || meta.revision !== body.expected_revision || meta.deleted_at) return [];
        meta.revision += 1; meta.updated_at = '2026-09-04T00:02:00.000Z';
        const row = state.rows.find((item) => item.chunk_id === body.expected_chunk_id);
        row.payload = body.new_payload; row.revision = meta.revision; row.updated_at = meta.updated_at;
        return [{ revision: meta.revision, updated_at: meta.updated_at, deleted_at: null }];
      }
      if (path === '/rest/v1/rpc/tombstone_manga_reader_encrypted_chunk') {
        const body = JSON.parse(options.body);
        if (rpc.delete === 'conflict') return [];
        const meta = state.metadata.find((item) => item.chunk_id === body.expected_chunk_id);
        if (!meta || meta.revision !== body.expected_revision || meta.deleted_at) return [];
        meta.revision += 1; meta.deleted_at = '2026-09-04T00:03:00.000Z'; meta.updated_at = meta.deleted_at;
        const row = state.rows.find((item) => item.chunk_id === body.expected_chunk_id);
        if (row) { row.revision = meta.revision; row.deleted_at = meta.deleted_at; row.updated_at = meta.updated_at; }
        return [{ revision: meta.revision, updated_at: meta.updated_at, deleted_at: meta.deleted_at }];
      }
      throw new Error(`unexpected API call: ${path}`);
    }
  };
}

const chunkA = '11111111-1111-4111-8111-111111111111';
const chunkB = '22222222-2222-4222-8222-222222222222';

test('new offline chunk uploads once and persists returned revision without plaintext', async () => {
  const cache = memoryCache([{ chunkId: chunkA, revision: 0, updatedAt: null, deletedAt: null, payload: envelope('new'), pendingAction: 'upsert' }]);
  const vault = fakeVault();
  const result = await syncApi.syncCache({ vault, cache });
  assert.deepEqual(result.conflicts, []);
  const local = await cache.get(chunkA);
  assert.equal(local.revision, 1);
  assert.equal(local.pendingAction, null);
  const post = vault.calls.find((call) => call.options.method === 'POST' && call.path.includes('on_conflict'));
  assert.ok(post);
  assert.equal(post.options.body.includes('bookTitle'), false);
  assert.equal(post.options.body.includes('債権者代位権'), false);
});

test('existing local edit uses per-chunk CAS and only updates matching revision', async () => {
  const cache = memoryCache([{ chunkId: chunkA, revision: 4, updatedAt: 'old', deletedAt: null, payload: envelope('local-edit'), pendingAction: 'upsert' }]);
  const vault = fakeVault({
    metadata: [{ chunk_id: chunkA, revision: 4, deleted_at: null, updated_at: 'remote' }],
    rows: [{ chunk_id: chunkA, revision: 4, deleted_at: null, updated_at: 'remote', payload: envelope('old') }]
  });
  const result = await syncApi.syncCache({ vault, cache });
  assert.deepEqual(result.conflicts, []);
  assert.equal((await cache.get(chunkA)).revision, 5);
  assert.ok(vault.calls.some((call) => call.path === '/rest/v1/rpc/update_manga_reader_encrypted_chunk'));
});

test('revision mismatch preserves local pending ciphertext and reports a conflict', async () => {
  const localPayload = envelope('mine');
  const cache = memoryCache([{ chunkId: chunkA, revision: 4, updatedAt: 'old', deletedAt: null, payload: localPayload, pendingAction: 'upsert' }]);
  const vault = fakeVault({ metadata: [{ chunk_id: chunkA, revision: 5, deleted_at: null, updated_at: 'new' }], rows: [{ chunk_id: chunkA, revision: 5, deleted_at: null, updated_at: 'new', payload: envelope('theirs') }] });
  const result = await syncApi.syncCache({ vault, cache });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].chunkId, chunkA);
  assert.deepEqual((await cache.get(chunkA)).payload, localPayload);
  assert.equal((await cache.get(chunkA)).pendingAction, 'upsert');
});

test('remote higher revision downloads only changed active chunks', async () => {
  const cache = memoryCache([
    { chunkId: chunkA, revision: 3, updatedAt: 'a', deletedAt: null, payload: envelope('a3'), pendingAction: null },
    { chunkId: chunkB, revision: 7, updatedAt: 'b', deletedAt: null, payload: envelope('b7'), pendingAction: null }
  ]);
  const vault = fakeVault({
    metadata: [
      { chunk_id: chunkA, revision: 4, deleted_at: null, updated_at: 'a4' },
      { chunk_id: chunkB, revision: 7, deleted_at: null, updated_at: 'b7' }
    ],
    rows: [
      { chunk_id: chunkA, revision: 4, deleted_at: null, updated_at: 'a4', payload: envelope('a4') },
      { chunk_id: chunkB, revision: 7, deleted_at: null, updated_at: 'b7', payload: envelope('b7') }
    ]
  });
  await syncApi.syncCache({ vault, cache });
  assert.equal((await cache.get(chunkA)).revision, 4);
  assert.deepEqual((await cache.get(chunkA)).payload, envelope('a4'));
  assert.equal((await cache.get(chunkB)).revision, 7);
  const payloadCalls = vault.calls.filter((call) => call.path.startsWith('/rest/v1/manga_reader_encrypted_chunks?select=chunk_id,payload'));
  assert.ok(payloadCalls.every((call) => call.path.includes(chunkA) && !call.path.includes(chunkB)));
});

test('remote tombstone removes chunk from active local use and stale edit cannot resurrect it', async () => {
  const cache = memoryCache([{ chunkId: chunkA, revision: 4, updatedAt: 'old', deletedAt: null, payload: envelope('stale'), pendingAction: 'upsert' }]);
  const vault = fakeVault({ metadata: [{ chunk_id: chunkA, revision: 5, deleted_at: '2026-09-04T00:03:00.000Z', updated_at: '2026-09-04T00:03:00.000Z' }], rows: [{ chunk_id: chunkA, revision: 5, deleted_at: '2026-09-04T00:03:00.000Z', updated_at: '2026-09-04T00:03:00.000Z', payload: envelope('stale') }] });
  const result = await syncApi.syncCache({ vault, cache });
  assert.equal(result.conflicts[0].reason, 'remote-deleted');
  assert.equal(vault.calls.some((call) => call.path === '/rest/v1/rpc/update_manga_reader_encrypted_chunk'), false);
});

test('pending delete creates a revisioned tombstone and keeps ciphertext opaque locally', async () => {
  const cache = memoryCache([{ chunkId: chunkA, revision: 2, updatedAt: 'old', deletedAt: null, payload: envelope('book'), pendingAction: 'delete' }]);
  const vault = fakeVault({ metadata: [{ chunk_id: chunkA, revision: 2, deleted_at: null, updated_at: 'old' }], rows: [{ chunk_id: chunkA, revision: 2, deleted_at: null, updated_at: 'old', payload: envelope('book') }] });
  const result = await syncApi.syncCache({ vault, cache });
  assert.deepEqual(result.conflicts, []);
  const local = await cache.get(chunkA);
  assert.equal(local.revision, 3);
  assert.ok(local.deletedAt);
  assert.equal(local.pendingAction, null);
  assert.deepEqual(local.payload, envelope('book'));
});

test('new device fetches all active remote payloads in bounded batches while ignoring tombstone-only rows', async () => {
  const active = Array.from({ length: 105 }, (_, i) => {
    const suffix = String(i + 1).padStart(12, '0');
    const id = `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`;
    return { chunk_id: id, revision: 1, deleted_at: null, updated_at: 'now', payload: envelope(String(i)) };
  });
  const tombstone = { chunk_id: chunkB, revision: 2, deleted_at: 'deleted', updated_at: 'deleted' };
  const vault = fakeVault({ metadata: [...active.map(({ payload, ...m }) => m), tombstone], rows: active });
  const cache = memoryCache();
  await syncApi.syncCache({ vault, cache, payloadBatchSize: 50 });
  assert.equal(cache.snapshot().length, 105);
  const payloadCalls = vault.calls.filter((call) => call.path.startsWith('/rest/v1/manga_reader_encrypted_chunks?select=chunk_id,payload'));
  assert.equal(payloadCalls.length, 3);
});
