import test from 'node:test';
import assert from 'node:assert/strict';
import ChatStore from '../chat-store.js';

function memoryStorage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    dump:()=>[...map.entries()]
  };
}

function key(seed=7){
  return Uint8Array.from({length:32},(_,i)=>(i*17+seed)%256);
}

test('chat store defaults are minimal and normalized',()=>{
  const state=ChatStore.createDefaultState();
  assert.deepEqual(state,{version:1,settings:{apiEndpoint:'',apiKey:'',defaultModel:''},conversations:[],activeConversationId:null});
  assert.deepEqual(ChatStore.normalizeState({version:99,settings:{apiEndpoint:12,apiKey:'secret',defaultModel:null,extra:'x'},conversations:'bad',activeConversationId:88,extra:true}),{
    version:1,settings:{apiEndpoint:'',apiKey:'secret',defaultModel:''},conversations:[],activeConversationId:null
  });
});

test('chat store encrypts secrets and messages at rest and decrypts with the same vault key',async()=>{
  const state=ChatStore.createDefaultState();
  state.settings={apiEndpoint:'https://pc.tail.example',apiKey:'very-secret-chat-key',defaultModel:'dolphin-mistral:7b'};
  state.conversations=[{id:'c1',title:'秘密の相談',createdAt:'2026-09-03T00:00:00.000Z',updatedAt:'2026-09-03T00:00:01.000Z',messages:[{id:'m1',role:'user',content:'秘密本文',createdAt:'2026-09-03T00:00:00.000Z'}]}];
  state.activeConversationId='c1';
  const envelope=await ChatStore.encryptState(state,key());
  const serialized=JSON.stringify(envelope);
  assert.equal(envelope.type,'testcode-chat-local');
  assert.equal(envelope.version,1);
  assert.ok(envelope.iv && envelope.ciphertext);
  for(const plaintext of ['very-secret-chat-key','秘密本文','pc.tail.example']) assert.equal(serialized.includes(plaintext),false);
  assert.deepEqual(await ChatStore.decryptState(envelope,key()),ChatStore.normalizeState(state));
});

test('chat store rejects ciphertext decrypted with a different vault key',async()=>{
  const envelope=await ChatStore.encryptState(ChatStore.createDefaultState(),key(3));
  await assert.rejects(()=>ChatStore.decryptState(envelope,key(4)));
});

test('chat store persists only encrypted envelope in local storage',async()=>{
  const storage=memoryStorage();
  const state=ChatStore.createDefaultState();
  state.settings.apiKey='do-not-store-plain';
  state.conversations=[{id:'c1',title:'t',createdAt:'a',updatedAt:'a',messages:[{id:'m1',role:'user',content:'plain-message',createdAt:'a'}]}];
  const envelope=await ChatStore.encryptState(state,key());
  ChatStore.saveEncrypted(envelope,storage);
  const raw=storage.dump().map(([,v])=>v).join('\n');
  assert.equal(raw.includes('do-not-store-plain'),false);
  assert.equal(raw.includes('plain-message'),false);
  assert.deepEqual(ChatStore.loadEncrypted(storage),envelope);
});

test('chat conversation helpers create update and delete without malformed roles',()=>{
  let state=ChatStore.createDefaultState();
  const created=ChatStore.createConversation(state,'c1','2026-09-03T00:00:00.000Z');
  state=created.state;
  assert.equal(created.conversation.id,'c1');
  state=ChatStore.appendMessage(state,'c1',{id:'m1',role:'user',content:'hello',createdAt:'x'});
  state=ChatStore.appendMessage(state,'c1',{id:'m2',role:'tool',content:'ignored',createdAt:'x'});
  assert.equal(state.conversations[0].messages.length,1);
  state=ChatStore.deleteConversation(state,'c1');
  assert.equal(state.conversations.length,0);
  assert.equal(state.activeConversationId,null);
});
