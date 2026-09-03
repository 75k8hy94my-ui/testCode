import test from 'node:test';
import assert from 'node:assert/strict';
import cryptoApi from '../encrypted-chunk-crypto.js';

const { encryptChunk, decryptChunk, deriveChunkKey, ENVELOPE_TYPE, VERSION } = cryptoApi;
const masterKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const otherKey = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);
const chunkA = '11111111-1111-4111-8111-111111111111';
const chunkB = '22222222-2222-4222-8222-222222222222';
const plaintext = {
  type: 'index-book',
  version: 1,
  bookId: 'book-a',
  chunkId: chunkA,
  book: { title: '秘密の民法教科書', subjects: ['民法'] },
  matterEntries: [{ term: '債権者代位権', pages: ['123'] }]
};

test('encrypts and decrypts one chunk without plaintext leakage in the envelope', async () => {
  const envelope = await encryptChunk(masterKey, chunkA, plaintext);
  assert.equal(envelope.type, ENVELOPE_TYPE);
  assert.equal(envelope.version, VERSION);
  assert.equal(envelope.algorithm, 'AES-256-GCM');
  assert.equal(envelope.kdf, 'HKDF-SHA-256');
  assert.equal(typeof envelope.iv, 'string');
  assert.equal(typeof envelope.ciphertext, 'string');
  const serialized = JSON.stringify(envelope);
  assert.equal(serialized.includes('秘密の民法教科書'), false);
  assert.equal(serialized.includes('債権者代位権'), false);
  assert.deepEqual(await decryptChunk(masterKey, chunkA, envelope), plaintext);
});

test('fresh AES-GCM IV makes repeated encryption produce different ciphertext', async () => {
  const a = await encryptChunk(masterKey, chunkA, plaintext);
  const b = await encryptChunk(masterKey, chunkA, plaintext);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('HKDF derives separate keys for separate chunk ids', async () => {
  const a = await deriveChunkKey(masterKey, chunkA, ['encrypt']);
  const b = await deriveChunkKey(masterKey, chunkB, ['encrypt']);
  const rawA = new Uint8Array(await crypto.subtle.exportKey('raw', a));
  const rawB = new Uint8Array(await crypto.subtle.exportKey('raw', b));
  assert.notDeepEqual(rawA, rawB);
});

test('ciphertext is bound to its chunk id by key derivation and authenticated data', async () => {
  const envelope = await encryptChunk(masterKey, chunkA, plaintext);
  await assert.rejects(() => decryptChunk(masterKey, chunkB, envelope));
});

test('wrong master key and tampered ciphertext fail closed', async () => {
  const envelope = await encryptChunk(masterKey, chunkA, plaintext);
  await assert.rejects(() => decryptChunk(otherKey, chunkA, envelope));
  const tampered = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -2) + 'AA' };
  await assert.rejects(() => decryptChunk(masterKey, chunkA, tampered));
});

test('rejects malformed or unsupported envelopes before exposing plaintext', async () => {
  await assert.rejects(() => decryptChunk(masterKey, chunkA, { type: 'wrong', version: VERSION, iv: 'x', ciphertext: 'x' }), /format/i);
  await assert.rejects(() => decryptChunk(masterKey, chunkA, { type: ENVELOPE_TYPE, version: 99, iv: 'x', ciphertext: 'x' }), /version/i);
});
