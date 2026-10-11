import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('both video opening paths record origin page',()=>{
 assert.match(read('video-library.js'),/target\.searchParams\.set\('fromPage', String\(state\.page\)\)/);
 assert.match(read('video-routing-fix.js'),/targetUrl\.searchParams\.set\('fromPage', String\(pageNumber\)\)/);
});
test('player header propagates origin and list resolves target by id',()=>{
 assert.match(read('video-player-page.js'),/destination\.searchParams\.set\('returnPage', String\(validReturnPage\)\)/);
 const list=read('video-library.js');
 assert.match(list,/params\.get\('returnPage'\)/);
 assert.match(list,/list\.slice\(pageStart, pageStart \+ Pagination\.PAGE_SIZE\)\.some/);
 assert.match(list,/\? candidate : calculatedPage/);
});
test('assets are refreshed to avoid stale SPA scripts',()=>{
 assert.match(read('video-list-route.js'),/video-library\.js\?v=20261012-return-target-persist/);
 assert.match(read('video-list-route.js'),/video-routing-fix\.js\?v=20261012-explicit-return-page/);
 assert.match(read('video-player.html'),/video-player-page\.js\?v=20261012-return-target-persist/);
});