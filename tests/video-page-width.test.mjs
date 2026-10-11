import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('video list and player use stable bounded box-sized containers',()=>{
 const css=read('home-profile-shell.css');
 assert.match(css,/#videoListSection #videoLibraryApp \{[\s\S]*?max-width: 1540px/);
 assert.match(css,/\.videoPlayerLayout,\s*#videoListSection #videoLibraryApp \{/);
 assert.match(css,/box-sizing: border-box;/);
 assert.match(css,/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 380px\)/);
});
test('entrypoints use the latest shared shell stylesheet',()=>{
 for(const name of ['video.html','video-player.html','home.html','manga.html','profile.html'])
  assert.match(read(name),/home-profile-shell\.css\?v=20261012-video-width-stable/);
});