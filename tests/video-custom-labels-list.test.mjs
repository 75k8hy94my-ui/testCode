import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('cards show all assigned visible custom properties and tags',()=>{
 const library=read('video-library.js');
 assert.doesNotMatch(library,/property\.showInCard === true/);
 assert.match(library,/const customLabels = \[\]/);
 assert.match(library,/customLabels\.push\(property\.name/);
 assert.match(library,/tags: Array\.isArray\(video\.tags\) \? video\.tags : \[\], customLabels/);
});
test('tag labels are not part of truncated metadata',()=>{
 const card=read('video-card.js');
 assert.match(card,/videoCardLabels/);
 assert.match(card,/videoCardLabel--custom/);
 assert.match(card,/videoCardLabel--tag/);
 assert.match(read('video-card.css'),/\.videoCardLabels \{ display: flex; flex-wrap: wrap/);
});
test('entries load updated scripts and styles',()=>{
 assert.match(read('video-list-route.js'),/video-library\.js\?v=20261012-custom-labels/);
 assert.match(read('video-list-route.js'),/video-card\.js\?v=20261012-custom-labels/);
 for(const p of ['video.html','home.html','manga.html','profile.html','video-player.html']) assert.match(read(p),/video-card\.css\?v=20261012-custom-labels/);
});