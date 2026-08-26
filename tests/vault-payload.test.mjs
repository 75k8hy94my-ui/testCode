import test from 'node:test';
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
