(()=>{
'use strict';

const TABLE = 'manga_reader_encrypted_chunks';
const METADATA_SELECT = 'chunk_id,revision,deleted_at,updated_at';
const PAYLOAD_SELECT = 'chunk_id,payload,revision,deleted_at,updated_at';
const DEFAULT_PAYLOAD_BATCH_SIZE = 50;

const text = (value) => String(value ?? '').trim();
const number = (value) => Number(value ?? 0);

function localRecord(row) {
  return {
    chunkId: text(row.chunkId ?? row.chunk_id),
    revision: number(row.revision),
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    deletedAt: row.deletedAt ?? row.deleted_at ?? null,
    payload: row.payload,
    pendingAction: row.pendingAction ?? null
  };
}

function remoteMeta(row) {
  return {
    chunkId: text(row.chunk_id ?? row.chunkId),
    revision: number(row.revision),
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    deletedAt: row.deleted_at ?? row.deletedAt ?? null
  };
}

function remoteRow(row) {
  return { ...remoteMeta(row), payload: row.payload, pendingAction: null };
}

function conflict(chunkId, reason, local, remote) {
  return {
    chunkId,
    reason,
    localRevision: local ? local.revision : null,
    remoteRevision: remote ? remote.revision : null,
    remoteDeletedAt: remote ? remote.deletedAt : null
  };
}

async function fetchRemoteMetadata(vault) {
  return vault.withSession(async (token) => {
    const rows = await vault.api(`/rest/v1/${TABLE}?select=${METADATA_SELECT}&order=updated_at.asc`, { token });
    return (rows || []).map(remoteMeta);
  });
}

async function fetchRemotePayloads(vault, chunkIds, batchSize = DEFAULT_PAYLOAD_BATCH_SIZE) {
  const ids = [...new Set((chunkIds || []).map(text).filter(Boolean))];
  const size = Math.max(1, Math.min(100, Number(batchSize) || DEFAULT_PAYLOAD_BATCH_SIZE));
  if (!ids.length) return [];
  return vault.withSession(async (token) => {
    const results = [];
    for (let offset = 0; offset < ids.length; offset += size) {
      const batch = ids.slice(offset, offset + size);
      const expression = batch.join(',');
      const rows = await vault.api(`/rest/v1/${TABLE}?select=${PAYLOAD_SELECT}&chunk_id=in.(${expression})`, { token });
      results.push(...(rows || []).map(remoteRow));
    }
    return results;
  });
}

async function fetchRemoteChunk(vault, chunkId) {
  const id = text(chunkId);
  if (!id) throw new Error('chunkId is required');
  return vault.withSession(async (token) => {
    const rows = await vault.api(`/rest/v1/${TABLE}?select=${PAYLOAD_SELECT}&chunk_id=eq.${encodeURIComponent(id)}&limit=1`, { token });
    return rows && rows[0] ? remoteRow(rows[0]) : null;
  });
}

async function adoptRemoteChunk(cache, row) {
  if (!cache || typeof cache.put !== 'function') throw new Error('encrypted chunk cache is required');
  if (!row) return null;
  const safe = { ...remoteRow(row), pendingAction: null };
  await cache.put(safe);
  return safe;
}

async function cleanupRemoteTombstones(vault, retentionDays = 90) {
  const days = Math.max(90, Math.floor(Number(retentionDays) || 90));
  return vault.withSession(async (token) => {
    const rows = await vault.api('/rest/v1/rpc/cleanup_manga_reader_encrypted_chunk_tombstones', {
      method: 'POST',
      token,
      body: JSON.stringify({ retention_days: days })
    });
    const first = rows && rows[0];
    return Number(first && (first.deleted_count ?? first.cleanup_manga_reader_encrypted_chunk_tombstones) || 0);
  });
}

async function insertRemoteChunk(vault, record) {
  return vault.withSession(async (token, user) => {
    try {
      const rows = await vault.api(`/rest/v1/${TABLE}?on_conflict=user_id,chunk_id`, {
        method: 'POST',
        token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: user.id, chunk_id: record.chunkId, payload: record.payload })
      });
      const row = rows && rows[0];
      return row ? remoteRow(row) : null;
    } catch (error) {
      if (String(error && error.message || '').includes('(409)')) return null;
      throw error;
    }
  });
}

async function updateRemoteChunk(vault, record) {
  return vault.withSession(async (token) => {
    const rows = await vault.api('/rest/v1/rpc/update_manga_reader_encrypted_chunk', {
      method: 'POST', token,
      body: JSON.stringify({ expected_chunk_id: record.chunkId, expected_revision: record.revision, new_payload: record.payload })
    });
    const row = rows && rows[0];
    return row ? {
      chunkId: record.chunkId,
      revision: number(row.revision),
      updatedAt: row.updated_at ?? null,
      deletedAt: row.deleted_at ?? null,
      payload: record.payload,
      pendingAction: null
    } : null;
  });
}

async function tombstoneRemoteChunk(vault, record) {
  return vault.withSession(async (token) => {
    const rows = await vault.api('/rest/v1/rpc/tombstone_manga_reader_encrypted_chunk', {
      method: 'POST', token,
      body: JSON.stringify({ expected_chunk_id: record.chunkId, expected_revision: record.revision })
    });
    const row = rows && rows[0];
    return row ? {
      chunkId: record.chunkId,
      revision: number(row.revision),
      updatedAt: row.updated_at ?? null,
      deletedAt: row.deleted_at ?? null,
      payload: record.payload,
      pendingAction: null
    } : null;
  });
}

async function applyPending({ vault, cache, local, remote, conflicts, errors }) {
  try {
    if (local.pendingAction === 'upsert') {
      if (remote && remote.deletedAt) {
        await cache.put({ ...local, revision: Math.max(local.revision, remote.revision), updatedAt: remote.updatedAt, deletedAt: remote.deletedAt });
        conflicts.push(conflict(local.chunkId, 'remote-deleted', local, remote));
        return;
      }
      if (local.revision === 0) {
        if (remote) {
          conflicts.push(conflict(local.chunkId, 'remote-exists', local, remote));
          return;
        }
        const created = await insertRemoteChunk(vault, local);
        if (!created) {
          conflicts.push(conflict(local.chunkId, 'insert-conflict', local, remote));
          return;
        }
        await cache.put(created);
        return;
      }
      if (!remote) {
        conflicts.push(conflict(local.chunkId, 'remote-missing', local, remote));
        return;
      }
      if (remote.revision !== local.revision) {
        conflicts.push(conflict(local.chunkId, 'revision-mismatch', local, remote));
        return;
      }
      const updated = await updateRemoteChunk(vault, local);
      if (!updated) {
        conflicts.push(conflict(local.chunkId, 'cas-conflict', local, remote));
        return;
      }
      await cache.put(updated);
      return;
    }

    if (local.pendingAction === 'delete') {
      if (local.revision === 0 && !remote) {
        await cache.remove(local.chunkId);
        return;
      }
      if (!remote) {
        conflicts.push(conflict(local.chunkId, 'remote-missing', local, remote));
        return;
      }
      if (remote.deletedAt) {
        await cache.put({ ...local, revision: remote.revision, updatedAt: remote.updatedAt, deletedAt: remote.deletedAt, pendingAction: null });
        return;
      }
      if (remote.revision !== local.revision) {
        conflicts.push(conflict(local.chunkId, 'revision-mismatch', local, remote));
        return;
      }
      const deleted = await tombstoneRemoteChunk(vault, local);
      if (!deleted) {
        conflicts.push(conflict(local.chunkId, 'cas-conflict', local, remote));
        return;
      }
      await cache.put(deleted);
    }
  } catch (error) {
    errors.push({ chunkId: local.chunkId, error });
  }
}

async function syncCache({ vault, cache, payloadBatchSize = DEFAULT_PAYLOAD_BATCH_SIZE } = {}) {
  if (!vault || typeof vault.withSession !== 'function' || typeof vault.api !== 'function') throw new Error('vault API is required');
  if (!cache || typeof cache.list !== 'function' || typeof cache.put !== 'function') throw new Error('encrypted chunk cache is required');

  const conflicts = [];
  const errors = [];
  let metadata;
  try {
    metadata = await fetchRemoteMetadata(vault);
  } catch (error) {
    return { records: await cache.list(), conflicts, errors: [{ chunkId: null, error }] };
  }
  let remoteMap = new Map(metadata.map((row) => [row.chunkId, row]));

  const initialLocal = (await cache.list()).map(localRecord);
  for (const local of initialLocal) {
    if (!local.pendingAction) continue;
    await applyPending({ vault, cache, local, remote: remoteMap.get(local.chunkId) || null, conflicts, errors });
  }

  try {
    metadata = await fetchRemoteMetadata(vault);
    remoteMap = new Map(metadata.map((row) => [row.chunkId, row]));
  } catch (error) {
    errors.push({ chunkId: null, error });
    return { records: await cache.list(), conflicts, errors };
  }

  const locals = (await cache.list()).map(localRecord);
  const localMap = new Map(locals.map((row) => [row.chunkId, row]));
  const downloadIds = [];

  for (const remote of metadata) {
    const local = localMap.get(remote.chunkId) || null;
    if (local && local.pendingAction) continue;

    if (remote.deletedAt) {
      if (local && remote.revision >= local.revision) {
        await cache.put({ ...local, revision: remote.revision, updatedAt: remote.updatedAt, deletedAt: remote.deletedAt, pendingAction: null });
      }
      continue;
    }

    if (!local || remote.revision > local.revision || local.deletedAt) downloadIds.push(remote.chunkId);
  }

  try {
    const downloaded = await fetchRemotePayloads(vault, downloadIds, payloadBatchSize);
    for (const row of downloaded) await cache.put(row);
  } catch (error) {
    errors.push({ chunkId: null, error });
  }

  return { records: await cache.list(), conflicts, errors };
}

const api = {
  TABLE,
  DEFAULT_PAYLOAD_BATCH_SIZE,
  fetchRemoteMetadata,
  fetchRemotePayloads,
  fetchRemoteChunk,
  adoptRemoteChunk,
  cleanupRemoteTombstones,
  insertRemoteChunk,
  updateRemoteChunk,
  tombstoneRemoteChunk,
  syncCache
};
if (typeof window !== 'undefined') window.EncryptedChunkSync = api;
if (typeof module !== 'undefined') module.exports = api;
})();
