import test from 'node:test';
import assert from 'node:assert/strict';
import ChatSync from '../chat-sync.js';

function fakeVault({rows=[],rpcRows=[]}={}){
  const calls=[];
  return {
    calls,
    withSession:async(work)=>work('access-token',{id:'user-1'}),
    api:async(path,options={})=>{
      calls.push({path,options});
      if(path.includes('/rpc/update_chat_vault')) return rpcRows;
      if((options.method||'GET')==='POST') return [{revision:1,updated_at:'created'}];
      return rows;
    }
  };
}
function memoryStorage(){const map=new Map();return{getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}}

const envelope={type:'testcode-chat-local',version:1,iv:'iv-only',ciphertext:'cipher-only'};

test('chat sync reads only the signed-in users encrypted row',async()=>{
  const vault=fakeVault({rows:[{payload:envelope,revision:4,updated_at:'now'}]});
  const sync=ChatSync.createClient({vault,storage:memoryStorage()});
  const record=await sync.loadRemote();
  assert.deepEqual(record.payload,envelope);
  assert.match(vault.calls[0].path,/chat_vaults\?select=payload%2Crevision%2Cupdated_at&user_id=eq\.user-1/);
  assert.equal(vault.calls[0].options.token,'access-token');
});

test('chat sync creates a remote row using only ciphertext envelope',async()=>{
  const vault=fakeVault({rows:[]});
  const sync=ChatSync.createClient({vault,storage:memoryStorage()});
  await sync.loadRemote();
  await sync.saveRemote(envelope);
  const post=vault.calls.find(c=>(c.options.method||'GET')==='POST'&&!c.path.includes('/rpc/'));
  const body=JSON.parse(post.options.body);
  assert.deepEqual(body.payload,envelope);
  assert.equal(JSON.stringify(body).includes('apiKey'),false);
  assert.equal(JSON.stringify(body).includes('messages'),false);
  assert.equal(body.user_id,'user-1');
});

test('chat sync uses optimistic revision and raises conflict instead of overwriting',async()=>{
  const vault=fakeVault({rows:[{payload:envelope,revision:3,updated_at:'old'}],rpcRows:[]});
  const sync=ChatSync.createClient({vault,storage:memoryStorage()});
  await sync.loadRemote();
  await assert.rejects(()=>sync.saveRemote(envelope),error=>error&&error.code==='CHAT_SYNC_CONFLICT');
  const rpc=vault.calls.find(c=>c.path.includes('/rpc/update_chat_vault'));
  assert.deepEqual(JSON.parse(rpc.options.body),{expected_revision:3,new_payload:envelope});
});
