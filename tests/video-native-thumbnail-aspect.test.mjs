import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('native video dimensions control thumbnail ratio',()=>{
 const source=read('video-thumbnail-renderer.js');
 assert.match(source,/container\.style\.aspectRatio = width \+ ' \/ ' \+ height/);
 assert.match(source,/applyNativeRatio\(Number\(preview\.videoWidth\), Number\(preview\.videoHeight\)\)/);
 assert.match(source,/applyNativeRatio\(cached\.naturalWidth, cached\.naturalHeight\)/);
});
test('thumbnail media uses contain, not cover',()=>{
 const css=read('video-card.css');
 assert.match(css,/\.videoCardThumb img, \.videoCardThumb video \{ object-fit: contain; \}/);
 assert.match(css,/#videoLibraryResults \.vl-thumb \.vl-thumb-direct-video \{ object-fit: contain; \}/);
});
test('cache and entrypoints use updated assets',()=>{
 assert.match(read('video-list-route.js'),/video-thumbnail-renderer\.js\?v=[\w-]+/);
 for(const file of ['video.html','home.html','manga.html','profile.html','video-player.html']){
 assert.match(read(file),/video-card\.css\?v=[\w-]+/);
 }
});