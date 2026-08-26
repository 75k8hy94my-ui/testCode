import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const read=(p)=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
const run=(args,expect=true)=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if((r.status===0)!==expect)throw new Error(`unexpected result: ${args.join(' ')} status=${r.status}`)};

// RED 1: registry lifecycle and isolation contract.
write('tests/home-cards.test.mjs',`import test from 'node:test';
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
`);
if(!fs.existsSync('home-cards.js'))run(['--test','tests/home-cards.test.mjs'],false);

// GREEN 1: code-defined registry.
write('home-cards.js',`(()=>{
'use strict';
const isHost=(host)=>!!host&&typeof host==='object'&&'textContent' in host;
function createRegistry(){
  const definitions=new Map();
  function register(definition){
    if(!definition||typeof definition!=='object')throw new Error('カード定義が正しくありません。');
    const type=String(definition.type||'').trim(),title=String(definition.title||'').trim();
    if(!type||!title||!Array.isArray(definition.allowedSizes)||!definition.allowedSizes.length||typeof definition.render!=='function')throw new Error('カード定義が正しくありません。');
    if(definitions.has(type))throw new Error('このカード種類は既に登録されています。');
    definitions.set(type,{...definition,type,title,allowedSizes:definition.allowedSizes.slice()});
    return definitions.get(type);
  }
  const get=(type)=>definitions.get(String(type||''))||null;
  const list=()=>Array.from(definitions.values());
  async function render({instance,host,context}={}){
    if(!isHost(host))throw new Error('カード表示先が必要です。');
    const definition=get(instance&&instance.type);
    if(!definition){host.textContent='このカードは現在利用できません';return;}
    try{await definition.render({host,instance,context:context||{}});}catch(_){host.textContent='カードを読み込めませんでした';}
  }
  async function renderSettings({instance,host,context,updateSettings}={}){
    if(!isHost(host))throw new Error('設定表示先が必要です。');
    const definition=get(instance&&instance.type);
    if(!definition){host.textContent='このカードは現在利用できません';return;}
    if(typeof definition.renderSettings!=='function'){host.textContent='このカードに設定項目はありません';return;}
    try{await definition.renderSettings({host,instance,context:context||{},updateSettings});}catch(_){host.textContent='設定を読み込めませんでした';}
  }
  return{register,get,list,render,renderSettings};
}
const api={createRegistry};
if(typeof window!=='undefined')window.MangaHomeCards=api;
if(typeof module!=='undefined')module.exports=api;
})();
`);
run(['--test','tests/home-cards.test.mjs'],true);

// RED 2: exact local card models.
write('tests/home-local-cards.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import Cards from '../home-cards.js';
import LocalCards from '../home-local-cards.js';

test('Continue chooses latest real readable item and excludes history/local when disabled',()=>{
  const items=[
    {id:'old',title:'Old',lastReadAt:1000},
    {id:'history',title:'History',folderId:'__history__',lastReadAt:9000},
    {id:'local',title:'Local',localSync:true,lastReadAt:8000},
    {id:'latest',title:'Latest',lastReadAt:7000}
  ];
  assert.equal(LocalCards.getContinueModel({items,study:{},localReaderEnabled:false}).book.id,'latest');
  assert.equal(LocalCards.getContinueModel({items,study:{},localReaderEnabled:true}).book.id,'local');
});

test("Today's Study uses nextReviewAt and counts definitions with no progress as due",()=>{
  const study={definitions:[{id:'due'},{id:'later'},{id:'new'}],progress:{due:{nextReviewAt:1000},later:{nextReviewAt:5000}},gamification:{xp:120,streak:4,lastStudyDate:'2026-08-26'}};
  assert.deepEqual(LocalCards.getTodayStudyModel(study,3000),{dueCount:2,streak:4,xp:120,lastStudyDate:'2026-08-26'});
});

test('local cards register exactly the three core card types',()=>{
  const registry=Cards.createRegistry();
  LocalCards.registerLocalCards(registry);
  assert.deepEqual(registry.list().map(x=>x.type),['continue','apps','today-study']);
});
`);
if(!fs.existsSync('home-local-cards.js'))run(['--test','tests/home-local-cards.test.mjs'],false);

// GREEN 2: selectors + DOM renderers. All user-derived strings use textContent.
write('home-local-cards.js',`(()=>{
'use strict';
const HISTORY_FOLDER_ID='__history__';
const array=(value)=>Array.isArray(value)?value:[];
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
function getTodayStudyModel(study,now=Date.now()){
  const value=object(study),progress=object(value.progress),definitions=array(value.definitions),time=Number(now)||0;
  const dueCount=definitions.filter((definition)=>{const p=progress[definition&&definition.id];return !p||Number(p.nextReviewAt||0)<=time;}).length;
  const game=object(value.gamification);
  return{dueCount,streak:Number(game.streak)||0,xp:Number(game.xp)||0,lastStudyDate:typeof game.lastStudyDate==='string'?game.lastStudyDate:null};
}
function getContinueModel({items,study,localReaderEnabled=true}={}){
  const candidates=array(items).filter((item)=>item&&item.folderId!==HISTORY_FOLDER_ID&&!(localReaderEnabled===false&&item.localSync===true)&&(Number(item.lastReadAt)||0)>0).sort((a,b)=>(Number(b.lastReadAt)||0)-(Number(a.lastReadAt)||0));
  const hasStudy=!!(study&&typeof study==='object'&&(array(study.definitions).length||array(study.recentAttempts).length||object(study.gamification).lastStudyDate));
  return{book:candidates[0]||null,study:hasStudy?getTodayStudyModel(study,Date.now()):null};
}
function clear(host){if(typeof host.replaceChildren==='function')host.replaceChildren();else host.textContent='';}
function element(tag,text,className){const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node;}
function link(label,href){const a=element('a',label,'homeCardLink');a.href=href;return a;}
function registerLocalCards(registry){
  registry.register({type:'continue',title:'続きから',allowedSizes:['small','medium','large'],render({host,context}){
    clear(host);const model=getContinueModel({items:context.items,study:context.study,localReaderEnabled:context.localReaderEnabled});
    if(model.book){const title=String(model.book.title||'続きから読む');host.appendChild(link(title,'reader.html?item='+encodeURIComponent(String(model.book.id||''))));}
    else host.appendChild(element('p','最近読んだ本はありません','homeCardEmpty'));
    const studyModel=getTodayStudyModel(context.study,Date.now());
    const summary=element('p',\`復習 \${studyModel.dueCount}件 ・ \${studyModel.streak}日連続 ・ \${studyModel.xp} XP\`,'homeCardMeta');host.appendChild(summary);host.appendChild(link('司法試験学習を開く','study.html'));
  }});
  registry.register({type:'apps',title:'アプリ',allowedSizes:['small','medium','large'],render({host}){
    clear(host);const nav=element('nav',null,'homeAppLinks');for(const [label,href] of [['本棚','reader.html#screen=saved-list'],['司法試験学習','study.html'],['同期・保管庫','sync.html']])nav.appendChild(link(label,href));host.appendChild(nav);
  }});
  registry.register({type:'today-study',title:'今日の学習',allowedSizes:['small','medium','large'],render({host,context}){
    clear(host);const model=getTodayStudyModel(context.study,Date.now());host.appendChild(element('strong',\`復習 \${model.dueCount}件\`,'homeStudyDue'));host.appendChild(element('p',\`\${model.streak}日連続 ・ \${model.xp} XP\`,'homeCardMeta'));if(model.lastStudyDate)host.appendChild(element('p','最終学習 '+model.lastStudyDate,'homeCardMeta'));host.appendChild(link('学習を始める','study.html'));
  }});
}
const api={HISTORY_FOLDER_ID,getContinueModel,getTodayStudyModel,registerLocalCards};
if(typeof window!=='undefined')window.MangaHomeLocalCards=api;
if(typeof module!=='undefined')module.exports=api;
})();
`);
run(['--test','tests/home-cards.test.mjs','tests/home-local-cards.test.mjs'],true);

let checker=read('scripts/check-static.mjs');
if(!checker.includes("'home-cards.js'"))checker=checker.replace("'author-summary.js', 'backup-format.js'","'author-summary.js', 'backup-format.js', 'home-cards.js', 'home-local-cards.js'");
write('scripts/check-static.mjs',checker);
console.log('Home core Task 3 red/green complete');
