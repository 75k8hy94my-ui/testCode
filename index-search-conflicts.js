(()=>{
'use strict';

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? '').trim();
const pageKey = (pages) => JSON.stringify(Array.isArray(pages) ? pages.map(text) : []);

function requireSearchApi(searchApi) {
  if (!searchApi || typeof searchApi.normalizeCompact !== 'function' || typeof searchApi.caseIdentityKey !== 'function' || typeof searchApi.statuteIdentityKey !== 'function') {
    throw new Error('legal index search API is required');
  }
  return searchApi;
}

function entryKey(kind, entry, searchApi) {
  const Search = requireSearchApi(searchApi);
  if (kind === 'matter') return `${Search.normalizeCompact(entry && entry.term)}|${pageKey(entry && entry.pages)}`;
  if (kind === 'case') return `${Search.caseIdentityKey(entry || {})}|${pageKey(entry && entry.pages)}`;
  if (kind === 'statute') return `${Search.statuteIdentityKey(entry || {})}|${pageKey(entry && entry.pages)}`;
  throw new Error(`unsupported index kind: ${kind}`);
}

function entryLabel(kind, entry) {
  if (kind === 'matter') return text(entry && entry.term);
  if (kind === 'case') return text(entry && entry.citationText) || [entry && entry.court, entry && entry.date, entry && entry.reporter, entry && entry.reportPage].map(text).filter(Boolean).join(' ');
  if (kind === 'statute') return text(entry && entry.citationText) || [entry && entry.statute, entry && entry.article && `${entry.article}条`, entry && entry.paragraph && `${entry.paragraph}項`, entry && entry.item && `${entry.item}号`].map(text).filter(Boolean).join('');
  return '';
}

function counts(book) {
  return {
    matter: Array.isArray(book && book.matterEntries) ? book.matterEntries.length : 0,
    case: Array.isArray(book && book.caseEntries) ? book.caseEntries.length : 0,
    statute: Array.isArray(book && book.statuteEntries) ? book.statuteEntries.length : 0
  };
}

function summary(book) {
  return {
    title: text(book && book.book && book.book.title),
    subjects: Array.isArray(book && book.book && book.book.subjects) ? book.book.subjects.map(text).filter(Boolean) : [],
    counts: counts(book)
  };
}

function changedForKind(kind, localEntries, remoteEntries, searchApi) {
  const localMap = new Map((localEntries || []).map((entry) => [entryKey(kind, entry, searchApi), entry]));
  const remoteMap = new Map((remoteEntries || []).map((entry) => [entryKey(kind, entry, searchApi), entry]));
  const changes = [];
  for (const [key, entry] of localMap) {
    if (!remoteMap.has(key)) changes.push({ kind, side: 'local', label: entryLabel(kind, entry), pages: clone(entry.pages || []) });
  }
  for (const [key, entry] of remoteMap) {
    if (!localMap.has(key)) changes.push({ kind, side: 'remote', label: entryLabel(kind, entry), pages: clone(entry.pages || []) });
  }
  return changes;
}

function compareBooks(localBook, remoteBook, searchApi, limit = 100) {
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  const all = [
    ...changedForKind('matter', localBook && localBook.matterEntries, remoteBook && remoteBook.matterEntries, searchApi),
    ...changedForKind('case', localBook && localBook.caseEntries, remoteBook && remoteBook.caseEntries, searchApi),
    ...changedForKind('statute', localBook && localBook.statuteEntries, remoteBook && remoteBook.statuteEntries, searchApi)
  ];
  return {
    local: summary(localBook),
    remote: summary(remoteBook),
    totalChanged: all.length,
    changes: all.slice(0, max)
  };
}

async function useCloudVersion({ cache, syncApi, remoteRow } = {}) {
  if (!cache || !syncApi || typeof syncApi.adoptRemoteChunk !== 'function') throw new Error('cache and sync API are required');
  if (!remoteRow) throw new Error('remote row is required');
  return syncApi.adoptRemoteChunk(cache, remoteRow);
}

async function saveLocalAsSeparate({ cache, cryptoApi, masterKey, localBook, originalRemoteRow, randomUUID } = {}) {
  if (!cache || typeof cache.put !== 'function' || typeof cache.remove !== 'function') throw new Error('encrypted chunk cache is required');
  if (!cryptoApi || typeof cryptoApi.encryptChunk !== 'function') throw new Error('encrypted chunk crypto API is required');
  const makeId = typeof randomUUID === 'function' ? randomUUID : (globalThis.crypto && globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID.bind(globalThis.crypto) : null);
  if (!makeId) throw new Error('random UUID generator is required');
  if (!localBook || localBook.type !== 'index-book') throw new Error('local index book is required');

  const originalChunkId = text(localBook.chunkId);
  const duplicate = clone(localBook);
  duplicate.bookId = text(makeId());
  duplicate.chunkId = text(makeId());
  if (!duplicate.bookId || !duplicate.chunkId || duplicate.chunkId === originalChunkId) throw new Error('fresh book and chunk ids are required');

  const payload = await cryptoApi.encryptChunk(masterKey, duplicate.chunkId, duplicate);
  await cache.put({ chunkId: duplicate.chunkId, revision: 0, updatedAt: null, deletedAt: null, payload, pendingAction: 'upsert' });

  if (originalRemoteRow) {
    await cache.put({
      chunkId: text(originalRemoteRow.chunkId ?? originalRemoteRow.chunk_id),
      revision: Number(originalRemoteRow.revision || 0),
      updatedAt: originalRemoteRow.updatedAt ?? originalRemoteRow.updated_at ?? null,
      deletedAt: originalRemoteRow.deletedAt ?? originalRemoteRow.deleted_at ?? null,
      payload: originalRemoteRow.payload,
      pendingAction: null
    });
  } else if (originalChunkId) {
    await cache.remove(originalChunkId);
  }
  return { book: duplicate, record: await cache.get(duplicate.chunkId) };
}

async function discardMissingRemoteLocal({ cache, chunkId } = {}) {
  if (!cache || typeof cache.remove !== 'function') throw new Error('encrypted chunk cache is required');
  const id = text(chunkId);
  if (!id) throw new Error('chunkId is required');
  await cache.remove(id);
}

const api = { compareBooks, useCloudVersion, saveLocalAsSeparate, discardMissingRemoteLocal };
if (typeof window !== 'undefined') window.IndexSearchConflicts = api;
if (typeof module !== 'undefined') module.exports = api;
})();
