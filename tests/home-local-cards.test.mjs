import test from 'node:test';
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
