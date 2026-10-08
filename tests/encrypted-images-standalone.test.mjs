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
  assert.match(read('sync.html'),/\['images\.html','drive-gallery\.html'\]\.includes\(next\)/);
});

test('processing complete is never confused with upload success, and inactivity is visible', () => {
  const {api} = loadImagesModule();
  let time = 100000;
  const tracker = api.createUploadProgressTracker(() => time);
  tracker.start(2);
  let s = tracker.update({ phase:'processing', total:2, fileIndex:0, fileName:'page1.png', detail:{phase:'complete',completed:1,total:1} });
  assert.equal(s.completedPages,0);
  assert.equal(s.state,'running');
  assert.match(s.detail,/暗号化・アップロードはこれから/);
  s = tracker.update({ phase:'encrypt', fileIndex:0, detail:{completed:2,total:8} });
  assert.equal(s.stageIndex,1);
  assert.match(s.detail,/2 \/ 8/);
  s = tracker.update({ phase:'upload', fileIndex:0, detail:{completed:0,total:8,confirmedBytes:0,totalBytes:500000} });
  assert.equal(s.completedPages,0);
  assert.match(s.detail,/送信を確認したファイル 0 \/ 8/);
  time += 31000;
  assert.equal(tracker.snapshot().waiting,true);
  assert.equal(tracker.snapshot().idleSeconds,31);
  s = tracker.update({ phase:'upload', detail:{completed:1,total:8,confirmedBytes:123456,totalBytes:500000} });
  assert.equal(s.waiting,false);
  assert.match(s.detail,/120\.6 KB/);
  s = tracker.update({ phase:'register' });
  assert.equal(s.completedPages,0);
  assert.match(s.detail,/登録完了を待って/);
  s = tracker.update({ phase:'uploaded', fileIndex:0, completedPages:1, total:2 });
  assert.equal(s.completedPages,1);
  tracker.update({ phase:'processing', fileIndex:1, fileName:'page2.png', total:2 });
  tracker.update({ phase:'uploaded', fileIndex:1, completedPages:2, total:2 });
  s = tracker.update({ phase:'sync' });
  assert.equal(s.state,'running');
  assert.equal(s.completedPages,2);
  assert.equal(s.stageIndex,4);
  s = tracker.update({ phase:'done' });
  assert.equal(s.state,'done');
  assert.equal(s.waiting,false);
  assert.equal(s.completedPages,2);
});

test('upload progress panel exposes confirmed-page counts, server steps and time since last response', () => {
  const html = read('images.html');
  for (const id of ['imageUploadProgress','imageProgressState','imageProgressElapsed',
    'imageProgressFile','imagePageProgress','imageProgressCount','imageProgressActivity',
    'imageProgressDetail','imageProgressSteps','imageProgressHint']) {
    assert.match(html,new RegExp('id="' + id + '"'));
  }
  assert.match(read('images.js'),/startUploadProgress\(files\.length\)/);
  assert.match(read('images.js'),/onProgress: progress => \{/);
  assert.match(read('images.js'),/reportUploadProgress\(progress\)/);
  assert.match(read('images.js'),/finishUploadProgress\('done'\)/);
  assert.match(read('images.js'),/window\.setInterval\(renderUploadProgress, 1000\)/);
});


test('gallery quality profiles use one zoom level and cap file count without altering original compression defaults', async () => {
  const profileApi = await import('../image-compression-profile.js');
  const pyramid = await import('../image-pyramid-builder.js');
  const {api} = loadImagesModule();
  const original = profileApi.default.getCompressionProfile();
  const oldLevels = pyramid.default.planZoomLevels(6000, 6000, original);
  assert.equal(oldLevels.length, 2, 'baseline format stored two overlapping zoom resolutions');

  for (const [mode, maxEdge, quality] of [
    ['compact',2048,0.78],['balanced',3072,0.86],['detailed',4096,0.90]
  ]) {
    const next = api.createImageUploadProfile(mode, original);
    const validated = profileApi.default.normalizeCompressionProfile(next);
    assert.equal(validated.zoom.maximumLongEdge,maxEdge);
    assert.equal(validated.zoom.intermediateLongEdge,maxEdge);
    assert.equal(validated.zoom.tileSize,1024);
    assert.equal(validated.zoom.quality,quality);
    assert.deepEqual(validated.preview,original.preview);
    const levels = pyramid.default.planZoomLevels(6000,6000,validated);
    assert.equal(levels.length,1);
    assert.equal(levels[0].longEdge,maxEdge);
  }
  assert.equal(original.zoom.tileSize,512,'global/default profile must remain unchanged for existing data');
  assert.equal(original.zoom.quality,0.88);
  assert.equal(api.createImageUploadProfile('unknown',original).zoom.maximumLongEdge,3072);
});

test('image upload page exposes a quality choice and a real encoded size before upload', () => {
  const html=read('images.html');
  assert.match(html,/id="imageQualityMode"/);
  for (const value of ['compact','balanced','detailed']) assert.match(html,new RegExp('value="'+value+'"'));
  assert.match(html,/id="imageUploadSize"/);
  const js=read('images.js');
  assert.match(js,/const profile = createImageUploadProfile/);
  assert.match(js,/processPhoto\(file, \{/);
  assert.match(js,/onProgress: options\.onProgress/);
  assert.match(js,/processedTotalBytes \+= size\.outputBytes/);
});


test('photo-only modes provide content-dependent size limits and bounded quality protection', () => {
  const {api}=loadImagesModule();
  const caps={
    compact:{max:1536*1024,minQ:0.62,mp:350*1024},
    balanced:{max:3*1024*1024,minQ:0.66,mp:440*1024},
    detailed:{max:6*1024*1024,minQ:0.72,mp:620*1024}
  };
  for(const [mode,expected] of Object.entries(caps)) {
    const strategy=api.createPhotoOptimization(mode);
    assert.equal(strategy.maxZoomBytes,expected.max);
    assert.equal(strategy.bytesPerMegapixel,expected.mp);
    assert.equal(strategy.minQuality,expected.minQ);
    assert.ok(strategy.maxPasses>=3 && strategy.maxPasses<=6);
    assert.ok(strategy.minZoomLongEdge>1440);
    assert.ok(api.createImageUploadProfile(mode,{zoom:{quality:0.7},preview:{maxLongEdge:1440}}).zoom.quality>=strategy.minQuality);
  }
  assert.equal(api.createPhotoOptimization('unknown').maxZoomBytes,caps.balanced.max);
  const html=read('images.html');
  assert.match(html,/id="imageQualityMode"/);
  assert.doesNotMatch(html,/細かい文字を読む画像/);
  assert.match(read('images.js'),/profile, photoOptimization, preferWorker: true/);
});
