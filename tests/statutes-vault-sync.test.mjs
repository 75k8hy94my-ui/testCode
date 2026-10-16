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
test('statutes route bootstraps encrypted Vault sync and refreshes annotations', () => {
  for (const src of ['vault-sync-merge.js', 'vault-session.js', 'vault-payload.js', 'statutes-definitions.js'])
    assert.ok(page.includes('src="' + src + '?'), src);
  assert.ok(page.indexOf('vault-payload.js') < page.indexOf('statutes-definitions.js'));
  assert.match(definitions, /manga-vault-payload-applied/);
  assert.match(definitions, /markLocalChangesPending/);
  assert.match(definitions, /saveLocalChanges/);
  assert.match(definitions, /syncLatest/);
});

test('VPN-free statute sync only applies statuteDefinitions and never bypasses media gates', () => {
  const vault = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');
  const scope = vault.slice(vault.indexOf('async function syncStatutesLatest()'), vault.indexOf('function syncLatest()', vault.indexOf('async function syncStatutesLatest()')));
  assert.match(scope, /remote\.statuteDefinitions/);
  assert.match(scope, /localStorage\.setItem\(key, JSON\.stringify\(remoteNotes\)\)/);
  assert.doesNotMatch(scope, /applyToLocalStorage\(remote/);
  assert.doesNotMatch(scope, /canReceiveVaultPayload\(\)/);
  assert.match(definitions, /await window\.MangaVault\.syncStatutesLatest\(\)/);
});
