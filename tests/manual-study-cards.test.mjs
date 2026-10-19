import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const manual=require('../manual-study-cards.js');
const legal=require('../statutes-definition-store.js');
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function storage() {
  const map=new Map();
  return {
    getItem:k=>map.get(k)??null,
    setItem:(k,v)=>map.set(k,String(v)),
    removeItem:k=>map.delete(k),
    raw:()=>map,
  };
}
test('manual card CRUD preserves identity and normalizes input',()=>{
 const s=storage();
 const created=manual.insert({front:'  民法の意思表示とは？  ',back:'  効果意思の表示 ',category:' 民法 '},s,()=> 'stable-1');
 assert.equal(created.front,'民法の意思表示とは？');
 assert.equal(created.back,'効果意思の表示');
 assert.equal(created.category,'民法');
 assert.equal(manual.reviewId(created.id),'manual:stable-1');
 assert.deepEqual(manual.load(s),[created]);
 const updated=manual.update(created.id,{front:'変更後',back:'解答２',category:'民法'},s);
 assert.equal(updated.id,created.id);
 assert.equal(updated.createdAt,created.createdAt);
 assert.equal(manual.load(s)[0].front,'変更後');
 manual.remove(created.id,s);
 assert.deepEqual(manual.load(s),[]);
});
test('manual card validation never overwrites good data on invalid input',()=>{
 const s=storage();
 manual.insert({front:'問題',back:'解答'},s,()=> 'stable-2');
 const original=s.getItem(manual.STORAGE_KEY);
 assert.throws(()=>manual.insert({front:' ',back:'解答'},s),/問題と解答/);
 assert.throws(()=>manual.update('stable-2',{front:'問題',back:''},s),/問題と解答/);
 assert.throws(()=>manual.insert({front:'a'.repeat(3001),back:'解答'},s),/上限/);
 assert.throws(()=>manual.remove('absent',s),/見つかりません/);
 assert.equal(s.getItem(manual.STORAGE_KEY),original);
});
test('manual card records are isolated from statute-derived definitions',()=>{
 const s=storage();
 manual.insert({front:'要件を説明せよ',back:'答案'},s,()=> 'one');
 assert.deepEqual(legal.loadDefinitions(s),[]);
 const data=[{subject:'civil-general',article:'１条',part:0,start:0,end:2,quote:'私権',definition:'権利'}];
 s.setItem(legal.STORAGE_KEY,JSON.stringify(data));
 assert.equal(legal.loadDefinitions(s).length,1);
 assert.equal(manual.load(s).length,1);
});
test('duplicate IDs, unsafe and blank stored entries are ignored',()=>{
 const s=storage();
 s.setItem(manual.STORAGE_KEY,JSON.stringify([
  {id:'one',front:' A ',back:' B '},
  {id:'one',front:'second',back:'answer'},
  {id:'bad',front:'',back:'x'},
  {id:'invalid',front:'x',back:'y'.repeat(12001)}
 ]));
 assert.deepEqual(manual.load(s).map(x=>x.id),['one']);
});
test('manual card editor, FSRS queue and encrypted independent vault are wired',()=>{
 const page=read('definition-cards.html'),ui=read('definition-cards.js'),vault=read('statutes-vault.js');
 assert.match(page,/id="definitionCardsManualForm"/);
 assert.match(page,/id="definitionCardsManualFront"/);
 assert.match(page,/id="definitionCardsManualBack"/);
 assert.match(page,/manual-study-cards\.js/);
 assert.match(ui,/manualStore\.load\(\)\.map\(asStudyCard\)/);
 assert.match(ui,/manualStore\.reviewId\(entry\.manualId\)/);
 assert.match(ui,/manualStore\.insert\(input\)/);
 assert.match(ui,/manualStore\.update\(editingManualId,input\)/);
 assert.match(ui,/window\.StatutesVault\?\.changed/);
 assert.match(vault,/testCode\.statutes\.manualCards\.v1/);
 assert.match(read('vault-payload.js'),/testCode\.statutes\.manualCards\.v1/);
});
