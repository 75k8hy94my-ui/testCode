import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('open menu does not change title row class or wrapping',()=>{
 const js=read('video-card.js');
 assert.doesNotMatch(js,/titleRow\.className = 'videoCardTitleRow videoCardTitleRow--menu-open'/);
 const css=read('video-card.css');
 assert.match(css,/\.videoCardMenu \{ position: absolute; top:/);
 assert.match(css,/\.videoCardMenuWrap--open,\s*\.videoCard--related \.videoCardMenuWrap--open \{ flex: 0 0 32px/);
});
test('overlay is above adjacent cards and CSS is refreshed',()=>{
 const css=read('video-card.css');
 assert.match(css,/\.videoCard:has\(\.videoCardMenuWrap--open\) \{ z-index: 100/);
 for(const file of ['home.html','manga.html','video.html','profile.html','video-player.html'])assert.match(read(file),/video-card\.css\?v=[\w-]+/);
 assert.match(read('video-list-route.js'),/video-card\.js\?v=[\w-]+/);
});