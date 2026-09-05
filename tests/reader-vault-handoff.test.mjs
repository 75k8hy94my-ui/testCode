import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');
const vault = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');

test('vault session exposes an async wait for cross-tab active vault', () => {
  assert.match(vault, /async function waitForActive\(/);
  assert.match(vault, /channelPost\(\{ type: 'vault-request' \}\)/);
  assert.match(vault, /'manga-vault-active'/);
  assert.match(vault, /window\.MangaVault\s*=\s*\{[\s\S]*waitForActive/);
});

test('reader waits for cross-tab vault handoff before redirecting to sync', () => {
  assert.match(reader, /await\s+MangaVault\.waitForActive\(/);
  const waitIndex = reader.indexOf('await MangaVault.waitForActive(');
  const redirectIndex = reader.indexOf('window.location.replace(vaultUrl)');
  assert.ok(waitIndex >= 0 && redirectIndex > waitIndex, 'reader must wait before deciding the vault is locked');
});
