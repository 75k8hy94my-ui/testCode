import test from 'node:test';
import assert from 'node:assert/strict';

let Backup = {};
try { Backup = (await import('../legal-index-backup.js')).default || {}; } catch (_) {}
const master = new Uint8Array(32).fill(7);
const portable = { schemaVersion:1, book:{title:'基本民法',authors:[],subjects:['民法']}, matterEntries:[{term:'錯誤',pages:['20']}], caseEntries:[], statuteEntries:[] };

test('exports only active decrypted index-book plaintext in portable one-book format', async () => {
  assert.equal(typeof Backup.exportBooks, 'function');
  const cache = { async list(){ return [{chunkId:'a',revision:2,deletedAt:null,payload:{cipher:'a'}},{chunkId:'b',revision:3,deletedAt:'2026-09-04',payload:{cipher:'b'}}]; } };
  const chunkCrypto = { async decryptChunk(_master,id){ return id==='a' ? {type:'index-book',version:1,bookId:'book-a',chunkId:'a',...portable} : null; } };
  const schema = { normalizeBook(value){ return {schemaVersion:value.schemaVersion,book:value.book,matterEntries:value.matterEntries,caseEntries:value.caseEntries,statuteEntries:value.statuteEntries}; } };
  assert.deepEqual(await Backup.exportBooks(master,{cache,chunkCrypto,schema}),[portable]);
});

test('restore validates every book before writing valid books as new encrypted pending chunks', async () => {
  assert.equal(typeof Backup.restoreBooks, 'function');
  const writes=[];
  const cache={async put(row){writes.push(row);}};
  const schema={
    validateBookFile(value,{fileName}){ return value.book?.title ? {ok:true,book:value} : {ok:false,error:`${fileName}: invalid`}; },
    createIndexBookChunk(book,{bookId,chunkId}){return {type:'index-book',version:1,bookId,chunkId,...book};}
  };
  const chunkCrypto={async encryptChunk(_master,chunkId,value){return {type:'enc',chunkId,title:value.book.title};}};
  let n=0; const idFactory=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
  const result=await Backup.restoreBooks(master,[portable,{schemaVersion:1,book:{title:'',subjects:[]}}],{cache,chunkCrypto,schema,idFactory,syncAfter:false});
  assert.equal(result.restored,1);
  assert.equal(result.failures.length,1);
  assert.equal(writes.length,1);
  assert.equal(writes[0].pendingAction,'insert');
  assert.equal(writes[0].revision,0);
  assert.equal(writes[0].payload.type,'enc');
  assert.equal('book' in writes[0],false);
});
