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
  const waitIndex = reader.indexOf('await MangaVault.waitForActive(2500)');
  const lockedRedirectIndex = reader.indexOf('if (!activeVault) { window.location.replace(vaultUrl); return; }');
  assert.ok(waitIndex >= 0, 'reader must await cross-tab vault handoff');
  assert.ok(lockedRedirectIndex > waitIndex, 'reader must wait before deciding the vault is locked');
});


test('reader boot is serialized before the main runtime initializes shelf state', () => {
  const promiseIndex = reader.indexOf('window.MangaReaderBootPromise = (async () => {');
  const waitIndex = reader.indexOf('const readerBootReady = await (window.MangaReaderBootPromise || Promise.resolve(true));');
  const initIndex = reader.indexOf('initMangaList();');
  assert.ok(promiseIndex >= 0, 'reader must publish a boot promise');
  assert.ok(waitIndex > promiseIndex, 'main runtime must await the published boot promise');
  assert.ok(initIndex > waitIndex, 'shelf state must initialize only after auth/vault boot completes');
  assert.match(reader, /await MangaVault\.ensureSession\(\)/);
});
