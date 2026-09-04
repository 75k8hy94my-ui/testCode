import test from 'node:test';
import assert from 'node:assert/strict';
import Conflicts from '../index-search-conflicts.js';
import Search from '../legal-index-search.js';

const chunkId = '11111111-1111-4111-8111-111111111111';
const remoteRow = { chunkId, revision: 5, updatedAt: 'remote', deletedAt: null, payload: { ciphertext: 'remote' }, pendingAction: null };

function book({ bookId='book-a', chunk=chunkId, page='4247', subject='民法' } = {}) {
  return {
    type: 'index-book', version: 1, bookId, chunkId: chunk,
    book: { title: '判例教材', authors: [], subjects: [subject] },
    matterEntries: [{ term: '債権者代位権', pages: ['123'] }],
    caseEntries: [{ court: '最高裁判所', date: '1997-12-18', reporter: '民集', volume: '51', issue: '10', reportPage: page, citationText: `最判平成9年12月18日・民集51巻10号${page}頁`, pages: ['200'] }],
    statuteEntries: [{ statute: '民法', article: '423', paragraph: '', item: '', citationText: '民法423条', pages: ['210'] }]
  };
}

function memoryCache(initial) {
  const rows = new Map(initial.map((row) => [row.chunkId, structuredClone(row)]));
  return {
    async get(id) { return rows.has(id) ? structuredClone(rows.get(id)) : null; },
    async put(row) { rows.set(row.chunkId, structuredClone(row)); return structuredClone(row); },
    async remove(id) { rows.delete(id); },
    snapshot() { return [...rows.values()].map((row) => structuredClone(row)); }
  };
}

test('compareBooks uses strict case identity so same-date different reporter pages remain changed', () => {
  const comparison = Conflicts.compareBooks(book({ page: '4247' }), book({ page: '4250' }), Search, 100);
  assert.equal(comparison.local.counts.case, 1);
  assert.equal(comparison.remote.counts.case, 1);
  assert.ok(comparison.totalChanged >= 2);
  assert.ok(comparison.changes.some((change) => change.kind === 'case'));
});

test('compareBooks caps rendered changes but preserves total changed count', () => {
  const local = book();
  const remote = book();
  local.matterEntries = Array.from({ length: 120 }, (_, i) => ({ term: `項目${i}`, pages: ['1'] }));
  remote.matterEntries = [];
  const comparison = Conflicts.compareBooks(local, remote, Search, 100);
  assert.equal(comparison.changes.length, 100);
  assert.equal(comparison.totalChanged, 120);
});

test('useCloudVersion adopts remote ciphertext and clears pending state', async () => {
  const cache = memoryCache([{ chunkId, revision: 4, updatedAt: 'local', deletedAt: null, payload: { ciphertext: 'local' }, pendingAction: 'upsert' }]);
  const syncApi = { async adoptRemoteChunk(target, row) { await target.put({ ...row, pendingAction: null }); return row; } };
  await Conflicts.useCloudVersion({ cache, syncApi, remoteRow });
  const local = await cache.get(chunkId);
  assert.equal(local.revision, 5);
  assert.equal(local.pendingAction, null);
  assert.deepEqual(local.payload, remoteRow.payload);
});

test('saveLocalAsSeparate creates fresh book/chunk ids, revision zero ciphertext, then restores remote original', async () => {
  const cache = memoryCache([{ chunkId, revision: 4, updatedAt: 'local', deletedAt: null, payload: { ciphertext: 'local' }, pendingAction: 'upsert' }]);
  const ids = ['book-new', '22222222-2222-4222-8222-222222222222'];
  const cryptoApi = { async encryptChunk(_key, newChunkId, plaintext) { return { type: 'manga-reader-encrypted-chunk', version: 1, iv: 'new', ciphertext: `${newChunkId}:${plaintext.bookId}` }; } };
  const result = await Conflicts.saveLocalAsSeparate({ cache, cryptoApi, masterKey: new Uint8Array(32), localBook: book(), originalRemoteRow: remoteRow, randomUUID: () => ids.shift() });
  assert.equal(result.book.bookId, 'book-new');
  assert.equal(result.book.chunkId, '22222222-2222-4222-8222-222222222222');
  const duplicate = await cache.get(result.book.chunkId);
  assert.equal(duplicate.revision, 0);
  assert.equal(duplicate.pendingAction, 'upsert');
  assert.notDeepEqual(duplicate.payload, { ciphertext: 'local' });
  const original = await cache.get(chunkId);
  assert.equal(original.revision, 5);
  assert.equal(original.pendingAction, null);
});

test('remote-missing rescue removes stale original only after new encrypted copy is stored', async () => {
  const cache = memoryCache([{ chunkId, revision: 7, updatedAt: 'local', deletedAt: null, payload: { ciphertext: 'local' }, pendingAction: 'upsert' }]);
  const ids = ['book-new', '33333333-3333-4333-8333-333333333333'];
  const cryptoApi = { async encryptChunk() { return { type: 'manga-reader-encrypted-chunk', version: 1, iv: 'new', ciphertext: 'new' }; } };
  await Conflicts.saveLocalAsSeparate({ cache, cryptoApi, masterKey: new Uint8Array(32), localBook: book(), originalRemoteRow: null, randomUUID: () => ids.shift() });
  assert.equal(await cache.get(chunkId), null);
  assert.equal((await cache.get('33333333-3333-4333-8333-333333333333')).pendingAction, 'upsert');
});

test('discardMissingRemoteLocal explicitly removes a stale remote-missing record', async () => {
  const cache = memoryCache([{ chunkId, revision: 7, updatedAt: 'local', deletedAt: null, payload: { ciphertext: 'local' }, pendingAction: 'upsert' }]);
  await Conflicts.discardMissingRemoteLocal({ cache, chunkId });
  assert.equal(await cache.get(chunkId), null);
});
