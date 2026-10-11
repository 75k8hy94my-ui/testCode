import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL('../'+file, import.meta.url), 'utf8');
test('player title links to video list with its id',()=>{
 const js=read('video-player-page.js');
 assert.match(js,/document\.getElementById\('shellTitle'\)/);
 assert.match(js,/destination\.searchParams\.set\('returnVideo', id\)/);
 assert.doesNotMatch(js,/main\.append\(markerList, back\)/);
 assert.doesNotMatch(js,/videoBack/);
});
test('list restores page by searching target within current sort and filters',()=>{
 const js=read('video-library.js');
 assert.match(js,/params\.get\('returnVideo'\)/);
 assert.match(js,/Data\.sortVideos\(filtered, state\.sort\)/);
 assert.match(js,/Math\.floor\(index \/ Pagination\.PAGE_SIZE\) \+ 1/);
 assert.match(js,/restoreVideoPage\(\); render\(\)/);
});
test('entrypoints version the changed files',()=>{
 assert.match(read('video-player.html'),/video-player-page\.js\?v=20261012-video-header-return/);
 assert.match(read('video-list-route.js'),/video-library\.js\?v=20261012-video-header-return/);
});