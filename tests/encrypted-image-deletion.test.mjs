import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import deletion from '../encrypted-image-deletion.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const cryptoApi = { tileObjectId: (level, x, y) => `tile-${level}-${x}-${y}` };
const makePage = (assetId, revision = 1) => ({
  assetId, revision, manifest: { zoom: { levels: [
    { level: 0, tiles: [{x:0,y:0}, {x:1,y:0}] },
    { level: 1, tiles: [{x:0,y:1}] }
  ] } }
});
const makeWork = (id, pages) => ({ id, title: id, encryptedAssets:{schemaVersion:1,pages} });
const getPages = work => work.encryptedAssets.pages;

test('photo manifest enumerates every remote object without needing a populated cache', () => {
  assert.deepEqual(deletion.objectIdsForManifest(makePage('asset').manifest, cryptoApi),
    ['preview','tile-0-0-0','tile-0-1-0','tile-1-0-1']);
  assert.throws(() => deletion.objectIdsForManifest({zoom:{levels:[{level:0,tiles:[{x:0,y:0},{x:0,y:0}]}]}}, cryptoApi),/重複/);
});

test('confirmed encrypted-image deletion tombstones every page before removing only the selected work', async () => {
  const first = makeWork('album-a',[makePage('asset-a'),makePage('asset-b')]);
  const second = makeWork('album-b',[makePage('asset-c')]);
  const other = {id:'manga-item',title:'manga'};
  const calls = [], cleanup = [];
  let next = null;
  const result = await deletion.deleteWork({
    id:'album-a',items:[first,other,second],getPages,cryptoApi,
    lookupRemote:async page => ({revision:page.revision,deletedAt:null}),
    tombstoneRemote:async page => {calls.push(page.assetId);return {deletedAt:'2026-10-25T00:00:00Z'};},
    rememberCleanup:async page => cleanup.push([page.assetId,page.objectIds]),
    persistLocal:async items => { assert.deepEqual(calls,['asset-a','asset-b']);next=items; }
  });
  assert.deepEqual(next,[other,second]);
  assert.equal(result.pages.length,2);
  assert.deepEqual(cleanup.map(pair=>pair[0]),['asset-a','asset-b']);
  assert.deepEqual(cleanup[0][1],['preview','tile-0-0-0','tile-0-1-0','tile-1-0-1']);
});

test('deletion can retry after partial tombstone failure without losing local metadata', async () => {
  const work=makeWork('album',[makePage('a'),makePage('b')]);
  const deleted=new Set(),cleanup=[];
  let commits=0,failSecond=true;
  const options={
    id:'album',items:[work],getPages,cryptoApi,
    lookupRemote:async page=>({revision:1,deletedAt:deleted.has(page.assetId)?'deleted':null}),
    tombstoneRemote:async page=>{
      if(page.assetId==='b'&&failSecond) throw new Error('temporary network error');
      deleted.add(page.assetId);return {deletedAt:'deleted'};
    },
    rememberCleanup:async page=>cleanup.push(page.assetId),
    persistLocal:async()=>{commits++;}
  };
  await assert.rejects(deletion.deleteWork(options),/temporary network error/);
  assert.equal(commits,0);
  assert.deepEqual([...deleted],['a']);
  failSecond=false;
  await deletion.deleteWork(options);
  assert.equal(commits,1);
  assert.deepEqual([...deleted],['a','b']);
  assert.deepEqual(cleanup,['a','a','b']);
});

test('invalid references, shared assets and ambiguous identifiers cannot delete remote data', async () => {
  const first=makeWork('a',[makePage('shared')]), second=makeWork('b',[makePage('shared')]);
  let calls=0;
  const args={
    id:'a',items:[first,second],getPages,cryptoApi,
    lookupRemote:async()=>{calls++;return null;},
    tombstoneRemote:async()=>{calls++;return {deletedAt:'deleted'};},
    rememberCleanup:async()=>{calls++;},
    persistLocal:async()=>{calls++;}
  };
  await assert.rejects(deletion.deleteWork(args),/別の作品/);
  assert.equal(calls,0);
  await assert.rejects(deletion.deleteWork({...args,id:'nope'}),/見つかりません/);
  await assert.rejects(deletion.deleteWork({...args,items:[first,first]}),/見つかりません/);
  assert.equal(calls,0);
});

test('cache-free deletion removes all manifest objects after server tombstone', async () => {
  const removed=[], cacheRemovals=[];
  const backend={
    fetchRemoteAsset:async()=>({revision:1,deletedAt:'deleted'}),
    buildStorageObjectPath:(user,id,rev,obj)=>[user,id,rev,obj].join('/'),
    objectId:id=>id
  };
  const module = { exports:{} };
  vm.runInNewContext(read('encrypted-asset-sync.js'), {
    module,
    require:path=>path==='./encrypted-asset-backend.js'?backend:({}),
  });
  const sync=module.exports;
  const result=await sync.discardImportedAsset({
    vault:{withSession:async fn=>fn('token',{id:'user'})},
    storage:{remove:async(path)=>{removed.push(path);}},
    cache:{list:async()=>[],removeAsset:async id=>{cacheRemovals.push(id);}},
    assetId:'asset',expectedRevision:1,objectIds:['preview','tile-0-0-0']
  });
  assert.deepEqual(removed,['user/asset/1/preview','user/asset/1/tile-0-0-0']);
  assert.deepEqual(cacheRemovals,['asset']);
  assert.equal(result.removedObjects,2);
});

test('storage deletion failure retains local encrypted cache for retry', async () => {
  const backend={fetchRemoteAsset:async()=>({revision:1,deletedAt:'deleted'}),
    buildStorageObjectPath:(_user,_id,_rev,obj)=>obj,
    objectId:id=>id};
  const module={exports:{}};
  vm.runInNewContext(read('encrypted-asset-sync.js'),{
    module,require:path=>path==='./encrypted-asset-backend.js'?backend:({})
  });
  let erased=false;
  await assert.rejects(module.exports.discardImportedAsset({
    vault:{withSession:async fn=>fn('token',{id:'user'})},
    storage:{remove:async()=>{throw new Error('offline');}},
    cache:{list:async()=>[],removeAsset:async()=>{erased=true;}},
    assetId:'asset',expectedRevision:1,objectIds:['preview']
  }),/offline/);
  assert.equal(erased,false);
});

test('signed-in image gallery exposes a separate deletion action and guarded sync retry', () => {
  const html=read('images.html'),js=read('images.js'),css=read('images.css');
  assert.match(html,/encrypted-image-deletion\\.js/);
  assert.match(js,/imageDeleteButton/);
  assert.match(js,/window\\.confirm/);
  assert.match(js,/EncryptedImageDeletion\\.deleteWork/);
  assert.match(js,/retryCleanup/);
  assert.match(js,/await syncMetadata\\(\\)/);
  assert.match(js,/pendingSync = true/);
  assert.match(css,/\\.imageDeleteButton:disabled/);
});
