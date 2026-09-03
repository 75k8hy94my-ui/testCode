import test from 'node:test';
import assert from 'node:assert/strict';
import cacheApi from '../encrypted-chunk-cache.js';

const { sanitizeRecord, DB_NAME, STORE_NAME, VERSION } = cacheApi;
const payload = {
  type: 'manga-reader-encrypted-chunk',
  version: 1,
  algorithm: 'AES-256-GCM',
  kdf: 'HKDF-SHA-256',
  iv: 'YWJj',
  ciphertext: 'ZGVm'
};

test('persistent cache record contains ciphertext metadata only', () => {
  const result = sanitizeRecord({
    chunkId: '11111111-1111-4111-8111-111111111111',
    revision: 7,
    updatedAt: '2026-09-04T00:00:00.000Z',
    deletedAt: null,
    payload,
    pendingAction: 'upsert',
    bookTitle: '絶対に保存しない書名',
    matterEntries: [{ term: '債権者代位権' }],
    plaintext: { secret: true }
  });
  assert.deepEqual(Object.keys(result).sort(), ['chunkId', 'deletedAt', 'payload', 'pendingAction', 'revision', 'updatedAt'].sort());
  assert.equal(JSON.stringify(result).includes('絶対に保存しない書名'), false);
  assert.equal(JSON.stringify(result).includes('債権者代位権'), false);
});

test('cache rejects malformed ciphertext and invalid sync metadata', () => {
  assert.throws(() => sanitizeRecord({ chunkId: 'a', revision: 1, payload: { type: 'plaintext' } }), /encrypted payload/i);
  assert.throws(() => sanitizeRecord({ chunkId: '', revision: 1, payload }), /chunkId/i);
  assert.throws(() => sanitizeRecord({ chunkId: 'a', revision: -1, payload }), /revision/i);
  assert.throws(() => sanitizeRecord({ chunkId: 'a', revision: 1, payload, pendingAction: 'other' }), /pendingAction/i);
});

test('cache constants are versioned and use a dedicated chunk store', () => {
  assert.equal(DB_NAME, 'mangaReaderEncryptedChunks');
  assert.equal(STORE_NAME, 'chunks');
  assert.equal(VERSION, 1);
});
