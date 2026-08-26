import test from 'node:test';
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
