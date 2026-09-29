import test from 'node:test';
import assert from 'node:assert/strict';
import library from '../game/library-reading.js';

test('the authored catalog is immutable and maps titles to established life skills', () => {
  assert.deepEqual(library.BOOKS.map(({id,title,skill,skillGain,completionFun}) => ({id,title,skill,skillGain,completionFun})), [
    {id:'wakaba-kitchen-basics',title:'はじめての家庭料理',skill:'cooking',skillGain:3,completionFun:0},
    {id:'home-sewing',title:'暮らしの手芸',skill:'craft',skillGain:3,completionFun:0},
    {id:'gentle-walking',title:'やさしい健康ウォーキング',skill:'exercise',skillGain:3,completionFun:0},
    {id:'rainy-platform',title:'雨の停留所',skill:null,skillGain:0,completionFun:12}
  ]);
  assert.ok(Object.isFrozen(library.BOOKS));
  assert.ok(library.BOOKS.every(Object.isFrozen));
});

test('new, legacy and malformed shelves normalize to unique known loans and completion records', () => {
  assert.deepEqual(library.createProgress(),{loans:[],completedBookIds:[]});
  assert.deepEqual(library.normalizeProgress({loans:[
    {bookId:'home-sewing',chaptersRead:2.8},{bookId:'home-sewing',chaptersRead:1},
    {bookId:'unknown',chaptersRead:2},{bookId:'gentle-walking',chaptersRead:-3},
    {bookId:'rainy-platform',chaptersRead:9},{bookId:'wakaba-kitchen-basics',chaptersRead:1}
  ],completedBookIds:['home-sewing','unknown','home-sewing','rainy-platform']}),{
    loans:[
      {bookId:'home-sewing',chaptersRead:0},
      {bookId:'gentle-walking',chaptersRead:0},
      {bookId:'rainy-platform',chaptersRead:0}
    ],completedBookIds:['home-sewing','rainy-platform']
  });
  assert.deepEqual(library.normalizeProgress({loans:[
    {bookId:'wakaba-kitchen-basics',chaptersRead:'2'}
  ]}),{loans:[{bookId:'wakaba-kitchen-basics',chaptersRead:0}],completedBookIds:[]});
  assert.deepEqual(library.normalizeProgress({loans:[
    {bookId:'wakaba-kitchen-basics',chaptersRead:Symbol('invalid')}
  ]}),{loans:[{bookId:'wakaba-kitchen-basics',chaptersRead:0}],completedBookIds:[]});
  assert.deepEqual(library.normalizeProgress(undefined),library.createProgress());
  assert.deepEqual(library.normalizeProgress({}),library.createProgress());
});

test('borrow limits a shelf to three distinct known titles without mutating rejected inputs', () => {
  let progress=library.createProgress();
  for (const id of ['wakaba-kitchen-basics','home-sewing','gentle-walking']) {
    const result=library.borrow(progress,id);
    assert.equal(result.ok,true);
    progress=result.progress;
  }
  const before=structuredClone(progress);
  assert.equal(library.borrow(progress,'rainy-platform').reason,'loan-limit');
  assert.equal(library.borrow(progress,'home-sewing').reason,'already-borrowed');
  assert.equal(library.borrow(progress,'invented-book').reason,'unknown-book');
  assert.deepEqual(progress,before);
});

test('each valid chapter advances one book by one chapter and the third awards its title reward once', () => {
  let progress=library.borrow(library.createProgress(),'wakaba-kitchen-basics').progress;
  for (const chapter of [1,2]) {
    const result=library.readChapter(progress,'wakaba-kitchen-basics');
    assert.deepEqual({chapter:result.chapter,chaptersRead:result.chaptersRead,bookComplete:result.bookComplete,completionReward:result.completionReward},
      {chapter,chaptersRead:chapter,bookComplete:false,completionReward:null});
    progress=result.progress;
  }
  const final=library.readChapter(progress,'wakaba-kitchen-basics');
  assert.deepEqual({chapter:final.chapter,chaptersRead:final.chaptersRead,bookComplete:final.bookComplete,completionReward:final.completionReward},
    {chapter:3,chaptersRead:3,bookComplete:true,completionReward:{skill:'cooking',skillGain:3,fun:0}});
  assert.equal(library.readChapter(final.progress,'wakaba-kitchen-basics').reason,'book-complete');
});

test('fiction completion grants fun once and re-reading a reborrowed completed title cannot farm its reward', () => {
  let progress=library.borrow(library.createProgress(),'rainy-platform').progress;
  for (let chapter=0;chapter<3;chapter+=1) progress=library.readChapter(progress,'rainy-platform').progress;
  const returned=library.returnBook(progress,'rainy-platform');
  assert.deepEqual(returned.progress,{loans:[],completedBookIds:['rainy-platform']});
  progress=library.borrow(returned.progress,'rainy-platform').progress;
  for (let chapter=0;chapter<2;chapter+=1) progress=library.readChapter(progress,'rainy-platform').progress;
  const reread=library.readChapter(progress,'rainy-platform');
  assert.equal(reread.bookComplete,true);
  assert.equal(reread.completionReward,null);
  assert.deepEqual(reread.progress.completedBookIds,['rainy-platform']);
});

test('returning an unfinished title resets its loan progress on checkout but preserves earned completions', () => {
  let progress=library.borrow(library.createProgress(),'home-sewing').progress;
  progress=library.readChapter(progress,'home-sewing').progress;
  progress=library.returnBook(progress,'home-sewing').progress;
  const reborrowed=library.borrow(progress,'home-sewing');
  assert.deepEqual(reborrowed.progress.loans,[{bookId:'home-sewing',chaptersRead:0}]);
  assert.equal(library.returnBook(progress,'home-sewing').reason,'not-borrowed');
  assert.equal(library.readChapter(progress,'home-sewing').reason,'not-borrowed');
});
