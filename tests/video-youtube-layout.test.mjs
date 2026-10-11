import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('video information is grouped under the thumbnail',()=>{
 const js=read('video-card.js');
 for(const name of ['videoCardInfo','videoCardSourceIcon','videoCardDetails','videoCardTitleRow','videoCardMeta'])assert.ok(js.includes(name));
 assert.match(js,/details\.append\(titleRow\)/);
 assert.match(js,/info\.append\(details\); body\.append\(info\)/);
});
test('responsive grid and related layout remain distinct',()=>{
 const css=read('video-card.css');
 assert.match(css,/minmax\(min\(100%,300px\),1fr\)/);
 assert.match(css,/\.videoCard--related \.videoCardInfo/);
 assert.match(css,/@media \(max-width: 640px\)/);
});
test('entrypoints use refreshed styles and shared card script',()=>{
 for(const p of ['video.html','home.html','manga.html','profile.html','video-player.html'])assert.match(read(p),/video-card\.css\?v=20261012-youtube-layout-v3/);
 assert.match(read('video-list-route.js'),/video-card\.js\?v=20261012-youtube-layout-v3/);
 assert.match(read('video-player.html'),/video-card\.js\?v=20261012-youtube-layout-v3/);
});