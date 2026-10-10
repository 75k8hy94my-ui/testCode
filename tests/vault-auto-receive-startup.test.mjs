import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const spa = fs.readFileSync(new URL('../home-profile-spa.js', import.meta.url), 'utf8');
const vault = fs.readFileSync(new URL('../vault-session.js', import.meta.url), 'utf8');

test('authenticated startup refreshes an already-unlocked Vault after verifying the session', () => {
  const start = spa.slice(spa.indexOf('async function start(){'), spa.indexOf('window.HomeProfileSPA='));
  const sessionCheck = start.indexOf('await MangaVault.ensureSession()');
  const render = start.lastIndexOf('renderRoute();', start.indexOf('MangaVault.syncLatest()'));
  const refresh = start.indexOf('MangaVault.syncLatest()');
  assert.ok(sessionCheck >= 0 && render > sessionCheck && refresh > render);
  assert.match(start, /if\(!MangaVault\.loadActive\(\)\)\{showVault\(\);return;\}/);
});

test('received Vault state refreshes the active screen and sync state has explicit UI events', () => {
  assert.match(spa, /document\.addEventListener\('manga-vault-payload-applied',handleVaultPayloadApplied\)/);
  assert.match(spa, /document\.addEventListener\('manga-vault-sync-state',handleVaultSyncState\)/);
  assert.match(spa, /syncing:'クラウド同期中/);
  assert.match(spa, /pending:'端末に変更を保持/);
  assert.match(spa, /conflict:'別端末の変更と競合/);
  assert.match(spa, /error:'同期に失敗/);
});

test('automatic sync is event-driven, throttled on tab activation, and keeps VPN receive gating', () => {
  assert.match(vault, /window\.addEventListener\('focus', \(\) => requestAutoVaultSync\(\)\)/);
  assert.match(vault, /window\.addEventListener\('online', \(\) => requestAutoVaultSync\(true\)\)/);
  assert.match(vault, /visibilityState === 'visible'\) requestAutoVaultSync\(\)/);
  assert.match(vault, /status === 'allowed'\) requestAutoVaultSync\(true\)/);
  assert.match(vault, /if \(!canReceiveVaultPayload\(\)\) return \{ state: 'deferred', reason: 'vpn' \}/);
  assert.match(vault, /writeLocalChanges\(pendingToken, \{ requireVpn: false \}\)/);
});
