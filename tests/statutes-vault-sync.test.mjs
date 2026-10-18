import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const payload = require('../vault-payload.js');
const page = fs.readFileSync(new URL('../statutes.html', import.meta.url), 'utf8');
const definitions = fs.readFileSync(new URL('../statutes-definitions.js', import.meta.url), 'utf8');
const sample = [{ subject:'labor-standards', article:'３２条', part:0, start:0, end:2, quote:'使用', definition:'テスト', card:true }];
test('statute definitions round trip through Vault payload without losing other data', () => {
  const map = new Map([[payload.DATA_KEYS.statuteDefinitions, JSON.stringify(sample)]]);
  const saved = payload.buildFromLocalStorage(map);
  assert.deepEqual(saved.statuteDefinitions, sample);
  assert.equal(saved.statuteNotes && typeof saved.statuteNotes, 'object');
  const another = new Map();
  payload.applyToLocalStorage(saved, another);
  assert.deepEqual(JSON.parse(another.get(payload.DATA_KEYS.statuteDefinitions)), sample);
  assert.deepEqual(payload.normalize({}).statuteDefinitions, []);
});
test('statutes route bootstraps independent encrypted sync and refreshes annotations', () => {
  for (const src of ['vault-sync-merge.js', 'vault-session.js', 'vault-payload.js', 'statutes-vault.js', 'statutes-definitions.js'])
    assert.ok(page.includes('src="' + src + '?'), src);
  assert.ok(page.indexOf('vault-session.js') < page.indexOf('statutes-vault.js'));
  assert.match(definitions, /manga-vault-payload-applied/);
  assert.match(definitions, /StatutesVault\\?\\.changed/);
  assert.match(definitions, /window\\.StatutesVault\\.sync\\(\\)/);
  assert.doesNotMatch(definitions, /markLocalChangesPending/);
});

test('statute-only sync never imports media fields and does not require VPN', () => {
  const independent = fs.readFileSync(new URL('../statutes-vault.js', import.meta.url), 'utf8');
  assert.match(independent, /testcode_statute_vaults/);
  assert.match(independent, /AES-GCM/);
  assert.match(independent, /revision=eq\\./);
  assert.match(independent, /local-conflict/);
  assert.doesNotMatch(independent, /canReceiveVaultPayload/);
  assert.match(definitions, /window\\.StatutesVault\\.sync\\(\\)/);
});
