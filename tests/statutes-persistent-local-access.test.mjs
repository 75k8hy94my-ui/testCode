import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = name => readFileSync(new URL('../'+name, import.meta.url),'utf8');

for (const page of ['statutes.html','definition-cards.html']) {
  test(page + ' needs an authenticated account and a statutes-only key or unlocked master vault', () => {
    const src=root(page);
    assert.match(src,/statutes-vault\.js/);
    assert.match(src,/StatutesVault\?\.hasDeviceKey/);
    assert.match(src,/await vault\.ensureSession\(\)/);
    assert.match(src,/await window\.StatutesVault\.sync\(\)/);
    assert.doesNotMatch(src,/localAccess\.v1/);
  });
}
test('statutes-only key is never used as main Vault key', () => {
  const src=root('statutes-vault.js');
  assert.match(src,/testCode\.statutes\.deviceKey\.v1/);
  assert.match(src,/AES-GCM/);
  assert.match(src,/wrapped_key/);
  assert.doesNotMatch(src,/sessionStorage\.setItem\(ACTIVE_KEY/);
  assert.match(src,/reason:'local-conflict'/);
});
test('logout destroys local statute key, while the common Vault stays tab-scoped', () => {
  const src=root('vault-session.js');
  assert.match(src,/localStorage\.removeItem\('testCode\.statutes\.deviceKey\.v1'\)/);
  assert.match(src,/sessionStorage\.setItem\(ACTIVE_KEY/);
  assert.doesNotMatch(src,/localStorage\.setItem\(ACTIVE_KEY/);
});
test('statute edits no longer upload the common Vault', () => {
  for (const name of ['statutes-definitions.js','statutes-article-notes.js']) {
    const src=root(name);
    assert.match(src,/StatutesVault\?\.changed/);
    assert.doesNotMatch(src,/markLocalChangesPending/);
  }
});
test('legacy vault apply protects independent annotations', () => {
  const src=root('vault-payload.js');
  assert.match(src,/legacy media Vault restores must not overwrite/);
  assert.match(src,/testCode\.statutes\.deviceKey\.v1/);
});
