import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const avatar=require('../profile-avatar.js');
const payload=require('../vault-payload.js');
const valid='data:image/jpeg;base64,'+'a'.repeat(2000);

test('avatar is stored and synchronized through the existing encrypted Vault payload',()=>{
  const storage=new Map();
  avatar.write(valid,storage);
  assert.equal(avatar.read(storage),valid);
  const saved=payload.buildFromLocalStorage(storage);
  assert.equal(saved.profileAvatar,valid);
  const restored=new Map();
  payload.applyToLocalStorage(saved,restored);
  assert.equal(avatar.read(restored),valid);
  avatar.write('',restored);
  assert.equal(restored.has(avatar.STORAGE_KEY),false);
  payload.clearDeviceData(storage);
  assert.equal(storage.has(avatar.STORAGE_KEY),false);
});

test('avatar refuses external URLs, SVG payloads, oversized images and malformed data',()=>{
  for(const bad of ['https://example.com/avatar.jpg','data:image/svg+xml;base64,AA==','data:image/png;base64,AA==','data:image/jpeg;base64,\nAA==','data:image/jpeg;base64,'+'a'.repeat(100001)]){
    assert.equal(avatar.normalize(bad),'');
    assert.equal(payload.normalize({profileAvatar:bad}).profileAvatar,'');
  }
});

test('avatar decoder rejects unsupported files and crops to 256 square with bounded encoded JPEG',async()=>{
  await assert.rejects(avatar.fromFile({type:'image/svg+xml',size:20}),/JPEG/);
  await assert.rejects(avatar.fromFile({type:'image/png',size:9*1024*1024}),/8MB/);
  let uploaded;
  let revoked=false;
  const element={naturalWidth:800,naturalHeight:600};
  const promise=avatar.fromFile({type:'image/png',size:1234},{
    urlApi:{createObjectURL:()=> 'blob:testing',revokeObjectURL:()=>{revoked=true;}},
    imageFactory:()=>element,
    canvasFactory:()=>({set width(v){this.w=v;},set height(v){this.h=v;},getContext:()=>({drawImage:(...args)=>{uploaded=args;}}),toDataURL:()=>valid}),
  });
  element.onload();
  assert.equal(await promise,valid);
  assert.equal(revoked,true);
  assert.equal(uploaded[1],100);
  assert.equal(uploaded[2],0);
  assert.equal(uploaded[3],600);
  assert.equal(uploaded[4],600);
  assert.equal(uploaded[7],256);
  assert.equal(uploaded[8],256);
});
