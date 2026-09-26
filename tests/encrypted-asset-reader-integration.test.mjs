import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('./reader.html', 'utf8');
const scriptOrder = ['encrypted-asset-crypto.js', 'encrypted-asset-cache.js', 'encrypted-asset-backend.js', 'encrypted-asset-storage.js', 'image-transfer-settings.js', 'image-transfer-ledger.js', 'image-remote-access.js', 'encrypted-asset-sync.js', 'encrypted-asset-reader.js', 'encrypted-asset-item.js'];

test('reader loads encrypted asset dependencies in dependency order', () => {
  let previous = -1;
  for (const script of scriptOrder) {
    const index = source.indexOf(`src="${script}"`);
    assert.ok(index >= 0, `${script} is referenced`);
    assert.ok(index > previous, `${script} follows its dependency`);
    previous = index;
  }
});

test('reader has encrypted precedence, fail-closed validation, and legacy fallback branches', () => {
  assert.match(source, /EncryptedAssetItem\.encryptedAssetPagesForItem\(item\)/);
  assert.match(source, /暗号化画像情報が壊れています/);
  assert.match(source, /if \(encryptedPages\)/);
  assert.match(source, /startReadingCustom\(item, switchDirection\)/);
  assert.match(source, /startReading\(selectedUrl, addToHistoryFlag, switchDirection\)/);
  assert.match(source, /if \(encryptedReaderActive\) \{ renderEncryptedPage\(n, direction\); return; \}/);
});

test('encrypted reader separates MangaVault session API from the active raw master key', () => {
  assert.match(source, /function encryptedVaultApi\(\)/);
  assert.match(source, /typeof vaultApi\.withSession !== 'function'/);
  assert.match(source, /typeof vaultApi\.api !== 'function'/);
  assert.match(source, /function encryptedMasterKey\(\)/);
  assert.match(source, /MangaVault\.loadActive\(\)/);
  assert.match(source, /masterKey: encryptedMasterKey\(\)/);
  assert.match(source, /vault: encryptedVaultApi\(\)/);
  assert.match(source, /stageProcessedRevision\(\{ cache, masterKey,/);
  assert.match(source, /publishPendingRevision\(\{ vault, storage, cache,/);
  assert.doesNotMatch(source, /const vault = encryptedVault\(\)/);
});

test('encrypted items keep manifests but never fake URLs or plaintext binary payloads', () => {
  assert.match(source, /encryptedAssets/);
  assert.match(source, /encryptedReaderPages = encryptedPages/);
  assert.match(source, /pages = \[\]/);
  assert.doesNotMatch(source, /encryptedAssets[\s\S]{0,500}data:/);
});

test('encrypted render keeps the candidate renderer local until preview is ready', () => {
  const start = source.indexOf('async function renderEncryptedPage');
  const end = source.indexOf('async function startReadingEncrypted', start);
  const body = source.slice(start, end);
  const createIndex = body.indexOf('renderer = EncryptedAssetReader.createEncryptedAssetReader');
  const readyCheckIndex = body.indexOf('if (renderId !== latestRenderId || !encryptedReaderActive)');
  const globalAssignIndex = body.indexOf('encryptedCurrentRenderer = renderer');
  assert.ok(createIndex >= 0);
  assert.ok(readyCheckIndex > createIndex);
  assert.ok(globalAssignIndex > readyCheckIndex);
  assert.match(body, /if \(renderer\) \{ try \{ renderer\.destroy\(\); \}/);
  assert.doesNotMatch(body, /catch \(error\)[\s\S]*encryptedCurrentRenderer\.destroy\(\)/);
});

test('encrypted renderer lifecycle and safety boundaries are wired', () => {
  assert.match(source, /function destroyEncryptedRenderer/);
  assert.match(source, /destroyEncryptedRenderer\(\);/);
  assert.match(source, /onPreviewReady/);
  assert.match(source, /encryptedAssetHost/);
  assert.match(source, /body\.safe-mode \.encryptedAssetHost img/);
  assert.match(source, /encryptedStorageTransport/);
  assert.match(source, /EncryptedAssetCache\.createCache/);
});
