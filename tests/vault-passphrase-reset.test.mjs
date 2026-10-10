import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import mergeModule from '../vault-sync-merge.js';

const source = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const fromB64url = (value) => new Uint8Array(Buffer.from(value, 'base64url'));

async function derivePassphrase(passphrase, salt) {
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encrypt(key, bytes) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { iv: b64url(iv), ciphertext: b64url(new Uint8Array(ciphertext)) };
}

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('a passkey reset writes a passphrase wrapper that the normal unlock flow accepts', async () => {
  const rawKey = webcrypto.getRandomValues(new Uint8Array(32));
  const prfOutput = webcrypto.getRandomValues(new Uint8Array(32));
  const credentialId = new Uint8Array([9, 8, 7, 6]);
  const passkeySalt = webcrypto.getRandomValues(new Uint8Array(32));
  const passkeyMaterial = await webcrypto.subtle.digest('SHA-256', prfOutput);
  const passkeyKey = await webcrypto.subtle.importKey('raw', passkeyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const keyWraps = {
    passphrase: { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: b64url(webcrypto.getRandomValues(new Uint8Array(16))) }, encryptedKey: null },
    passkeys: [{ id: b64url(credentialId), salt: b64url(passkeySalt), encryptedKey: await encrypt(passkeyKey, rawKey) }],
  };
  const oldPassphraseKey = await derivePassphrase('old valid phrase 123', fromB64url(keyWraps.passphrase.kdf.salt));
  keyWraps.passphrase.encryptedKey = await encrypt(oldPassphraseKey, rawKey);
  const data = await encrypt(await webcrypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']), new TextEncoder().encode(JSON.stringify({ savedItems: [{ id: 'kept' }] })));
  const record = { payload: { type: 'manga-reader-vault', version: 1, keyWraps, data }, revision: 1, updated_at: 'before' };
  const localStorage = storage();
  const sessionStorage = storage();
  localStorage.setItem('mangaReaderSupabaseSession', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'user-1' } }));
  localStorage.setItem('mangaReaderSupabaseSyncMeta', JSON.stringify({ 'user-1': { revision: 1, updatedAt: 'before' } }));
  sessionStorage.setItem('mangaReaderActiveVault', JSON.stringify({ rawKey: b64url(rawKey), keyWraps }));

  const context = {
    window: { MANGA_READER_SUPABASE: { url: 'https://vault.test', publishableKey: 'public' }, PublicKeyCredential: function PublicKeyCredential() {}, MangaReaderMediaAccess: { canReadProtectedData: () => true }, MangaVaultSyncMerge: mergeModule, MangaVaultPayload: { buildFromLocalStorage: () => ({ savedItems: [{ id: 'kept' }] }) } },
    navigator: { credentials: { create: async () => null, get: async () => ({ rawId: credentialId.buffer, getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }) }) } },
    location: { hostname: 'vault.test', protocol: 'https:' },
    crypto: webcrypto,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    TextEncoder,
    TextDecoder,
    localStorage,
    sessionStorage,
    fetch: async (url, options = {}) => {
      if (String(url).includes('/rest/v1/rpc/update_manga_reader_vault')) {
        const request = JSON.parse(options.body);
        assert.equal(request.expected_revision, record.revision);
        record.payload = request.new_payload;
        record.revision += 1;
        record.updated_at = 'after';
        return { ok: true, status: 200, json: async () => [{ revision: record.revision, updated_at: record.updated_at }], text: async () => '' };
      }
      if (String(url).includes('/rest/v1/manga_reader_vaults?')) {
        return { ok: true, status: 200, json: async () => [record], text: async () => '' };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  vm.runInNewContext(source, context, { filename: 'vault-session.js' });

  await context.window.MangaVault.changePassphrase('new valid phrase 456');
  const openedPayload = await new Promise((resolve, reject) => {
    context.window.MangaVault.initialize('new valid phrase 456', '', resolve, () => ({})).catch(reject);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(openedPayload)), { savedItems: [{ id: 'kept' }] });
  assert.equal(record.revision, 2);
});

test('new Vault creation uses a conflict-safe insert and requires a confirmed server row', async () => {
  const localStorage = storage();
  const sessionStorage = storage();
  localStorage.setItem('mangaReaderSupabaseSession', JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'user-1' } }));
  let request;
  const context = {
    window: { MANGA_READER_SUPABASE: { url: 'https://vault.test', publishableKey: 'public' }, crypto: webcrypto, MangaReaderMediaAccess: { canReadProtectedData: () => true }, MangaVaultPayload: { buildFromLocalStorage: () => ({ items: [] }) } },
    navigator: {}, location: { hostname: 'vault.test', protocol: 'https:' }, crypto: webcrypto,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'), TextEncoder, TextDecoder,
    localStorage, sessionStorage,
    fetch: async (url, options = {}) => { request = { url: String(url), options }; return { ok: true, status: 201, json: async () => [], text: async () => '' }; },
  };
  vm.runInNewContext(source, context, { filename: 'vault-session.js' });
  await assert.rejects(context.window.MangaVault.initialize('valid passphrase 123', '', () => {}, () => ({ items: [] })), /保存結果を確認できません/);
  assert.equal(request.url, 'https://vault.test/rest/v1/manga_reader_vaults');
  assert.equal(request.options.headers.Prefer, 'return=representation');
});
