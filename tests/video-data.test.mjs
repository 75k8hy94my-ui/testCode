import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../video-data.js';

const { normalizeVideo, normalizeFolders, parseTags, filterVideos, sortVideos, removeFolder, deriveService, parseMediaTime, formatMediaTime } = data;

test('normalizes legacy video records without losing legacy playback fields', () => {
  const video = normalizeVideo({ id:'v1', a:'example', b:'123', title:'Legacy', addedAt:100 });
  assert.equal(video.id, 'v1');
  assert.equal(video.a, 'example');
  assert.equal(video.b, '123');
  assert.equal(video.title, 'Legacy');
  assert.equal(video.url, 'https://www.example.com/v/123');
  assert.equal(video.folderId, null);
  assert.deepEqual(video.tags, []);
  assert.equal(video.favorite, false);
  assert.equal(video.watchStatus, '');
  assert.equal(video.openCount, 0);
  assert.equal(video.addedAt, 100);
});

test('normalizes and preserves the selected thumbnail timestamp', () => {
  assert.equal(normalizeVideo({ id:'v1', thumbnailTimeSeconds:42.5 }).thumbnailTimeSeconds, 42.5);
  assert.equal(normalizeVideo({ id:'v2' }).thumbnailTimeSeconds, null);
  assert.equal(normalizeVideo({ id:'v3', thumbnailTimeSeconds:-2 }).thumbnailTimeSeconds, 0);
});

test('parses and formats thumbnail timestamps for editor input', () => {
  assert.equal(parseMediaTime('90'), 90);
  assert.equal(parseMediaTime('1:30'), 90);
  assert.equal(parseMediaTime('1:02:03'), 3723);
  assert.equal(parseMediaTime('bad'), null);
  assert.equal(formatMediaTime(90), '1:30');
  assert.equal(formatMediaTime(3723), '1:02:03');
});

test('parseTags trims, de-duplicates, and accepts comma or Japanese comma separators', () => {
  assert.deepEqual(parseTags(' music, live、music ,  海外 '), ['music','live','海外']);
});

test('filters across title memo tags folder service and quick status', () => {
  const folders = normalizeFolders([{ id:'f1', name:'Music' }]);
  const videos = [
    normalizeVideo({ id:'1', title:'Live Session', url:'https://youtube.com/watch?v=x', folderId:'f1', tags:['acoustic'], memo:'favorite singer', favorite:true, watchStatus:'later', addedAt:2 }),
    normalizeVideo({ id:'2', title:'Game clip', url:'https://example.com/v/9', tags:['funny'], watchStatus:'watched', addedAt:1 }),
  ];
  assert.deepEqual(filterVideos(videos,{ query:'acoustic', folders }).map(v=>v.id), ['1']);
  assert.deepEqual(filterVideos(videos,{ query:'music', folders }).map(v=>v.id), ['1']);
  assert.deepEqual(filterVideos(videos,{ query:'youtube', folders }).map(v=>v.id), ['1']);
  assert.deepEqual(filterVideos(videos,{ quick:'favorite', folders }).map(v=>v.id), ['1']);
  assert.deepEqual(filterVideos(videos,{ quick:'watched', folders }).map(v=>v.id), ['2']);
});

test('sorts videos by recent open, open count, title, added and oldest', () => {
  const videos = [
    normalizeVideo({ id:'a', title:'Zulu', addedAt:10, lastOpenedAt:20, openCount:1 }),
    normalizeVideo({ id:'b', title:'Alpha', addedAt:30, lastOpenedAt:5, openCount:7 }),
  ];
  assert.deepEqual(sortVideos(videos,'recent-opened').map(v=>v.id), ['a','b']);
  assert.deepEqual(sortVideos(videos,'most-opened').map(v=>v.id), ['b','a']);
  assert.deepEqual(sortVideos(videos,'title').map(v=>v.id), ['b','a']);
  assert.deepEqual(sortVideos(videos,'recent-added').map(v=>v.id), ['b','a']);
  assert.deepEqual(sortVideos(videos,'oldest').map(v=>v.id), ['a','b']);
});

test('removing a folder unfiles its videos instead of deleting them', () => {
  const result = removeFolder([{id:'f1',name:'One'},{id:'f2',name:'Two'}],[normalizeVideo({id:'v1',folderId:'f1'}),normalizeVideo({id:'v2',folderId:'f2'})],'f1');
  assert.deepEqual(result.folders.map(f=>f.id), ['f2']);
  assert.equal(result.videos.length, 2);
  assert.equal(result.videos.find(v=>v.id==='v1').folderId, null);
});

test('deriveService returns a stable host label for arbitrary URLs', () => {
  assert.equal(deriveService('https://www.youtube.com/watch?v=x'), 'youtube.com');
  assert.equal(deriveService('https://sub.example.co.jp/path'), 'sub.example.co.jp');
  assert.equal(deriveService('not a url','legacy'), 'legacy');
});