import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import assetCrypto from '../encrypted-asset-crypto.js';

if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;

const key = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
const otherKey = new Uint8Array(32).fill(9);
const bytes = Uint8Array.from([0, 1, 2, 3, 250, 251]);

async function roundTrip(objectId, input) {
  const encrypted = await assetCrypto.encryptAssetObject(key, 'asset-1', objectId, input);
  assert.ok(encrypted instanceof Uint8Array);
  assert.deepEqual(await assetCrypto.decryptAssetObject(key, 'asset-1', objectId, encrypted), bytes);
  return encrypted;
}

test('preview and tile binary round-trip for supported inputs', async () => {
  await roundTrip(assetCrypto.previewObjectId(), new Blob([bytes], { type: 'image/webp' }));
  await roundTrip(assetCrypto.tileObjectId(0, 3, 2), bytes);
  await roundTrip(assetCrypto.tileObjectId(1, 0, 0), bytes.buffer);
});

test('empty binary round-trips and encrypted size is fixed overhead', async () => {
  const encrypted = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', new Uint8Array());
  assert.equal(encrypted.byteLength, 36);
  assert.equal(assetCrypto.encryptedAssetByteLength(0), 36);
  assert.deepEqual(await assetCrypto.decryptAssetObject(key, 'asset-1', 'preview', encrypted), new Uint8Array());
});

test('raw format has the required header and no plaintext leakage', async () => {
  const secret = new TextEncoder().encode('SECRET_IMAGE_PAYLOAD_12345');
  const encrypted = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', secret);
  assert.deepEqual(Array.from(encrypted.slice(0, 4)), [0x4d, 0x52, 0x41, 0x45]);
  assert.equal(encrypted[4], 1);
  assert.equal(encrypted[5], 12);
  assert.deepEqual(Array.from(encrypted.slice(6, 8)), [0, 0]);
  assert.equal(encrypted.byteLength, assetCrypto.encryptedAssetByteLength(secret.byteLength));
  assert.equal(new TextDecoder().decode(encrypted).includes('SECRET_IMAGE_PAYLOAD_12345'), false);
});

test('same identity receives a fresh random IV', async () => {
  const first = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', bytes);
  const second = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', bytes);
  assert.notDeepEqual(first, second);
  assert.notDeepEqual(first.slice(8, 20), second.slice(8, 20));
});

test('wrong key, asset, object, and tile identity fail authentication', async () => {
  const encrypted = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', bytes);
  for (const [master, asset, object] of [[otherKey, 'asset-1', 'preview'], [key, 'asset-2', 'preview'], [key, 'asset-1', 'L0:0:0'], [key, 'asset-1', 'L0:1:0']]) {
    await assert.rejects(assetCrypto.decryptAssetObject(master, asset, object, encrypted));
  }
});

test('IV, ciphertext, and tag tampering fail authentication', async () => {
  const encrypted = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', bytes);
  for (const index of [8, 20, encrypted.length - 1]) {
    const tampered = encrypted.slice();
    tampered[index] ^= 1;
    await assert.rejects(assetCrypto.decryptAssetObject(key, 'asset-1', 'preview', tampered));
  }
});

test('malformed header is rejected before decryption', async () => {
  const encrypted = await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', bytes);
  for (const [index, value, message] of [[0, 0, /magic/], [4, 2, /version/], [5, 11, /IV length/], [6, 1, /flags/]]) {
    const malformed = encrypted.slice();
    malformed[index] = value;
    assert.throws(() => assetCrypto.validateEncryptedAsset(malformed), message);
  }
  assert.throws(() => assetCrypto.validateEncryptedAsset(new Uint8Array(20)), /format/);
});

test('validates master keys, IDs, coordinates, and byte lengths', async () => {
  await assert.rejects(assetCrypto.encryptAssetObject(new Uint8Array(31), 'asset-1', 'preview', bytes), /32 bytes/);
  for (const value of ['', '   ', 'asset\0id']) await assert.rejects(assetCrypto.encryptAssetObject(key, value, 'preview', bytes));
  for (const value of [[-1, 0, 0], [0, -1, 0], [0, 0, -1], [0.5, 0, 0], [0, 0, 1.2]]) {
    assert.throws(() => assetCrypto.tileObjectId(...value));
  }
  for (const value of [-1, 1.5, Number.NaN]) assert.throws(() => assetCrypto.encryptedAssetByteLength(value));
});

test('derived keys are non-extractable and separated by asset/object identity', async () => {
  const preview = await assetCrypto.deriveAssetObjectKey(key, 'asset-1', 'preview', ['encrypt']);
  const tile = await assetCrypto.deriveAssetObjectKey(key, 'asset-1', 'L0:0:0', ['encrypt']);
  const other = await assetCrypto.deriveAssetObjectKey(key, 'asset-2', 'preview', ['encrypt']);
  assert.equal(preview.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', preview));
  const probe = new Uint8Array([1, 2, 3]);
  const iv = new Uint8Array(12);
  const aad = new TextEncoder().encode('probe');
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, preview, probe);
  for (const candidate of [tile, other]) await assert.rejects(crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, candidate, encrypted));
});

test('encryption does not mutate Uint8Array input', async () => {
  const input = bytes.slice();
  const before = input.slice();
  await assetCrypto.encryptAssetObject(key, 'asset-1', 'preview', input);
  assert.deepEqual(input, before);
});

test('classic script remains parseable', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL('../encrypted-asset-crypto.js', import.meta.url), 'utf8')));
});
