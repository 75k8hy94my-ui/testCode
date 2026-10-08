import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const gallery = require('../public-drive-gallery-source.js');
const vault = await import('../public-drive-gallery-vault.js');
const api = vault.default;
const key = new Uint8Array(32).fill(42);
const settings = { folderId: '1AbcDE_fgHIJkLMnOPqRsTUvW', apiKey: 'AIzaExampleBrowserRestrictedKey00001' };
test('settings encrypt and decrypt with vault key; ciphertext contains no plaintext', async () => {
  const encoded = await api.encryptSettings(key, settings);
  assert.deepEqual(await api.decryptSettings(key, encoded), settings);
  assert.equal(JSON.stringify(encoded).includes(settings.apiKey), false);
  assert.equal(JSON.stringify(encoded).includes(settings.folderId), false);
  assert.notDeepEqual(encoded, await api.encryptSettings(key, settings));
});
test('wrong vault key and tampering fail closed', async () => {
  const encrypted = await api.encryptSettings(key, settings);
  await assert.rejects(api.decryptSettings(new Uint8Array(32).fill(17), encrypted), /復号/);
  await assert.rejects(api.decryptSettings(key, { ...encrypted, ciphertext: encrypted.ciphertext.slice(0,-2) + 'AB' }), /復号/);
  await assert.rejects(api.decryptSettings(key, { ...encrypted, iv: 'AA' }), /IV/);
});
test('rejects untrusted plaintext or incomplete credentials', async () => {
  await assert.rejects(api.encryptSettings(key, { folderId: settings.folderId, apiKey: 'x' }), /APIキー/);
  await assert.rejects(api.encryptSettings(new Uint8Array(16), settings), /保管庫/);
});

test('synchronizes image link manifest encrypted with settings; legacy settings still decrypt', async () => {
  const cache = gallery.createCache(settings.folderId, [
    { id: 'image_000000001', name: '花.jpg' },
    { id: 'image_000000002', name: '海.jpg' }
  ]);
  const envelope = await api.encryptSettings(key, { ...settings, cache });
  assert.equal(JSON.stringify(envelope).includes('https://lh3.googleusercontent.com'), false);
  assert.equal(JSON.stringify(envelope).includes('花.jpg'), false);
  assert.deepEqual(await api.decryptSettings(key, envelope), { ...settings, cache });
  const original = await api.encryptSettings(key, settings);
  assert.deepEqual(await api.decryptSettings(key, original), settings);
});
test('rejects replacing cached direct links with arbitrary endpoints', async () => {
  const cache = gallery.createCache(settings.folderId, [{ id: 'image_000000001', name: '花.jpg' }]);
  cache.images[0].directUrl = 'https://untrusted.example/photo.jpg';
  await assert.rejects(api.encryptSettings(key, { ...settings, cache }), /キャッシュ/);
});
