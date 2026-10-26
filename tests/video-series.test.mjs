import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../video-data.js';

const item = (id, seriesId = null, extra = {}) => data.normalizeVideo({
  id, seriesId, title: 'Video ' + id, addedAt: 100, ...extra,
});

test('unnamed series survives video normalization without introducing a series name or folder', () => {
  const old = item('old');
  assert.equal(old.seriesId, null);
  assert.equal(old.folderId, null);
  const grouped = item('new', 'vs-123', { folderId: 'folder-1' });
  assert.equal(grouped.seriesId, 'vs-123');
  assert.equal(grouped.folderId, 'folder-1');
  assert.equal(Object.hasOwn(grouped, 'seriesName'), false);
});

test('series form one box at the position of the first member and keep all original entries', () => {
  const ordered = [item('a'), item('b', 'vs-1'), item('c'), item('d', 'vs-1'), item('e', 'vs-2'), item('f', 'vs-2')];
  const boxes = data.groupVideosBySeries(ordered);
  assert.deepEqual(boxes.map(box => box.kind === 'series' ? box.id : box.video.id), ['a','vs-1','c','vs-2']);
  assert.deepEqual(boxes[1].videos.map(v => v.id), ['b','d']);
  assert.deepEqual(boxes[3].videos.map(v => v.id), ['e','f']);
});

test('single filtered member displays as a video without revealing other hidden or filtered members', () => {
  const filtered = data.filterVideos([item('normal','vs-1'), item('hidden','vs-1',{hidden:true})], {});
  const boxes = data.groupVideosBySeries(filtered);
  assert.deepEqual(boxes.map(box => box.video.id), ['normal']);
  assert.equal(boxes[0].kind, 'video');
});

test('multiple existing videos form an unnamed series and a single selection is rejected', () => {
  const videos = [item('a'),item('b'),item('c')];
  const invalid = data.planSeriesChanges(videos,['a'],'group',()=> 'vs-id');
  assert.equal(invalid.error,'minimum');
  const result = data.planSeriesChanges(videos,['a','b'],'group',()=> 'vs-id');
  assert.deepEqual(result.changes, { a: 'vs-id', b: 'vs-id' });
  assert.equal(result.seriesId, 'vs-id');
  assert.deepEqual(videos.map(v=>v.seriesId), [null,null,null], 'planning must not mutate input');
});

test('adding a video to an existing series keeps the existing shared id', () => {
  const videos=[item('a','vs-1'),item('b','vs-1'),item('c')];
  const plan=data.planSeriesChanges(videos,['b','c'],'group',()=> 'vs-new');
  assert.equal(plan.seriesId,'vs-1');
  assert.deepEqual(plan.changes,{c:'vs-1'});
});

test('combining members from different series rejects ambiguous updates', () => {
  const plan=data.planSeriesChanges([item('a','vs-1'),item('b','vs-2')],['a','b'],'group',()=> 'vs-new');
  assert.equal(plan.error,'multiple');
  assert.deepEqual(plan.changes,{});
});

test('removing a member dissolves a series when one member would remain', () => {
  const videos=[item('a','vs-1'),item('b','vs-1'),item('c','vs-2'),item('d','vs-2'),item('e','vs-2')];
  const plan=data.planSeriesChanges(videos,['a','c'],'remove');
  assert.deepEqual(plan.changes,{a:null,b:null,c:null});
  assert.deepEqual(data.groupVideosBySeries(videos).filter(v=>v.kind==='series').map(v=>v.id),['vs-1','vs-2']);
});

test('removing every member of a series does not delete the videos', () => {
  const videos=[item('a','vs-1'),item('b','vs-1')];
  const plan=data.planSeriesChanges(videos,['a','b'],'remove');
  const detached=videos.map(v=>data.normalizeVideo({...v,seriesId:Object.hasOwn(plan.changes,v.id)?plan.changes[v.id]:v.seriesId}));
  assert.deepEqual(data.groupVideosBySeries(detached).map(box=>box.video.id),['a','b']);
});

test('unknown selected ids are rejected to avoid partially writing a stale selection', () => {
  const plan=data.planSeriesChanges([item('a'),item('b')],['a','missing'],'group',()=> 'vs-new');
  assert.equal(plan.error,'selection');
});
