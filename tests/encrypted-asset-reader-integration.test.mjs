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

test('encrypted reader uses Vault rawKey and does not put fake URLs or plaintext binaries into items', () => {
  assert.match(source, /vault\.rawKey/);
  assert.match(source, /encryptedAssets/);
  assert.match(source, /encryptedReaderPages = encryptedPages/);
  assert.match(source, /pages = \[\]/);
  assert.doesNotMatch(source, /encryptedAssets[\s\S]{0,500}data:/);
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
