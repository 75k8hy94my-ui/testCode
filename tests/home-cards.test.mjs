import test from 'node:test';
import assert from 'node:assert/strict';
import Cards from '../home-cards.js';

const host=()=>({textContent:''});
test('registry preserves registration order and rejects duplicate types',()=>{
  const r=Cards.createRegistry();
  r.register({type:'a',title:'A',allowedSizes:['small'],render(){}});
  r.register({type:'b',title:'B',allowedSizes:['medium'],render(){}});
  assert.deepEqual(r.list().map(x=>x.type),['a','b']);
  assert.throws(()=>r.register({type:'a',title:'Again',allowedSizes:['small'],render(){}}),/既に登録/);
});

test('missing and failing renderers stay contained in their host',async()=>{
  const r=Cards.createRegistry(),missing=host(),broken=host();
  await r.render({instance:{type:'missing'},host:missing,context:{}});
  assert.equal(missing.textContent,'このカードは現在利用できません');
  r.register({type:'bad',title:'Bad',allowedSizes:['small'],render(){throw new Error('boom')}});
  await assert.doesNotReject(()=>r.render({instance:{type:'bad'},host:broken,context:{}}));
  assert.equal(broken.textContent,'カードを読み込めませんでした');
});

test('settings hook receives updateSettings and missing settings has a stable message',async()=>{
  const r=Cards.createRegistry(),calls=[],settingsHost=host(),plainHost=host();
  r.register({type:'config',title:'Config',allowedSizes:['small'],render(){},renderSettings({updateSettings}){updateSettings({city:'Tokyo'});}});
  r.register({type:'plain',title:'Plain',allowedSizes:['small'],render(){}});
  await r.renderSettings({instance:{type:'config'},host:settingsHost,context:{},updateSettings:(v)=>calls.push(v)});
  assert.deepEqual(calls,[{city:'Tokyo'}]);
  await r.renderSettings({instance:{type:'plain'},host:plainHost,context:{},updateSettings(){}});
  assert.equal(plainHost.textContent,'このカードに設定項目はありません');
});
