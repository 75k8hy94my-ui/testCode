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

test('reader loads its close-time synchronization scheduler', () => {
  assert.match(reader, /reader-sync-scheduler\.js/);
  assert.match(reader, /ReaderSyncSchedulerFactory\.create/);
  assert.match(reader, /flushSync:\s*\(\) => syncScheduler\.flush\(\)/);
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

test('reader waits for an allowed protected-data verdict before starting image loading', () => {
  const startReader = reader.indexOf('async function startReader()');
  const gateGuard = reader.indexOf('if (!canReadProtectedData()) return;', startReader);
  const itemResolution = reader.indexOf('MangaReaderTarget.itemIdFromLocation(location)');
  const runtimeStart = reader.indexOf('currentRuntime.start(itemId)');
  assert.ok(startReader >= 0 && gateGuard > startReader && gateGuard < itemResolution);
  assert.ok(itemResolution < runtimeStart);
  assert.match(reader, /document\.addEventListener\('manga-reader-vpn-status', handleAccessChange\)/);
  assert.match(reader, /if \(canReadProtectedData\(\)\)/);
});

test('standalone Reader does not read a work until protected-data access is allowed', () => {
  assert.match(reader, /canReadProtectedData/);
  const startReader = reader.indexOf('async function startReader()');
  const blockedGuard = reader.indexOf('if (!canReadProtectedData()) return;', startReader);
  const itemRead = reader.indexOf('MangaReaderTarget.clearLegacyTarget(localStorage)');
  const repository = reader.indexOf('ReaderItemRepositoryFactory.create');
  assert.ok(blockedGuard >= 0 && blockedGuard < itemRead && itemRead < repository);
  assert.match(reader, /if \(!canReadProtectedData\(\)\) return \[\]/);
});

test('Reader destroys protected presentation and runtime on VPN access loss', () => {
  assert.match(reader, /runtime\?\.destroy\(\)/);
  assert.match(reader, /vpn-protected-blocked/);
  assert.match(reader, /pageStage'\)\.replaceChildren\(\)/);
});
