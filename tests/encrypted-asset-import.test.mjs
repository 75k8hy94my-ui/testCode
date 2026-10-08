import test from 'node:test';
import assert from 'node:assert/strict';
import importer from '../encrypted-asset-import.js';

const manifest = { schemaVersion: 1, compressionProfileVersion: 1, preview: { width: 1440, height: 960, mimeType: 'image/webp', bytes: 1, quality: 0.7, longEdge: 1440 }, zoom: { tileSize: 512, levels: [] } };

test('imports selected images in order, stages and publishes encrypted assets, and returns a Reader item', async () => {
  const calls = [];
  let id = 0;
  const api = importer.create({
    processPhoto: async (file) => { calls.push(`process:${file.name}`); return { manifest, previewBlob: file.name, tileBlobs: [] }; },
    stage: async (args) => { calls.push(`stage:${args.assetId}:${args.processed.previewBlob}`); return { objectIds: ['preview'] }; },
    publish: async (args) => { calls.push(`publish:${args.assetId}`); return { ok: true, metadata: { revision: 1 } }; },
    tombstone: async (assetId, revision) => calls.push(`tombstone:${assetId}:${revision}`),
    createAssetId: () => `6dc3773a-a3ef-4bb8-9cbf-15096098db${++id}0`,
  });
  const result = await api.importFiles({ files: [{ name: 'p1.png' }, { name: 'p2.png' }], title: 'Secret book' });
  assert.deepEqual(calls, ['process:p1.png', 'stage:6dc3773a-a3ef-4bb8-9cbf-15096098db10:p1.png', 'publish:6dc3773a-a3ef-4bb8-9cbf-15096098db10', 'process:p2.png', 'stage:6dc3773a-a3ef-4bb8-9cbf-15096098db20:p2.png', 'publish:6dc3773a-a3ef-4bb8-9cbf-15096098db20']);
  assert.equal(result.title, 'Secret book');
  assert.deepEqual(result.pages, []);
  assert.deepEqual(result.encryptedAssets.pages.map(page => [page.assetId, page.revision]), [['6dc3773a-a3ef-4bb8-9cbf-15096098db10', 1], ['6dc3773a-a3ef-4bb8-9cbf-15096098db20', 1]]);
});

test('tombstones already-published pages when a later page fails', async () => {
  const calls = [];
  let id = 0;
  const api = importer.create({
    processPhoto: async (file) => { if (file.bad) throw new Error('invalid image'); return { manifest, previewBlob: file.name, tileBlobs: [] }; },
    stage: async () => ({ objectIds: ['preview'] }),
    publish: async () => ({ ok: true }),
    tombstone: async (assetId, revision) => calls.push([assetId, revision]),
    createAssetId: () => `6dc3773a-a3ef-4bb8-9cbf-15096098db${++id}0`,
  });
  await assert.rejects(api.importFiles({ files: [{ name: 'p1.png' }, { name: 'bad', bad: true }], title: 'Secret book' }), /invalid image/);
  assert.deepEqual(calls, [['6dc3773a-a3ef-4bb8-9cbf-15096098db10', 1]]);
});


test('cancel after publication cleans the newly created encrypted page', async () => {
  const controller = new AbortController();
  const rolledBack = [];
  const api = importer.create({
    processPhoto: async () => ({ manifest }),
    stage: async () => ({ objectIds: ['preview'] }),
    publish: async () => { controller.abort(); return { ok: true, metadata: { revision: 1 } }; },
    tombstone: async () => {},
    cleanupAsset: async attempt => rolledBack.push(attempt),
    createAssetId: () => '6dc3773a-a3ef-4bb8-9cbf-15096098db10'
  });
  await assert.rejects(api.importFiles({ files: [{name:'one'}], title:'book', signal:controller.signal }), {name:'AbortError'});
  assert.equal(rolledBack.length, 1);
  assert.equal(rolledBack[0].published, true);
});

test('staging failure also invokes cleanup, and cleanup errors are surfaced', async () => {
  const rolledBack = [];
  const api = importer.create({
    processPhoto: async () => ({ manifest }),
    stage: async () => { throw new Error('stage-failed'); },
    publish: async () => ({ok:true}),
    tombstone: async () => {},
    cleanupAsset: async attempt => { rolledBack.push(attempt.assetId); throw new Error('cleanup-failed'); },
    createAssetId: () => '6dc3773a-a3ef-4bb8-9cbf-15096098db10'
  });
  await assert.rejects(api.importFiles({files:[{name:'one'}],title:'book'}), /後始末に失敗/);
  assert.equal(rolledBack.length, 1);
});


test('import forwards image-processing and storage confirmation stages with consistent page indices', async () => {
  const events = [];
  const api = importer.create({
    processPhoto: async (_file, options) => {
      options.onProgress({phase:'complete',completed:1,total:1});
      return {manifest,previewBlob:'preview',tileBlobs:[]};
    },
    stage: async ({onProgress}) => {
      onProgress({phase:'encrypt',completed:1,total:1});
      return {objectIds:['preview']};
    },
    publish: async ({onProgress}) => {
      onProgress({phase:'checking'});
      onProgress({phase:'upload',completed:0,total:1,confirmedBytes:0,totalBytes:100});
      onProgress({phase:'upload',completed:1,total:1,confirmedBytes:100,totalBytes:100});
      onProgress({phase:'register'});
      onProgress({phase:'registered'});
      return {ok:true,metadata:{revision:1}};
    },
    tombstone: async()=>{},
    createAssetId:()=>'6dc3773a-a3ef-4bb8-9cbf-15096098db10'
  });
  await api.importFiles({
    files:[{name:'first.png'}],title:'test',
    onProgress:e=>events.push(e)
  });
  assert.equal(events[0].phase,'processing');
  assert.equal(events[1].detail.phase,'complete');
  assert.equal(events[1].completedPages,0);
  assert.equal(events.find(e=>e.phase==='encrypt'&&e.detail?.completed===1).fileIndex,0);
  assert.equal(events.find(e=>e.phase==='upload'&&e.detail?.completed===0).completedPages,0);
  assert.equal(events.find(e=>e.phase==='register').completedPages,0);
  const last=events.at(-1);
  assert.equal(last.phase,'uploaded');
  assert.equal(last.completedPages,1);
  assert.equal(last.total,1);
});
