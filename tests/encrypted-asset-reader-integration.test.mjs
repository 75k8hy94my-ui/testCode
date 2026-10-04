import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = read('reader.html');
const runtime = read('reader-runtime.js');
const assets = read('encrypted-asset-item.js');

const scriptOrder = ['encrypted-asset-crypto.js', 'encrypted-asset-cache.js', 'encrypted-asset-backend.js', 'encrypted-asset-storage.js', 'image-transfer-settings.js', 'image-transfer-ledger.js', 'image-remote-access.js', 'encrypted-asset-sync.js', 'encrypted-asset-reader.js', 'encrypted-asset-item.js'];

test('reader loads encrypted asset dependencies in dependency order', () => {
  let previous = -1;
  for (const script of scriptOrder) {
    const index = html.indexOf(`src="${script}"`);
    assert.ok(index >= 0, `${script} is referenced`);
    assert.ok(index > previous, `${script} follows its dependency`);
    previous = index;
  }
});

test('reader gives schema-versioned encrypted assets their dedicated rendering path', () => {
  assert.match(runtime, /item\.encryptedAssets/);
  assert.match(runtime, /EncryptedAssetItem\.encryptedAssetPagesForItem\(item\)/);
  assert.match(runtime, /EncryptedAssetReader\.createEncryptedAssetReader/);
  assert.match(runtime, /manifest: entry\.manifest/);
  assert.match(assets, /assets\.schemaVersion !== 1/);
  assert.match(assets, /assetId: page\.assetId, revision: page\.revision, manifest/);
});

test('encrypted rendering keeps Vault key, encrypted cache, and remote media gate responsibilities', () => {
  assert.match(runtime, /MangaVault\?\.loadActive\?\.\(\)/);
  assert.match(runtime, /masterKey: active\.rawKey/);
  assert.match(runtime, /EncryptedAssetCache\.createCache\(\)/);
  assert.match(runtime, /cache: \(encryptedAssetCachePromise \|\|=/);
  assert.match(runtime, /mediaAccess: win\.MangaReaderMediaAccess/);
  assert.match(runtime, /remoteAccess: win\.ImageRemoteAccess/);
  assert.match(runtime, /EncryptedAssetSync/);
  assert.match(html, /reader-image-enhancement\.js/);
});

test('ordinary and legacy page manifests are resolved by the separate PageSource layer', () => {
  const source = read('reader-page-source.js');
  assert.match(runtime, /pageSource\.resolve\(item/);
  assert.match(source, /item\.pageManifest/);
  assert.match(source, /createLegacyResolver/);
  assert.doesNotMatch(runtime, /resolvePage\(index|for \(let index = 1; index <= 2000/);
});

test('reader routes progress through the item-scoped progress repository', () => {
  assert.match(runtime, /target\.itemResumeKey/);
  assert.match(runtime, /progressRepository\?\.commit/);
  assert.doesNotMatch(runtime, /repository\.updateItem\(currentItem\.id, \{ readingProgress:/);
  assert.match(read('reader-progress-repository.js'), /mangaReaderLastPage/);
});

test('ordinary and encrypted render candidates use the same atomic page transition', () => {
  assert.match(runtime, /pageTransition\.request\(targetPage/);
  assert.match(runtime, /prepareOrdinaryPage\(targetPage/);
  assert.match(runtime, /prepareEncryptedPage\(targetPage/);
  assert.match(runtime, /await renderer\.readyPromise/);
  assert.match(runtime, /stage\.replaceChildren\(candidate\.frame\)/);
});
