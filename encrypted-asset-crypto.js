(() => {
  'use strict';

  const ASSET_CRYPTO_VERSION = 1;
  const DOMAIN = 'manga-reader/encrypted-asset/v1';
  const MAGIC = new Uint8Array([0x4d, 0x52, 0x41, 0x45]);
  const HEADER_SIZE = 20;
  const IV_LENGTH = 12;
  const TAG_LENGTH = 16;
  const encoder = new TextEncoder();

  function cryptoSubtle() {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is unavailable');
    return globalThis.crypto.subtle;
  }

  function bytes(value, name) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new TypeError(`${name} must be a Blob, Uint8Array, or ArrayBuffer`);
  }

  function masterKeyBytes(value) {
    const result = bytes(value, 'master key');
    if (result.byteLength !== 32) throw new TypeError('master key must be exactly 32 bytes');
    return result;
  }

  function identityPart(value, name) {
    if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
      throw new TypeError(`${name} must be a non-empty string without NUL`);
    }
    return value;
  }

  function requireObjectId(value) {
    return identityPart(value, 'objectId');
  }

  function previewObjectId() {
    return 'preview';
  }

  function tileObjectId(level, x, y) {
    for (const [value, name] of [[level, 'level'], [x, 'x'], [y, 'y']]) {
      if (!Number.isInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
    }
    return `L${level}:${x}:${y}`;
  }

  function aadFor(assetId, objectId) {
    return encoder.encode(`${DOMAIN}\0${identityPart(assetId, 'assetId')}\0${requireObjectId(objectId)}`);
  }

  async function deriveAssetObjectKey(masterKey, assetId, objectId, usages = ['encrypt', 'decrypt']) {
    const root = await cryptoSubtle().importKey('raw', masterKeyBytes(masterKey), 'HKDF', false, ['deriveKey']);
    const asset = identityPart(assetId, 'assetId');
    const object = requireObjectId(objectId);
    return cryptoSubtle().deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: encoder.encode(`${asset}\0${object}`),
        info: encoder.encode(DOMAIN)
      },
      root,
      { name: 'AES-GCM', length: 256 },
      false,
      usages
    );
  }

  async function plaintextBytes(value) {
    if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
    return bytes(value, 'plaintext');
  }

  function encryptedAssetByteLength(plaintextByteLength) {
    if (!Number.isInteger(plaintextByteLength) || plaintextByteLength < 0) {
      throw new TypeError('plaintext byte length must be a non-negative integer');
    }
    return HEADER_SIZE + plaintextByteLength + TAG_LENGTH;
  }

  async function encryptAssetObject(masterKey, assetId, objectId, plaintext) {
    const asset = identityPart(assetId, 'assetId');
    const object = requireObjectId(objectId);
    const key = await deriveAssetObjectKey(masterKey, asset, object, ['encrypt']);
    const iv = new Uint8Array(IV_LENGTH);
    globalThis.crypto.getRandomValues(iv);
    const encrypted = new Uint8Array(await cryptoSubtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: aadFor(asset, object) },
      key,
      await plaintextBytes(plaintext)
    ));
    const output = new Uint8Array(HEADER_SIZE + encrypted.byteLength);
    output.set(MAGIC, 0);
    output[4] = ASSET_CRYPTO_VERSION;
    output[5] = IV_LENGTH;
    output.set(iv, 8);
    output.set(encrypted, HEADER_SIZE);
    return output;
  }

  function validateEncryptedAsset(value) {
    const encrypted = bytes(value, 'encrypted asset');
    if (encrypted.byteLength < HEADER_SIZE + TAG_LENGTH) throw new Error('encrypted asset format is invalid');
    if (!MAGIC.every((byte, index) => encrypted[index] === byte)) throw new Error('encrypted asset magic is invalid');
    if (encrypted[4] !== ASSET_CRYPTO_VERSION) throw new Error('encrypted asset version is unsupported');
    if (encrypted[5] !== IV_LENGTH) throw new Error('encrypted asset IV length is invalid');
    if (encrypted[6] !== 0 || encrypted[7] !== 0) throw new Error('encrypted asset flags are invalid');
    return encrypted;
  }

  async function decryptAssetObject(masterKey, assetId, objectId, encryptedBytes) {
    const asset = identityPart(assetId, 'assetId');
    const object = requireObjectId(objectId);
    const encrypted = validateEncryptedAsset(encryptedBytes);
    const key = await deriveAssetObjectKey(masterKey, asset, object, ['decrypt']);
    const plaintext = await cryptoSubtle().decrypt(
      { name: 'AES-GCM', iv: encrypted.slice(8, HEADER_SIZE), additionalData: aadFor(asset, object) },
      key,
      encrypted.slice(HEADER_SIZE)
    );
    return new Uint8Array(plaintext);
  }

  const api = {
    ASSET_CRYPTO_VERSION,
    DOMAIN,
    previewObjectId,
    tileObjectId,
    deriveAssetObjectKey,
    encryptAssetObject,
    decryptAssetObject,
    validateEncryptedAsset,
    encryptedAssetByteLength
  };
  if (typeof window !== 'undefined') window.EncryptedAssetCrypto = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
