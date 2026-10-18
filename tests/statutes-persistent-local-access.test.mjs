import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const name of ['statutes.html', 'definition-cards.html']) {
  test(name + ' allows only account-scoped remembered local access', () => {
    const src = readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    assert.match(src, /testCode\.statutes\.localAccess\.v1/);
    assert.match(src, /grant\?\.userId === userId/);
    assert.match(src, /vault\.ensureSession\(\)/);
    assert.match(src, /if \(!vault\.loadActive\?\.\(\) && !remembered\)/);
  });
}
test('shared Vault key remains tab-scoped and explicit logout revokes statute grant', () => {
  const src = readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');
  assert.match(src, /sessionStorage\.setItem\(ACTIVE_KEY/);
  assert.doesNotMatch(src, /localStorage\.setItem\(ACTIVE_KEY/);
  assert.match(src, /localStorage\.removeItem\('testCode\.statutes\.localAccess\.v1'\)/);
});
