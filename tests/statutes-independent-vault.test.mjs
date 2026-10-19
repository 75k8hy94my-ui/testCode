import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../statutes-vault.js',import.meta.url),'utf8');
const clone=x=>structuredClone(x);
const user='00000000-0000-4000-a000-000000000001';
const definitionKey='testCode.statutes.definitions.v1';
const rawMaster=new Uint8Array(32).fill(13);
function storage(seed={}) {
  const map=new Map(Object.entries(seed));
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key),
    dump:()=>Object.fromEntries(map),
  };
}
function createEnv(database, local=storage(), {active=true, account=user}={}) {
  const session={refresh_token:'refresh',user:{id:account}};
  const vault={
    loadSession:()=>session,
    loadActive:()=>active?{rawKey:rawMaster}:null,
    withSession:cb=>cb('access',session.user),
    api:async(path,options={})=>{
      if(path.includes('select=user_id,revision,ciphertext,wrapped_key')) {
        return database.row && database.row.user_id===account?[clone(database.row)]:[];
      }
      if(path.includes('testcode_statute_vaults') && options.method==='POST') {
        if(!database.row) database.row=clone(JSON.parse(options.body));
        return null;
      }
      if(path.includes('testcode_statute_vaults') && options.method==='PATCH') {
        const expected=Number(/revision=eq\.(\d+)/.exec(path)?.[1]);
        if(!database.row || database.row.user_id!==account || database.row.revision!==expected) return [];
        Object.assign(database.row,clone(JSON.parse(options.body)));
        return [{revision:database.row.revision}];
      }
      throw Error('Unexpected API request: '+path);
    }
  };
  const handlers={};
  const doc={visibilityState:'visible',addEventListener:(name,cb)=>handlers[name]=cb,dispatchEvent:()=>{}};
  const win={MangaVault:vault,TestCodeGuest:{isActive:()=>false},addEventListener:()=>{},dispatchEvent:()=>{}};
  const scope={window:win,localStorage:local,document:doc,navigator:{onLine:true},
    crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,Uint8Array,
    setTimeout,clearTimeout,CustomEvent:class {constructor(type){this.type=type;}}};
  vm.runInNewContext(source,scope);
  return {api:win.StatutesVault,local};
}

test('first enrollment encrypts only statutes data, then survives a simulated browser restart without master key',async()=>{
  const database={};
  const local=storage({[definitionKey]:JSON.stringify([{word:'暴行',definition:'有形力の行使'}])});
  const first=createEnv(database,local);
  assert.equal((await first.api.sync()).state,'success');
  assert.ok(first.api.hasDeviceKey());
  assert.equal(database.row.revision,1);
  assert.ok(database.row.wrapped_key);
  assert.ok(database.row.ciphertext);
  assert.equal(JSON.stringify(database.row).includes('有形力の行使'),false);
  const restarted=createEnv(database,local,{active:false});
  assert.equal((await restarted.api.sync()).state,'success');
  local.setItem(definitionKey,JSON.stringify([{word:'暴行',definition:'改訂版'}]));
  assert.equal((await restarted.api.sync()).state,'success');
  assert.equal(database.row.revision,2);
  assert.equal(JSON.stringify(database.row).includes('改訂版'),false);
});

test('a second device needs the master key once, then can sync with its own persisted statute key',async()=>{
  const database={};
  const first=createEnv(database,storage({[definitionKey]:JSON.stringify([{word:'権利'}])}));
  await first.api.sync();
  const otherLocal=storage();
  const other=createEnv(database,otherLocal,{active:false});
  assert.equal((await other.api.sync()).reason,'locked');
  const enrolled=createEnv(database,otherLocal,{active:true});
  assert.equal((await enrolled.api.sync()).state,'success');
  assert.deepEqual(JSON.parse(otherLocal.getItem(definitionKey)),[{word:'権利'}]);
  assert.equal((await createEnv(database,otherLocal,{active:false}).api.sync()).state,'success');
});

test('divergent edits are not overwritten automatically',async()=>{
  const database={};
  const aLocal=storage({[definitionKey]:JSON.stringify([{word:'initial'}])});
  const a=createEnv(database,aLocal);
  await a.api.sync();
  const bLocal=storage();
  const b=createEnv(database,bLocal);
  await b.api.sync();
  aLocal.setItem(definitionKey,JSON.stringify([{word:'device-a'}]));
  bLocal.setItem(definitionKey,JSON.stringify([{word:'device-b'}]));
  assert.equal((await a.api.sync()).state,'success');
  assert.equal((await b.api.sync()).reason,'local-conflict');
  assert.deepEqual(JSON.parse(bLocal.getItem(definitionKey)),[{word:'device-b'}]);
  assert.equal((await b.api.resolveConflict('cloud')).state,'success');
  assert.deepEqual(JSON.parse(bLocal.getItem(definitionKey)),[{word:'device-a'}]);
});

test('Anki FSRS history, custom weights and retention migrate across independent vault devices',async()=>{
  const db={},weights=Array.from({length:21},(_,i)=>i===0?0.2:i===20?0.1542:0.4);
  const source=storage({
    [definitionKey]:JSON.stringify([{word:'刑法１９９条'}]),
    'testCode.statutes.definitionReviews.v1':JSON.stringify({'刑法199条':{reviews:[{at:1700000000000,grade:2}],lastReviewed:1700000000000,due:1700086400000}}),
    'testCode.statutes.definitionFSRSWeights.v1':JSON.stringify(weights),
    'testCode.statutes.definitionRetention.v1':'0.95',
  });
  const first=createEnv(db,source);
  assert.equal((await first.api.sync()).state,'success');
  const other=storage();
  const enrolled=createEnv(db,other);
  assert.equal((await enrolled.api.sync()).state,'success');
  assert.equal(JSON.parse(other.getItem('testCode.statutes.definitionReviews.v1'))['刑法199条'].reviews[0].grade,2);
  assert.deepEqual(JSON.parse(other.getItem('testCode.statutes.definitionFSRSWeights.v1')),weights);
  assert.equal(JSON.parse(other.getItem('testCode.statutes.definitionRetention.v1')),0.95);
  const restarted=createEnv(db,other,{active:false});
  assert.equal((await restarted.api.sync()).state,'success');
});

test('independently entered study cards survive account encryption, restart and new device',async()=>{
  const database={};
  const manualKey='testCode.statutes.manualCards.v1';
  const original=[{id:'manual-1',front:'民法９４条２項の類推適用',back:'虚偽の外観と帰責性、第三者の信頼',category:'民法',createdAt:1,updatedAt:1}];
  const userLocal=storage({[manualKey]:JSON.stringify(original)});
  const primary=createEnv(database,userLocal);
  assert.equal((await primary.api.sync()).state,'success');
  assert.equal(JSON.stringify(database.row).includes('虚偽の外観'),false);
  const otherStorage=storage();
  const secondary=createEnv(database,otherStorage);
  assert.equal((await secondary.api.sync()).state,'success');
  assert.deepEqual(JSON.parse(otherStorage.getItem(manualKey)),original);
  const reopened=createEnv(database,otherStorage,{active:false});
  assert.equal((await reopened.api.sync()).state,'success');
  otherStorage.setItem(manualKey,JSON.stringify([...original,{...original,id:'manual-2',front:'商法の問題'}]));
  assert.equal((await reopened.api.sync()).state,'success');
  assert.equal(database.row.revision,2);
});
