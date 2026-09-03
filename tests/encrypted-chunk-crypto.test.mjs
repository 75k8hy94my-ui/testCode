import test from 'node:test';
import assert from 'node:assert/strict';

let ChunkCrypto = {};
try { ChunkCrypto = (await import('../encrypted-chunk-crypto.js')).default || {}; } catch (_) {}
const requireApi = (name) => assert.equal(typeof ChunkCrypto[name], 'function', `${name} should exist`);
const master = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const chunkA = '11111111-1111-4111-8111-111111111111';
const chunkB = '22222222-2222-4222-8222-222222222222';
const value = { type:'index-book', version:1, bookId:'book-a', book:{ title:'基本民法', subjects:['民法'] }, matterEntries:[{ term:'錯誤', pages:['20'] }] };

test('derives a non-extractable per-chunk AES key from the vault master key', async () => {
  requireApi('deriveChunkKey');
  const key = await ChunkCrypto.deriveChunkKey(master, chunkA);
  assert.equal(key.type, 'secret');
  assert.equal(key.algorithm.name, 'AES-GCM');
  assert.equal(key.extractable, false);
});

test('encrypts and decrypts one index-book chunk round trip', async () => {
  requireApi('encryptChunk');
  requireApi('decryptChunk');
  const envelope = await ChunkCrypto.encryptChunk(master, chunkA, value);
  assert.equal(envelope.type, 'manga-reader-encrypted-chunk');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.equal(typeof envelope.iv, 'string');
  assert.equal(typeof envelope.ciphertext, 'string');
  assert.deepEqual(await ChunkCrypto.decryptChunk(master, chunkA, envelope), value);
});

test('chunk id is authenticated and a different chunk cannot decrypt the payload', async () => {
  requireApi('encryptChunk');
  requireApi('decryptChunk');
  const envelope = await ChunkCrypto.encryptChunk(master, chunkA, value);
  await assert.rejects(() => ChunkCrypto.decryptChunk(master, chunkB, envelope));
});

test('tampering with ciphertext fails authentication', async () => {
  requireApi('encryptChunk');
  requireApi('decryptChunk');
  const envelope = await ChunkCrypto.encryptChunk(master, chunkA, value);
  const first = envelope.ciphertext[0];
  const tampered = { ...envelope, ciphertext: (first === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) };
  await assert.rejects(() => ChunkCrypto.decryptChunk(master, chunkA, tampered));
});

test('fresh random IV makes repeated encryption of the same chunk unlinkable by ciphertext equality', async () => {
  requireApi('encryptChunk');
  const first = await ChunkCrypto.encryptChunk(master, chunkA, value);
  const second = await ChunkCrypto.encryptChunk(master, chunkA, value);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});
