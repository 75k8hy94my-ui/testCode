import test from 'node:test';
import assert from 'node:assert/strict';

let Search = {};
try { Search = (await import('../legal-index-search.js')).default || {}; } catch (_) {}
const requireApi = (name) => assert.equal(typeof Search[name], 'function', `${name} should exist`);

function chunk(bookId, title, subjects, { matters = [], cases = [], statutes = [] } = {}) {
  return {
    type: 'index-book', version: 1, schemaVersion: 1, bookId, chunkId: `${bookId}-chunk`,
    book: { title, authors: [], subjects }, matterEntries: matters, caseEntries: cases, statuteEntries: statutes
  };
}

const caseA = { court:'最高裁判所', date:'1997-12-18', reporter:'民集', volume:'51', issue:'10', reportPage:'4247', citationText:'最判平成9年12月18日・民集51巻10号4247頁', pages:['10'] };
const caseSameDateOtherPage = { ...caseA, reportPage:'4248', citationText:'最判平成9年12月18日・民集51巻10号4248頁', pages:['11'] };
const caseSameDateOtherReporter = { ...caseA, reporter:'判時', volume:'1625', issue:'', reportPage:'57', citationText:'最判平成9年12月18日・判時1625号57頁', pages:['12'] };

test('normalizes legal typography, article markers, dates, and Supreme Court aliases', () => {
  requireApi('normalizeLegalText');
  requireApi('normalizeDate');
  assert.equal(Search.normalizeLegalText(' 民法第４２３条　第１項 '), Search.normalizeLegalText('民法423条1項'));
  assert.equal(Search.normalizeDate('平成9年12月18日'), '1997-12-18');
  assert.equal(Search.normalizeDate('H9.12.18'), '1997-12-18');
  assert.equal(Search.normalizeDate('1997/12/18'), '1997-12-18');
  assert.match(Search.normalizeLegalText('最判平成9年12月18日'), /最高裁判所/);
  assert.equal(Search.normalizeCompact('最高裁'), Search.normalizeCompact('最高裁判所'));
});

test('case identity is strict and never collapses same-date different citations', () => {
  requireApi('caseIdentityKey');
  assert.notEqual(Search.caseIdentityKey(caseA), Search.caseIdentityKey(caseSameDateOtherPage));
  assert.notEqual(Search.caseIdentityKey(caseA), Search.caseIdentityKey(caseSameDateOtherReporter));
  const incompleteA = { court:'最高裁判所', date:'1997-12-18', reporter:null, volume:null, issue:null, reportPage:null, citationText:'最判平成9年12月18日・判時1625号57頁' };
  const incompleteB = { ...incompleteA, citationText:'最判平成9年12月18日・判時1625号58頁' };
  assert.notEqual(Search.caseIdentityKey(incompleteA), Search.caseIdentityKey(incompleteB));
  assert.equal(Search.caseIdentityKey(incompleteA), Search.caseIdentityKey({ ...incompleteA }));
});

test('groups the same matter, statute, and identical case across books but preserves sources', () => {
  requireApi('buildIndex');
  const books = [
    chunk('a','A',['民法'],{
      matters:[{term:'債権者代位権',pages:['123']}], cases:[caseA],
      statutes:[{statute:'民法',article:'423',paragraph:null,item:null,citationText:'民法423条',pages:['205']}]
    }),
    chunk('b','B',['民法','民訴'],{
      matters:[{term:'債権者代位権',pages:['84']}], cases:[{...caseA,pages:['90']}],
      statutes:[{statute:'民法',article:'423',paragraph:null,item:null,citationText:'民法第423条',pages:['311']}]
    })
  ];
  const index = Search.buildIndex(books);
  const matter = index.find((x)=>x.kind==='matter');
  const caseResult = index.find((x)=>x.kind==='case');
  const statute = index.find((x)=>x.kind==='statute');
  assert.equal(matter.sources.length, 2);
  assert.equal(caseResult.sources.length, 2);
  assert.equal(statute.sources.length, 2);
});

test('orders exact, partial, AND, and fuzzy matches and never duplicates a logical result', () => {
  requireApi('search');
  const index = Search.buildIndex([chunk('a','A',['民法'],{ matters:[
    {term:'abc def',pages:['1']},
    {term:'xx abc def yy',pages:['2']},
    {term:'abc xx def',pages:['3']},
    {term:'abc deg',pages:['4']}
  ]})]);
  const result = Search.search(index, 'abc def', { matchModes:{ exact:true, partial:true, and:true, fuzzy:true }, kind:'all', subjectIds:[], bookIds:[] });
  assert.deepEqual(result.map((x)=>x.matchClass), ['exact','partial','and','fuzzy']);
  assert.equal(new Set(result.map((x)=>x.identityKey)).size, result.length);
});

test('each match mode can be disabled independently', () => {
  requireApi('search');
  const index = Search.buildIndex([chunk('a','A',['民法'],{ matters:[
    {term:'abc def',pages:['1']}, {term:'xx abc def yy',pages:['2']}, {term:'abc xx def',pages:['3']}, {term:'abc deg',pages:['4']}
  ]})]);
  for (const off of ['exact','partial','and','fuzzy']) {
    const modes = { exact:true, partial:true, and:true, fuzzy:true, [off]:false };
    const result = Search.search(index, 'abc def', { matchModes:modes, kind:'all', subjectIds:[], bookIds:[] });
    assert.equal(result.some((x)=>x.matchClass===off), false, `${off} should be disabled`);
  }
});

test('fuzzy matching uses conservative Damerau-Levenshtein thresholds', () => {
  requireApi('search');
  const index = Search.buildIndex([chunk('a','A',['民法'],{ matters:[
    {term:'ab',pages:['1']}, {term:'acb',pages:['2']}, {term:'abcdefg',pages:['3']}, {term:'abcdefghij',pages:['4']}
  ]})]);
  const fuzzyOnly = { exact:false, partial:false, and:false, fuzzy:true };
  assert.equal(Search.search(index,'aa',{matchModes:fuzzyOnly,kind:'all',subjectIds:[],bookIds:[]}).length,0);
  assert.equal(Search.search(index,'abc',{matchModes:fuzzyOnly,kind:'all',subjectIds:[],bookIds:[]}).some((x)=>x.display==='acb'),true);
  assert.equal(Search.search(index,'abcxefg',{matchModes:fuzzyOnly,kind:'all',subjectIds:[],bookIds:[]}).some((x)=>x.display==='abcdefg'),true);
  assert.equal(Search.search(index,'abxxefg',{matchModes:fuzzyOnly,kind:'all',subjectIds:[],bookIds:[]}).some((x)=>x.display==='abcdefg'),false);
  assert.equal(Search.search(index,'abxdxfghij',{matchModes:fuzzyOnly,kind:'all',subjectIds:[],bookIds:[]}).some((x)=>x.display==='abcdefghij'),true);
});

test('kind, subject, and book filters apply before ranking while grouped sources are filtered', () => {
  requireApi('search');
  const index = Search.buildIndex([
    chunk('a','民法A',['民法'],{ matters:[{term:'錯誤',pages:['20']}], statutes:[{statute:'民法',article:'95',paragraph:null,item:null,citationText:'民法95条',pages:['21']}] }),
    chunk('b','民訴B',['民訴'],{ matters:[{term:'錯誤',pages:['30']}] })
  ]);
  const opts = { matchModes:{exact:true,partial:true,and:true,fuzzy:true}, kind:'matter', subjectIds:['民法'], bookIds:['a'] };
  const result = Search.search(index,'錯誤',opts);
  assert.equal(result.length,1);
  assert.equal(result[0].kind,'matter');
  assert.deepEqual(result[0].sources.map((x)=>x.bookId),['a']);
});
