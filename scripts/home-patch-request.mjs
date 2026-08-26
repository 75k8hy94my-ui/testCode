import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
const run = (args, expectSuccess = true) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  const ok = result.status === 0;
  if (ok !== expectSuccess) throw new Error(`Unexpected test result (${args.join(' ')}): status=${result.status}`);
};
const replaceOnce = (path, from, to) => {
  const source = read(path);
  if (source.includes(to)) return;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Pattern not found in ${path}: ${from.slice(0, 100)}`);
  write(path, source.slice(0, index) + to + source.slice(index + from.length));
};

// RED 1: lock the Home layout contract before implementation.
write('tests/home-layout.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import HomeLayout from '../home-layout.js';

const types = (home, profile) => home.layouts[profile].cards.map((card) => card.type);

test('home defaults create independent mobile tablet and desktop profiles', () => {
  const home = HomeLayout.createDefaultHome();
  assert.deepEqual(Object.keys(home.layouts), ['mobile', 'tablet', 'desktop']);
  assert.deepEqual(types(home, 'mobile'), ['continue', 'today-study', 'apps']);
  assert.notEqual(home.layouts.mobile.cards, home.layouts.tablet.cards);
});

test('editing one profile does not mutate other profiles or input', () => {
  const before = HomeLayout.createDefaultHome();
  const after = HomeLayout.moveCard(before, 'mobile', 'apps', 0);
  assert.equal(after.layouts.mobile.cards[0].id, 'apps');
  assert.deepEqual(after.layouts.tablet, before.layouts.tablet);
  assert.deepEqual(before, HomeLayout.createDefaultHome());
});

test('settings and size are profile-local and an explicit empty profile stays empty', () => {
  const before = HomeLayout.createDefaultHome();
  const changed = HomeLayout.updateCardSettings(
    HomeLayout.resizeCard(before, 'tablet', 'continue', 'large'),
    'tablet', 'continue', { sample: true }
  );
  assert.equal(changed.layouts.tablet.cards.find((x) => x.id === 'continue').size, 'large');
  assert.deepEqual(changed.layouts.tablet.cards.find((x) => x.id === 'continue').settings, { sample: true });
  assert.deepEqual(changed.layouts.mobile, before.layouts.mobile);
  const empty = HomeLayout.normalizeHome({ version: 1, layouts: { mobile: { cards: [] } } });
  assert.deepEqual(empty.layouts.mobile.cards, []);
});

test('profile override wins over automatic classification', () => {
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: 'desktop' }), 'desktop');
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: null }), 'mobile');
  assert.equal(HomeLayout.resolveProfile({ width: 820, maxTouchPoints: 5, override: null }), 'tablet');
  assert.equal(HomeLayout.resolveProfile({ width: 1440, maxTouchPoints: 0, override: null }), 'desktop');
});

test('add remove move resize and reset keep normalized independent state', () => {
  let home = HomeLayout.createDefaultHome();
  home = HomeLayout.addCard(home, 'mobile', { id: 'weather', type: 'weather', size: 'small', settings: { city: 'Tokyo' } });
  assert.equal(home.layouts.mobile.cards.at(-1).type, 'weather');
  home = HomeLayout.resizeCard(home, 'mobile', 'weather', 'large');
  assert.equal(home.layouts.mobile.cards.at(-1).size, 'large');
  home = HomeLayout.removeCard(home, 'mobile', 'weather');
  assert.equal(home.layouts.mobile.cards.some((x) => x.id === 'weather'), false);
  home = HomeLayout.resetProfile(HomeLayout.moveCard(home, 'mobile', 'apps', 0), 'mobile');
  assert.deepEqual(types(home, 'mobile'), ['continue', 'today-study', 'apps']);
});
`);
if (!fs.existsSync('home-layout.js')) run(['--test', 'tests/home-layout.test.mjs'], false);

// GREEN 1: pure Home state module.
write('home-layout.js', `(()=>{
'use strict';
const PROFILE_NAMES=['mobile','tablet','desktop'];
const PROFILE_OVERRIDE_KEY='mangaReaderHomeDeviceProfileOverride';
const SIZE_NAMES=['small','medium','large'];
const DEFAULT_CARDS={
  mobile:[{id:'continue',type:'continue',size:'medium',settings:{}},{id:'today-study',type:'today-study',size:'medium',settings:{}},{id:'apps',type:'apps',size:'medium',settings:{}}],
  tablet:[{id:'continue',type:'continue',size:'large',settings:{}},{id:'today-study',type:'today-study',size:'medium',settings:{}},{id:'apps',type:'apps',size:'medium',settings:{}}],
  desktop:[{id:'apps',type:'apps',size:'medium',settings:{}},{id:'continue',type:'continue',size:'medium',settings:{}},{id:'today-study',type:'today-study',size:'medium',settings:{}}]
};
const isObject=(value)=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clone=(value)=>JSON.parse(JSON.stringify(value));
const profileName=(value)=>PROFILE_NAMES.includes(value)?value:null;
function normalizeCard(value){
  if(!isObject(value))return null;
  const id=String(value.id||'').trim(),type=String(value.type||'').trim();
  if(!id||!type)return null;
  return{id,type,size:SIZE_NAMES.includes(value.size)?value.size:'medium',settings:isObject(value.settings)?clone(value.settings):{}};
}
function defaultProfile(name){return{cards:clone(DEFAULT_CARDS[name])};}
function createDefaultHome(){return{version:1,layouts:Object.fromEntries(PROFILE_NAMES.map((name)=>[name,defaultProfile(name)]))};}
function normalizeHome(value){
  const source=isObject(value)?value:{},layouts=isObject(source.layouts)?source.layouts:{};
  const result={version:1,layouts:{}};
  for(const name of PROFILE_NAMES){
    const raw=isObject(layouts[name])?layouts[name]:null;
    if(!raw||!Array.isArray(raw.cards)){result.layouts[name]=defaultProfile(name);continue;}
    const seen=new Set(),cards=[];
    for(const item of raw.cards){const card=normalizeCard(item);if(!card||seen.has(card.id))continue;seen.add(card.id);cards.push(card);}
    result.layouts[name]={cards};
  }
  return result;
}
function assertProfile(name){if(!profileName(name))throw new Error('不明なHomeレイアウトです。');return name;}
function edit(home,name,fn){name=assertProfile(name);const next=normalizeHome(home);next.layouts[name]={cards:fn(next.layouts[name].cards.map(clone))};return normalizeHome(next);}
function addCard(home,name,instance){const card=normalizeCard(instance);if(!card)throw new Error('カード設定が正しくありません。');return edit(home,name,(cards)=>{if(cards.some((x)=>x.id===card.id))throw new Error('同じカードが既にあります。');cards.push(card);return cards;});}
function removeCard(home,name,id){return edit(home,name,(cards)=>cards.filter((x)=>x.id!==id));}
function moveCard(home,name,id,toIndex){return edit(home,name,(cards)=>{const index=cards.findIndex((x)=>x.id===id);if(index<0)return cards;const [card]=cards.splice(index,1);const target=Math.max(0,Math.min(cards.length,Number(toIndex)||0));cards.splice(target,0,card);return cards;});}
function resizeCard(home,name,id,size){if(!SIZE_NAMES.includes(size))throw new Error('不明なカードサイズです。');return edit(home,name,(cards)=>cards.map((x)=>x.id===id?{...x,size}:x));}
function updateCardSettings(home,name,id,settings){if(!isObject(settings))throw new Error('カード設定が正しくありません。');return edit(home,name,(cards)=>cards.map((x)=>x.id===id?{...x,settings:clone(settings)}:x));}
function resetProfile(home,name){name=assertProfile(name);const next=normalizeHome(home);next.layouts[name]=defaultProfile(name);return normalizeHome(next);}
function selectProfile({width,maxTouchPoints}={}){const w=Number(width)||0,touch=Number(maxTouchPoints)>0;if(w<=600)return'mobile';if(touch&&w<=1100)return'tablet';return'desktop';}
function resolveProfile({width,maxTouchPoints,override}={}){return profileName(override)||selectProfile({width,maxTouchPoints});}
const api={PROFILE_NAMES,PROFILE_OVERRIDE_KEY,SIZE_NAMES,createDefaultHome,normalizeHome,selectProfile,resolveProfile,addCard,removeCard,moveCard,resizeCard,updateCardSettings,resetProfile};
if(typeof window!=='undefined')window.MangaHomeLayout=api;
if(typeof module!=='undefined')module.exports=api;
})();
`);
run(['--test','tests/home-layout.test.mjs'], true);

// RED 2: payload/backup must preserve Home before production code is changed.
write('tests/vault-payload.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import HomeLayout from '../home-layout.js';
import payload from '../vault-payload.js';
const { DATA_KEYS, normalize, buildFromLocalStorage: buildFromStorage, applyToLocalStorage: applyToStorage } = payload;

const emptyStudy={schemaVersion:1,subjects:[{id:'constitutional-law',name:'憲法'},{id:'administrative-law',name:'行政法'},{id:'civil-law',name:'民法'},{id:'commercial-law',name:'商法'},{id:'civil-procedure',name:'民事訴訟法'},{id:'criminal-law',name:'刑法'},{id:'criminal-procedure',name:'刑事訴訟法'},{id:'labor-law',name:'労働法'}],genres:[],definitions:[],recentAttempts:[],progress:{},pendingGradings:[],pendingSyncOps:[],appliedOperationIds:[],gamification:{xp:0,streak:0,lastStudyDate:null},preferences:{autoSpeak:false}};

test('legacy payload gains default Home',()=>{
  const value=normalize({folders:[{id:'f1'}],items:[{id:'i1'}]});
  assert.deepEqual(value.home,HomeLayout.createDefaultHome());
  assert.deepEqual(value.study,emptyStudy);
});

test('build and apply preserve custom Home and every vault field',()=>{
  const study=structuredClone(emptyStudy);study.preferences.autoSpeak=true;
  const home=HomeLayout.moveCard(HomeLayout.createDefaultHome(),'mobile','apps',0);
  const input={folders:[{id:'f1'}],items:[{id:'i1'}],videos:[{id:'v1'}],authorCards:[{id:'a1',name:'作者'}],mangaInfo:{a:{count:10}},toc:{a:[{page:1}]},lastPages:{a:{page:3}},theme:'light',dashboardVisibility:{mobile:{continue:true,'recent-added':false,'recent-read':false,unread:false,random:false,favorites:false},desktop:{continue:false,'recent-added':false,'recent-read':false,unread:false,random:true,favorites:false}},study,home};
  const storage=new Map();applyToStorage(input,storage);assert.deepEqual(buildFromStorage(storage),input);
  assert.equal(DATA_KEYS.home,'mangaReaderHome');
});

test('clearDeviceData removes Home and study data',()=>{
  const storage=new Map([['mangaReaderStudy',JSON.stringify(emptyStudy)],['mangaReaderHome','{}'],['mangaReaderSavedFolders','[]']]);
  payload.clearDeviceData(storage);assert.equal(storage.has('mangaReaderStudy'),false);assert.equal(storage.has('mangaReaderHome'),false);assert.equal(storage.has('mangaReaderSavedFolders'),false);
});

test('apply rolls back all device keys when storage fails partway through',()=>{
  const values=new Map([['mangaReaderSavedFolders',JSON.stringify([{id:'old-folder'}])],['mangaReaderSavedItems',JSON.stringify([{id:'old-item'}])]]);let writes=0;
  const storage={getItem(key){return values.get(key)??null},setItem(key,value){writes+=1;if(writes===2)throw new Error('quota');values.set(key,value)},removeItem(key){values.delete(key)}};
  assert.throws(()=>payload.applyToLocalStorage({folders:[{id:'new-folder'}],items:[{id:'new-item'}]},storage),/quota/);
  assert.deepEqual(JSON.parse(values.get('mangaReaderSavedFolders')),[{id:'old-folder'}]);assert.deepEqual(JSON.parse(values.get('mangaReaderSavedItems')),[{id:'old-item'}]);
});
`);
write('tests/backup-format.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import HomeLayout from '../home-layout.js';
import backup from '../backup-format.js';
const { createBackup, migrateBackup }=backup;

const emptyStudy={schemaVersion:1,subjects:[{id:'constitutional-law',name:'憲法'},{id:'administrative-law',name:'行政法'},{id:'civil-law',name:'民法'},{id:'commercial-law',name:'商法'},{id:'civil-procedure',name:'民事訴訟法'},{id:'criminal-law',name:'刑法'},{id:'criminal-procedure',name:'刑事訴訟法'},{id:'labor-law',name:'労働法'}],genres:[],definitions:[],recentAttempts:[],progress:{},pendingGradings:[],pendingSyncOps:[],appliedOperationIds:[],gamification:{xp:0,streak:0,lastStudyDate:null},preferences:{autoSpeak:false}};

test('versioned backup round-trips author cards and supplies empty study and Home',()=>{
  const data={folders:[{id:'f'}],items:[],authorCards:[{id:'a',name:'作者'}],theme:'light'};
  const result=createBackup(data,'2026-08-22T00:00:00.000Z');const migrated=migrateBackup(result);
  assert.deepEqual(migrated.folders,data.folders);assert.deepEqual(migrated.authorCards,data.authorCards);assert.deepEqual(migrated.study,emptyStudy);assert.deepEqual(migrated.home,HomeLayout.createDefaultHome());
});

test('backup v2 preserves study and Home and legacy v2 supplies defaults',()=>{
  const home=HomeLayout.moveCard(HomeLayout.createDefaultHome(),'mobile','apps',0);
  const result=createBackup({study:{preferences:{autoSpeak:true}},home},'2026-08-26T00:00:00Z');
  assert.equal(result.data.study.preferences.autoSpeak,true);assert.deepEqual(result.data.home,home);
  const legacy=migrateBackup({format:'manga-reader-backup',version:2,exportedAt:'2026-08-25T00:00:00Z',data:{}});
  assert.deepEqual(legacy.study,emptyStudy);assert.deepEqual(legacy.home,HomeLayout.createDefaultHome());
});

test('legacy raw payload migrates and future versions are rejected',()=>{
  assert.deepEqual(migrateBackup({folders:[],items:[]}).authorCards,[]);assert.deepEqual(migrateBackup({folders:[],items:[]}).home,HomeLayout.createDefaultHome());
  assert.throws(()=>migrateBackup({format:'manga-reader-backup',version:99,data:{}}));
});

test('backup and vault payload browser scripts can load together',()=>{
  const context=vm.createContext({window:{},console});
  vm.runInContext(fs.readFileSync(new URL('../home-layout.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../vault-payload.js',import.meta.url),'utf8'),context);
  vm.runInContext(fs.readFileSync(new URL('../backup-format.js',import.meta.url),'utf8'),context);
  assert.equal(typeof context.window.MangaVaultPayload.normalize,'function');assert.equal(typeof context.window.MangaReaderBackup.createBackup,'function');
});
`);
run(['--test','tests/backup-format.test.mjs','tests/vault-payload.test.mjs'], false);

// GREEN 2: wire Home into encrypted local payload and backups.
let vault=read('vault-payload.js');
if(!vault.includes('const HomeLayoutRef='))vault=`const HomeLayoutRef=typeof module!=='undefined'&&module.exports?require('./home-layout.js'):(typeof window!=='undefined'?window.MangaHomeLayout:null);\nif(!HomeLayoutRef)throw new Error('Home layout module is required before vault-payload.js');\n${vault}`;
vault=vault.replace("  study: 'mangaReaderStudy'\n};","  study: 'mangaReaderStudy', home: 'mangaReaderHome'\n};");
vault=vault.replace("study: createEmptyStudy() };","study: createEmptyStudy(), home: HomeLayoutRef.createDefaultHome() };");
vault=vault.replace("study: normalizeStudyForVault(x.study) };","study: normalizeStudyForVault(x.study), home: HomeLayoutRef.normalizeHome(x.home) };");
vault=vault.replace("study: read(storage, DATA_KEYS.study, {}) });","study: read(storage, DATA_KEYS.study, {}), home: read(storage, DATA_KEYS.home, {}) });");
write('vault-payload.js',vault);

let backupSource=read('backup-format.js');
if(!backupSource.includes('const HomeLayoutRef='))backupSource=`const HomeLayoutRef=typeof module!=='undefined'&&module.exports?require('./home-layout.js'):(typeof window!=='undefined'?window.MangaHomeLayout:null);\nif(!HomeLayoutRef)throw new Error('Home layout module is required before backup-format.js');\n${backupSource}`;
backupSource=backupSource.replace("study: normalizeBackupStudy(x.study) };","study: normalizeBackupStudy(x.study), home: HomeLayoutRef.normalizeHome(x.home) };");
write('backup-format.js',backupSource);

for(const path of ['sync.html','reader.html','study.html']){
  let source=read(path);
  if(!source.includes('home-layout.js'))source=source.replace('<script src="vault-payload.js"></script>','<script src="home-layout.js"></script>\n<script src="vault-payload.js"></script>');
  write(path,source);
}
let regression=read('tests/static-regression.test.mjs');
if(!regression.includes('Home layout loads before vault payload'))regression+=`\n\ntest('Home layout loads before vault payload on existing protected pages', () => {\n  for (const page of ['sync.html', 'reader.html', 'study.html']) {\n    const source = read(page);\n    assert.ok(source.indexOf('home-layout.js') >= 0, page + ' should load home-layout.js');\n    assert.ok(source.indexOf('home-layout.js') < source.indexOf('vault-payload.js'), page + ' must load Home layout first');\n  }\n});\n`;
write('tests/static-regression.test.mjs',regression);
run(['--test','tests/home-layout.test.mjs','tests/backup-format.test.mjs','tests/vault-payload.test.mjs','tests/static-regression.test.mjs'], true);
console.log('Task 1 red/green complete');
