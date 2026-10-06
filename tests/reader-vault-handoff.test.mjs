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

test('reader waits for cross-tab active Vault and refreshes the login session before its runtime', () => {
  const promiseIndex = reader.indexOf('window.MangaReaderBootPromise = (async () => {');
  const waitIndex = reader.indexOf('MangaVault.waitForActive(2500)');
  const sessionIndex = reader.indexOf('MangaVault.ensureSession()');
  const runtimeIndex = reader.indexOf('ReaderRuntimeFactory.create');
  assert.ok(promiseIndex >= 0 && waitIndex > promiseIndex);
  assert.ok(sessionIndex > waitIndex);
  assert.ok(runtimeIndex > sessionIndex);
  assert.match(reader, /setTimeout\(\(\) => reject\(new Error\('session check timed out'\)\), 5000\)/);
});

test('reader boot does not initialize or load bookshelf runtime modules', () => {
  assert.doesNotMatch(reader, /MangaList(?:HostRuntime|Runtime|RuntimeContext|Controller)Factory|manga-list-[\w-]+\.js/);
  assert.match(reader, /await window\.MangaReaderBootPromise/);
  assert.match(reader, /ReaderItemRepositoryFactory\.create/);
});

test('reader waits for its own media gate verdict before starting image loading', () => {
  const gateWait = reader.indexOf("document.addEventListener('manga-reader-vpn-status', finish)");
  const itemResolution = reader.indexOf('MangaReaderTarget.itemIdFromLocation(location)');
  const runtimeStart = reader.indexOf('runtime.start(itemId)');
  assert.ok(gateWait >= 0 && gateWait < itemResolution);
  assert.ok(itemResolution < runtimeStart);
  assert.match(reader, /mediaAccess\?\.getStatus\?\.\(\) === 'pending' \|\| mediaAccess\?\.getStatus\?\.\(\) === 'checking'/);
  assert.match(reader, /status === 'allowed' \|\| status === 'blocked'/);
});
