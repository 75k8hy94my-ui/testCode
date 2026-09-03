(()=>{
'use strict';
const CHUNK_VERSION = 1;
const ENVELOPE_TYPE = 'manga-reader-encrypted-chunk';
const INFO = new TextEncoder().encode('manga-reader/encrypted-chunk/v1');
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('暗号鍵の形式が正しくありません。');
}
function uuidBytes(value) {
  const compact = String(value || '').toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new Error('chunkId がUUID形式ではありません。');
  const out = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) out[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  return out;
}
function b64url(value) {
  const input = bytes(value);
  let binary = '';
  for (let index = 0; index < input.length; index += 1) binary += String.fromCharCode(input[index]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function aad(chunkId) {
  return encoder.encode(JSON.stringify({ version: CHUNK_VERSION, chunkId: String(chunkId) }));
}
function cryptoApi() {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('このブラウザは暗号化機能に対応していません。');
  return globalThis.crypto;
}
async function deriveChunkKey(masterKeyBytes, chunkId) {
  const master = bytes(masterKeyBytes);
  if (master.byteLength !== 32) throw new Error('保管庫のマスター鍵が正しくありません。');
  const crypto = cryptoApi();
  const root = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: uuidBytes(chunkId), info: INFO },
    root,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function encryptChunk(masterKeyBytes, chunkId, value) {
  const crypto = cryptoApi();
  const key = await deriveChunkKey(masterKeyBytes, chunkId);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(chunkId) }, key, plaintext);
  return { type: ENVELOPE_TYPE, version: CHUNK_VERSION, algorithm: 'AES-256-GCM', iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) };
}
async function decryptChunk(masterKeyBytes, chunkId, envelope) {
  if (!envelope || envelope.type !== ENVELOPE_TYPE || envelope.version !== CHUNK_VERSION || envelope.algorithm !== 'AES-256-GCM') throw new Error('暗号化チャンクの形式が正しくありません。');
  const crypto = cryptoApi();
  const key = await deriveChunkKey(masterKeyBytes, chunkId);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(envelope.iv), additionalData: aad(chunkId) }, key, fromB64url(envelope.ciphertext));
  return JSON.parse(decoder.decode(plaintext));
}
const api = { CHUNK_VERSION, deriveChunkKey, encryptChunk, decryptChunk };
if (typeof window !== 'undefined') window.EncryptedChunkCrypto = api;
if (typeof module !== 'undefined') module.exports = api;
})();
