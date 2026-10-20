import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const source=readFileSync(new URL('../statutes-vault.js',import.meta.url),'utf8');
const mergeSource=readFileSync(new URL('../statutes-sync-merge.js',import.meta.url),'utf8');
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
        if (database.beforePatch) {
          const hook=database.beforePatch;
          delete database.beforePatch;
          await hook();
        }
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
  vm.runInNewContext(mergeSource,scope);
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


const definition=(subject,article,start,definitionText)=>({
  subject,article,part:0,start,end:start+2,quote:'文言',definition:definitionText,card:true
});
const noteKey='testCode.statutes.articleNotes.v1';
const historyKey='testCode.statutes.articleNoteHistory.v1';
const reviewKey='testCode.statutes.definitionReviews.v1';
const manualKey='testCode.statutes.manualCards.v1';

test('different definitions, notes, review records, note history and manual cards merge without a conflict',async()=>{
  const db={}, firstLocal=storage(), secondLocal=storage();
  const a=createEnv(db,firstLocal), b=createEnv(db,secondLocal);
  await a.api.sync();
  await b.api.sync();
  const civil=definition('civil-general','９４条',0,'虚偽表示');
  const criminal=definition('criminal-special','１９９条',0,'殺人');
  firstLocal.setItem(definitionKey,JSON.stringify([civil]));
  secondLocal.setItem(definitionKey,JSON.stringify([criminal]));
  firstLocal.setItem(noteKey,JSON.stringify({'civil-general:９４条':'民法メモ'}));
  secondLocal.setItem(noteKey,JSON.stringify({'criminal-special:１９９条':'刑法メモ'}));
  firstLocal.setItem(historyKey,JSON.stringify({'h1':{key:'civil-general:９４条',at:100,after:'民法メモ'}}));
  secondLocal.setItem(historyKey,JSON.stringify({'h2':{key:'criminal-special:１９９条',at:101,after:'刑法メモ'}}));
  firstLocal.setItem(reviewKey,JSON.stringify({'civil:94':{reviews:[{at:1,grade:3}],due:8}}));
  secondLocal.setItem(reviewKey,JSON.stringify({'criminal:199':{reviews:[{at:2,grade:2}],due:9}}));
  firstLocal.setItem(manualKey,JSON.stringify([{id:'manual-1',front:'民法',back:'解答1'}]));
  secondLocal.setItem(manualKey,JSON.stringify([{id:'manual-2',front:'刑法',back:'解答2'}]));
  assert.equal((await a.api.sync()).state,'success');
  assert.equal((await b.api.sync()).state,'success');
  assert.equal(db.row.revision,3);
  const combinedDefinitions=JSON.parse(secondLocal.getItem(definitionKey));
  assert.equal(combinedDefinitions.length,2);
  assert.deepEqual(new Set(combinedDefinitions.map(x=>x.definition)),new Set(['虚偽表示','殺人']));
  assert.equal(JSON.parse(secondLocal.getItem(noteKey))['civil-general:９４条'],'民法メモ');
  assert.equal(JSON.parse(secondLocal.getItem(noteKey))['criminal-special:１９９条'],'刑法メモ');
  assert.equal(Object.keys(JSON.parse(secondLocal.getItem(historyKey))).length,2);
  assert.equal(Object.keys(JSON.parse(secondLocal.getItem(reviewKey))).length,2);
  assert.equal(JSON.parse(secondLocal.getItem(manualKey)).length,2);
  assert.equal((await a.api.sync()).state,'success');
  assert.equal(JSON.parse(firstLocal.getItem(manualKey)).length,2);
});

test('different fields on the same manual card merge, but concurrent FSRS state changes do not',async()=>{
  const db={}, manual=[{id:'card',front:'表',back:'裏',createdAt:1,updatedAt:1}];
  const first=storage({[manualKey]:JSON.stringify(manual),[reviewKey]:JSON.stringify({card:{reviews:[],due:0}})});
  const second=storage();
  const a=createEnv(db,first), b=createEnv(db,second);
  await a.api.sync(); await b.api.sync();
  first.setItem(manualKey,JSON.stringify([{...manual[0],front:'表を変更',updatedAt:2}]));
  second.setItem(manualKey,JSON.stringify([{...manual[0],back:'裏を変更',updatedAt:3}]));
  assert.equal((await a.api.sync()).state,'success');
  assert.equal((await b.api.sync()).state,'success');
  assert.deepEqual(JSON.parse(second.getItem(manualKey))[0],{...manual[0],front:'表を変更',back:'裏を変更',updatedAt:3});
  first.setItem(reviewKey,JSON.stringify({card:{reviews:[{at:10,grade:3}],due:10}}));
  second.setItem(reviewKey,JSON.stringify({card:{reviews:[{at:11,grade:1}],due:12}}));
  assert.equal((await a.api.sync()).state,'success');
  assert.equal((await b.api.sync()).reason,'local-conflict');
  assert.equal(JSON.parse(second.getItem(reviewKey)).card.reviews[0].at,11);
});

test('delete-versus-edit conflicts only on the same note, and neither side is destroyed',async()=>{
  const db={}, first=storage({[noteKey]:JSON.stringify({'civil-general:１条':'元のメモ'})}), second=storage();
  const a=createEnv(db,first), b=createEnv(db,second);
  await a.api.sync(); await b.api.sync();
  first.setItem(noteKey,'{}');
  second.setItem(noteKey,JSON.stringify({'civil-general:１条':'書き直したメモ'}));
  assert.equal((await a.api.sync()).state,'success');
  const result=await b.api.sync();
  assert.equal(result.reason,'local-conflict');
  assert.equal(JSON.parse(second.getItem(noteKey))['civil-general:１条'],'書き直したメモ');
});

test('a CAS retry merges a remote change made between the fetch and upload',async()=>{
  const db={},first=storage(),second=storage();
  const a=createEnv(db,first),b=createEnv(db,second);
  await a.api.sync();await b.api.sync();
  first.setItem(noteKey,JSON.stringify({'civil-general:１条':'A'}));
  second.setItem(noteKey,JSON.stringify({'criminal-special:１９９条':'B'}));
  db.beforePatch=async()=>{assert.equal((await a.api.sync()).state,'success');};
  const result=await b.api.sync();
  assert.equal(result.state,'success');
  assert.equal(db.row.revision,3);
  assert.deepEqual(JSON.parse(second.getItem(noteKey)),{'civil-general:１条':'A','criminal-special:１９９条':'B'});
});

test('an edit during a pending upload stays local and is synced in the following pass',async()=>{
  const db={},local=storage(), a=createEnv(db,local);
  await a.api.sync();
  local.setItem(noteKey,JSON.stringify({'civil-general:１条':'A'}));
  db.beforePatch=async()=>{
    local.setItem(noteKey,JSON.stringify({'civil-general:１条':'A','criminal-special:１９９条':'B'}));
  };
  assert.equal((await a.api.sync()).state,'success');
  assert.deepEqual(JSON.parse(local.getItem(noteKey)),{'civil-general:１条':'A','criminal-special:１９９条':'B'});
  assert.equal((await a.api.sync()).state,'success');
  const remote=storage(), b=createEnv(db,remote);
  assert.equal((await b.api.sync()).state,'success');
  assert.deepEqual(JSON.parse(remote.getItem(noteKey)),{'civil-general:１条':'A','criminal-special:１９９条':'B'});
});


test('choosing cloud for a truly conflicting definition preserves unrelated local notes',async()=>{
  const db={}, base=definition('civil-general','９４条',0,'元の定義');
  const first=storage({[definitionKey]:JSON.stringify([base])}), second=storage();
  const a=createEnv(db,first), b=createEnv(db,second);
  await a.api.sync(); await b.api.sync();
  first.setItem(definitionKey,JSON.stringify([{...base,definition:'クラウド側の定義'}]));
  second.setItem(definitionKey,JSON.stringify([{...base,definition:'端末側の定義'}]));
  second.setItem(noteKey,JSON.stringify({'criminal-special:１９９条':'競合しないメモ'}));
  assert.equal((await a.api.sync()).state,'success');
  const deferred=await b.api.sync();
  assert.equal(deferred.reason,'local-conflict');
  assert.ok(deferred.conflictPaths?.length);
  assert.equal((await b.api.resolveConflict('cloud')).state,'success');
  assert.equal(JSON.parse(second.getItem(definitionKey))[0].definition,'クラウド側の定義');
  assert.equal(JSON.parse(second.getItem(noteKey))['criminal-special:１９９条'],'競合しないメモ');
  const newDevice=storage(), c=createEnv(db,newDevice);
  assert.equal((await c.api.sync()).state,'success');
  assert.equal(JSON.parse(newDevice.getItem(noteKey))['criminal-special:１９９条'],'競合しないメモ');
});

test('a populated new device without an ancestor is distinct from an item-level conflict',async()=>{
  const db={}, first=createEnv(db,storage({[noteKey]:JSON.stringify({'civil-general:１条':'cloud'})}));
  await first.api.sync();
  const secondStorage=storage({[noteKey]:JSON.stringify({'criminal-special:１９９条':'local'})});
  const second=createEnv(db,secondStorage);
  assert.equal((await second.api.sync()).reason,'unknown-ancestor');
  assert.equal(JSON.parse(secondStorage.getItem(noteKey))['criminal-special:１９９条'],'local');
});
