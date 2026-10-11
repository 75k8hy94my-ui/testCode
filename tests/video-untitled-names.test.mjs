import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Data = require('../video-data.js');
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url),'utf8');
test('unnamed videos receive full width numbered labels, independent of list order',()=>{
 const videos=[{id:'a',title:''},{id:'b',title:'付けたタイトル'},{id:'c',title:' '},{id:'d',title:''}];
 assert.equal(Data.displayTitle(videos[0], videos),'名称未設定１');
 assert.equal(Data.displayTitle(videos[1], videos),'付けたタイトル');
 assert.equal(Data.displayTitle(videos[2], videos),'名称未設定２');
 assert.equal(Data.displayTitle(videos[3], videos),'名称未設定３');
});
test('video list and related player use the same title helper',()=>{
 assert.match(read('video-library.js'), /Data\.displayTitle\(video, effectiveVideos\(\)\)/);
 assert.match(read('video-player-page.js'), /videos\.displayTitle\(normalized,/);
 assert.match(read('video-player-page.js'), /videos\.displayTitle\(itemVideo,/);
 assert.doesNotMatch(read('video-library.js'), /const title = video\.title \|\| \[Data\.deriveService/);
});
test('versioned entrypoints load updated scripts',()=>{
 assert.match(read('video-list-route.js'),/video-data\.js\?v=20261012-untitled-names/);
 assert.match(read('video-player.html'),/video-data\.js\?v=20261012-untitled-names/);
});