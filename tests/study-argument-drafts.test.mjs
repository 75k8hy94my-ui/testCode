import test from 'node:test';
import assert from 'node:assert/strict';
import Drafts from '../study-argument-drafts.js';

function storage(){
  const map=new Map();
  return{
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key)
  };
}

test('argument drafts save, load, and remove independently for new and existing cards',()=>{
  const store=storage();
  const newDraft=Drafts.save(null,{title:'新規',body:'本文',rank:'B'},store,Date.UTC(2026,7,27,14,0,0));
  const existingDraft=Drafts.save('arg-1',{title:'既存',body:'編集本文',rank:'A+'},store,Date.UTC(2026,7,27,14,0,3));
  assert.equal(newDraft.argumentId,null);
  assert.equal(existingDraft.argumentId,'arg-1');
  assert.equal(Drafts.load(null,store).title,'新規');
  assert.equal(Drafts.load('arg-1',store).title,'既存');
  assert.equal(Drafts.remove('arg-1',store),true);
  assert.equal(Drafts.load('arg-1',store),null);
  assert.equal(Drafts.load(null,store).title,'新規');
});

test('draft restore prefers a newer draft over finalized argument data',()=>{
  const newer={savedAt:'2026-08-27T14:00:05.000Z'};
  const older={savedAt:'2026-08-27T13:59:55.000Z'};
  const argument={updatedAt:'2026-08-27T14:00:00.000Z'};
  assert.equal(Drafts.shouldRestore(newer,argument),true);
  assert.equal(Drafts.shouldRestore(older,argument),false);
  assert.equal(Drafts.shouldRestore(newer,null),true);
});

test('draft signature ignores save timestamp but tracks editable content and annotations',()=>{
  const base={argumentId:'a',title:'論証',body:'abc',rank:'B',annotations:[{start:0,end:1,style:'bold'}],savedAt:'2026-08-27T14:00:00.000Z'};
  const later={...base,savedAt:'2026-08-27T14:01:00.000Z'};
  assert.equal(Drafts.signature(base),Drafts.signature(later));
  assert.notEqual(Drafts.signature(base),Drafts.signature({...later,body:'abcd'}));
});

test('argument draft autosave cadence is three seconds',()=>{
  assert.equal(Drafts.AUTOSAVE_INTERVAL_MS,3000);
});
