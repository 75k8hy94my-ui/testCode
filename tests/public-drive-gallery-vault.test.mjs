import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
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
