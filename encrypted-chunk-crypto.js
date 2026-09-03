(()=>{
'use strict';

const ENVELOPE_TYPE = 'manga-reader-encrypted-chunk';
const VERSION = 1;
const DOMAIN = 'manga-reader/encrypted-chunk/v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function subtle() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('Web Crypto is unavailable');
  return globalThis.crypto.subtle;
}

function asBytes(value, name = 'key') {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes) throw new Error(`${name} must be bytes`);
  return bytes;
}

function requireMasterKey(value) {
  const bytes = asBytes(value, 'master key');
  if (bytes.byteLength !== 32) throw new Error('master key must be 32 bytes');
  return bytes;
}

function requireChunkId(value) {
  const id = String(value || '').trim();
  if (!id) throw new Error('chunk id is required');
  return id;
}

function toBase64Url(bytes) {
  const value = asBytes(bytes, 'bytes');
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(value).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('encrypted chunk format is invalid');
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  if (typeof atob === 'function') {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function aadForChunk(chunkId) {
  return encoder.encode(`${DOMAIN}:${requireChunkId(chunkId)}`);
}

async function deriveChunkKey(masterKey, chunkId, usages = ['encrypt', 'decrypt']) {
  const root = await subtle().importKey('raw', requireMasterKey(masterKey), 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(requireChunkId(chunkId)),
      info: encoder.encode(DOMAIN)
    },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

async function encryptChunk(masterKey, chunkId, plaintext) {
  const id = requireChunkId(chunkId);
  const key = await deriveChunkKey(masterKey, id, ['encrypt']);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const encoded = encoder.encode(JSON.stringify(plaintext));
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aadForChunk(id) }, key, encoded);
  return {
    type: ENVELOPE_TYPE,
    version: VERSION,
    algorithm: 'AES-256-GCM',
    kdf: 'HKDF-SHA-256',
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(ciphertext))
  };
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.type !== ENVELOPE_TYPE) {
    throw new Error('encrypted chunk format is invalid');
  }
  if (envelope.version !== VERSION) throw new Error('encrypted chunk version is unsupported');
  if (envelope.algorithm !== 'AES-256-GCM' || envelope.kdf !== 'HKDF-SHA-256' || !envelope.iv || !envelope.ciphertext) {
    throw new Error('encrypted chunk format is invalid');
  }
  return envelope;
}

async function decryptChunk(masterKey, chunkId, envelope) {
  const id = requireChunkId(chunkId);
  const validated = validateEnvelope(envelope);
  const key = await deriveChunkKey(masterKey, id, ['decrypt']);
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64Url(validated.iv), additionalData: aadForChunk(id) },
    key,
    fromBase64Url(validated.ciphertext)
  );
  return JSON.parse(decoder.decode(plaintext));
}

const api = { ENVELOPE_TYPE, VERSION, DOMAIN, deriveChunkKey, encryptChunk, decryptChunk, validateEnvelope };
if (typeof window !== 'undefined') window.EncryptedChunkCrypto = api;
if (typeof module !== 'undefined') module.exports = api;
})();
