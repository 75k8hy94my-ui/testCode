(()=>{
'use strict';
const TABLE = 'manga_reader_encrypted_chunks';
const UPDATE_RPC = 'update_manga_reader_encrypted_chunk';
const DELETE_RPC = 'delete_manga_reader_encrypted_chunk';
const MAX_BATCH_WRITES = 4;
const normalizeRow = (row) => ({
  chunkId: String(row && (row.chunk_id ?? row.chunkId) || ''),
  revision: Number(row && row.revision || 0),
  payload: row && row.payload,
  deletedAt: row && (row.deleted_at ?? row.deletedAt) || null,
  updatedAt: row && (row.updated_at ?? row.updatedAt) || null
});
function vault() {
  if (!globalThis.MangaVault) throw new Error('保管庫の同期機能を読み込めませんでした。');
  return globalThis.MangaVault;
}
async function mapLimit(items, limit, worker) {
  const input = Array.from(items || []);
  if (!input.length) return [];
  const size = Math.max(1, Math.min(Number(limit) || 1, input.length));
  const output = new Array(input.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= input.length) return;
      output[index] = await worker(input[index], index);
    }
  }
  await Promise.all(Array.from({ length: size }, run));
  return output;
}
async function fetchMetadata() {
  const V = vault();
  return V.withSession(async (token, user) => {
    const path = `/rest/v1/${TABLE}?select=chunk_id,revision,deleted_at,updated_at&user_id=eq.${encodeURIComponent(user.id)}&order=chunk_id.asc`;
    const rows = await V.api(path, { token });
    return (Array.isArray(rows) ? rows : []).map(normalizeRow);
  });
}
async function fetchPayloads(chunkIds) {
  const ids = Array.from(new Set((chunkIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return [];
  const V = vault();
  return V.withSession(async (token, user) => {
    const batches = [];
    for (let index = 0; index < ids.length; index += 50) batches.push(ids.slice(index, index + 50));
    const pages = await mapLimit(batches, 3, async (batch) => {
      const inFilter = encodeURIComponent(`(${batch.join(',')})`);
      const path = `/rest/v1/${TABLE}?select=chunk_id,revision,payload,deleted_at,updated_at&user_id=eq.${encodeURIComponent(user.id)}&chunk_id=in.${inFilter}`;
      const rows = await V.api(path, { token });
      return (Array.isArray(rows) ? rows : []).map(normalizeRow);
    });
    return pages.flat();
  });
}
async function insertChunk({ chunkId, payload }) {
  if (!chunkId || !payload) throw new Error('暗号化チャンクの追加内容が正しくありません。');
  const V = vault();
  return V.withSession(async (token, user) => {
    const rows = await V.api(`/rest/v1/${TABLE}`, {
      method: 'POST', token,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: user.id, chunk_id: chunkId, payload })
    });
    const row = Array.isArray(rows) && rows[0];
    if (!row) throw new Error('索引データをクラウドへ追加できませんでした。');
    return normalizeRow(row);
  });
}
async function replaceChunk({ chunkId, expectedRevision, payload }) {
  if (!chunkId || !Number.isFinite(Number(expectedRevision)) || !payload) throw new Error('暗号化チャンクの更新内容が正しくありません。');
  const V = vault();
  return V.withSession(async (token) => {
    const rows = await V.api(`/rest/v1/rpc/${UPDATE_RPC}`, {
      method: 'POST', token,
      body: JSON.stringify({ p_chunk_id: chunkId, p_expected_revision: Number(expectedRevision), p_new_payload: payload })
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('別の端末で同じ書籍が更新されています。');
    return { chunkId, payload, ...normalizeRow(rows[0]) };
  });
}
async function deleteChunk({ chunkId, expectedRevision }) {
  if (!chunkId || !Number.isFinite(Number(expectedRevision))) throw new Error('暗号化チャンクの削除内容が正しくありません。');
  const V = vault();
  return V.withSession(async (token) => {
    const rows = await V.api(`/rest/v1/rpc/${DELETE_RPC}`, {
      method: 'POST', token,
      body: JSON.stringify({ p_chunk_id: chunkId, p_expected_revision: Number(expectedRevision) })
    });
    if (!Array.isArray(rows) || !rows.length) throw new Error('別の端末で同じ書籍が更新されています。');
    return { chunkId, ...normalizeRow(rows[0]) };
  });
}
async function uploadPending(cache, remoteMap, conflicts, failures) {
  const localRows = await cache.list();
  const pending = localRows.filter((row) => row && row.pendingAction);
  await mapLimit(pending, MAX_BATCH_WRITES, async (local) => {
    const remote = remoteMap.get(local.chunkId);
    const baseRevision = Number.isFinite(Number(local.baseRevision)) ? Number(local.baseRevision) : Number(local.revision || 0);
    if (remote && remote.deletedAt) {
      conflicts.push({ chunkId: local.chunkId, reason: 'remote-deleted' });
      if (local.payload) await cache.put({ ...local, revision: remote.revision, deletedAt: remote.deletedAt, updatedAt: remote.updatedAt, pendingAction: null, baseRevision: null });
      return;
    }
    if (local.pendingAction !== 'insert' && remote && remote.revision !== baseRevision) {
      conflicts.push({ chunkId: local.chunkId, reason: 'revision-conflict' });
      return;
    }
    if (local.pendingAction === 'insert' && remote) {
      conflicts.push({ chunkId: local.chunkId, reason: 'already-exists' });
      return;
    }
    try {
      let saved;
      if (local.pendingAction === 'insert') saved = await insertChunk({ chunkId: local.chunkId, payload: local.payload });
      else if (local.pendingAction === 'replace') saved = await replaceChunk({ chunkId: local.chunkId, expectedRevision: baseRevision, payload: local.payload });
      else saved = await deleteChunk({ chunkId: local.chunkId, expectedRevision: baseRevision });
      const payload = local.payload;
      await cache.put({ chunkId: local.chunkId, revision: saved.revision, deletedAt: saved.deletedAt, updatedAt: saved.updatedAt, payload, pendingAction: null, baseRevision: null });
      remoteMap.set(local.chunkId, { chunkId: local.chunkId, revision: saved.revision, deletedAt: saved.deletedAt, updatedAt: saved.updatedAt });
    } catch (error) {
      failures.push({ chunkId: local.chunkId, error: error && error.message ? error.message : String(error) });
    }
  });
}
async function sync(cache, { upload = true } = {}) {
  if (!cache || typeof cache.list !== 'function' || typeof cache.put !== 'function') throw new Error('索引キャッシュが利用できません。');
  const localRows = await cache.list();
  const localMap = new Map(localRows.map((row) => [row.chunkId, row]));
  const metadata = await fetchMetadata();
  const remoteMap = new Map(metadata.map((row) => [row.chunkId, row]));
  const conflicts = [];
  const failures = [];
  const changed = [];
  const downloadIds = [];

  for (const remote of metadata) {
    const local = localMap.get(remote.chunkId);
    if (remote.deletedAt) {
      if (local && (!local.deletedAt || remote.revision >= Number(local.revision || 0))) {
        await cache.put({ ...local, revision: remote.revision, deletedAt: remote.deletedAt, updatedAt: remote.updatedAt, pendingAction: null, baseRevision: null });
        changed.push(remote.chunkId);
      }
      continue;
    }
    if (local && local.pendingAction) {
      const baseRevision = Number.isFinite(Number(local.baseRevision)) ? Number(local.baseRevision) : Number(local.revision || 0);
      if (remote.revision > baseRevision) conflicts.push({ chunkId: remote.chunkId, reason: 'revision-conflict' });
      continue;
    }
    if (!local || remote.revision > Number(local.revision || 0) || local.deletedAt) downloadIds.push(remote.chunkId);
  }

  if (downloadIds.length) {
    const rows = await fetchPayloads(downloadIds);
    for (const row of rows) {
      if (!row.payload || row.deletedAt) continue;
      await cache.put({ chunkId: row.chunkId, revision: row.revision, deletedAt: null, updatedAt: row.updatedAt, payload: row.payload, pendingAction: null, baseRevision: null });
      changed.push(row.chunkId);
    }
  }

  if (upload) await uploadPending(cache, remoteMap, conflicts, failures);
  return { changed: Array.from(new Set(changed)), conflicts, failures, metadata };
}
const api = { TABLE, MAX_BATCH_WRITES, fetchMetadata, fetchPayloads, insertChunk, replaceChunk, deleteChunk, sync, mapLimit };
if (typeof window !== 'undefined') window.EncryptedChunkSync = api;
if (typeof module !== 'undefined') module.exports = api;
})();
