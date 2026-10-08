import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import remoteAccess from '../image-remote-access.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function loadImagesModule() {
  const values = new Map([['mangaReaderImageVpnRequired','true']]);
  const backing = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
  const window = { localStorage: backing };
  const document = { readyState:'loading', addEventListener() {} };
  vm.runInNewContext(read('images.js'), { window, document });
  return { api:window.EncryptedImages, backing };
}

test('standalone encrypted gallery requires session and Vault, not VPN gate', () => {
  const html = read('images.html');
  const source = read('images.js');
  assert.match(html,/id="imageUploadForm"/);
  assert.match(html,/id="imageViewerStage"/);
  assert.match(html,/mobile-bottom-nav\.js/);
  assert.match(html,/app-desktop-rail\.js/);
  assert.match(source,/api\.loadActive\(\)/);
  assert.match(source,/api\.ensureSession\(\)/);
  assert.match(source,/sync\.html\?next=images\.html/);
  assert.doesNotMatch(html,/media-access-gate\.js|manga-list-route\.js|home-profile-spa\.js/);
  assert.doesNotMatch(source,/MangaReaderMediaAccess|canReadProtectedData/);
});

test('VPN bypass is scoped to gallery transfer settings and never changes user policy', () => {
  const { api, backing } = loadImagesModule();
  const scoped = api.vpnFreeTransferStorage(backing);
  assert.equal(backing.getItem('mangaReaderImageVpnRequired'),'true');
  assert.equal(scoped.getItem('mangaReaderImageVpnRequired'),'false');
  scoped.setItem('mangaReaderImageVpnRequired','false');
  assert.equal(backing.getItem('mangaReaderImageVpnRequired'),'true');
  const verdict = remoteAccess.evaluate({
    estimatedBytes:256,
    transferStorage:scoped,
    storage:scoped,
    mediaAccess:{getStatus:()=> 'blocked',canLoadExternalMedia:()=>false}
  });
  assert.equal(verdict.allowed,true);
  assert.equal(backing.getItem('mangaReaderImageVpnRequired'),'true');
  scoped.setItem('mangaReaderImageTransferStats','{"day":"2026-10-08"}');
  assert.ok(backing.getItem('mangaReaderImageTransferStats'));
});

test('only versioned encrypted image works enter the dedicated image gallery', () => {
  const {api} = loadImagesModule();
  assert.equal(api.isEncryptedItem({encryptedAssets:{schemaVersion:1,pages:[{assetId:'id'}]}}),true);
  assert.equal(api.isEncryptedItem({url:'https://example.com',pages:['1.jpg']}),false);
  assert.equal(api.isEncryptedItem({encryptedAssets:{schemaVersion:2,pages:[{}]}}),false);
  assert.equal(api.isEncryptedItem({encryptedAssets:{schemaVersion:1,pages:[]}}),false);
});

test('upload, authenticated encryption, rollback, acknowledgement, and zoom remain functional', () => {
  const js = read('images.js');
  assert.match(js,/EncryptedAssetImport\.create/);
  assert.match(js,/EncryptedAssetSync\.stageProcessedRevision/);
  assert.match(js,/EncryptedAssetSync\.publishPendingRevision/);
  assert.match(js,/EncryptedAssetSync\.discardImportedAsset/);
  assert.match(js,/api\.savePayload/);
  assert.match(js,/imageRetrySync/);
  assert.match(js,/activeController\?\.abort/);
  assert.match(js,/EncryptedAssetReader\.createPreviewLoader/);
  assert.match(js,/EncryptedAssetReader\.createEncryptedAssetReader/);
  assert.match(js,/renderer\?\.setScale/);
  assert.match(js,/imageViewerPrevious/);
  assert.match(js,/imageViewerNext/);
});

test('manga keeps normal works; encrypted image UI is isolated to images.html', () => {
  const manga = read('manga-list-route.js');
  const template = read('manga-list-template.js');
  assert.match(manga,/!item\.encryptedAssets\?\.pages\?\.length/);
  assert.doesNotMatch(template,/encryptedImageAddForm|encryptedImageAddDialog|addCustomBtn/);
  assert.doesNotMatch(manga,/bind\(importForm, 'submit'/);
  assert.match(read('app-desktop-rail.js'),/desktopNavImages/);
  assert.match(read('mobile-bottom-nav.js'),/mobileNavImages/);
  assert.match(read('sync.html'),/next === 'images\.html'/);
});