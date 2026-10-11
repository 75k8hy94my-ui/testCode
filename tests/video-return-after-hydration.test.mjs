import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('return intent survives before vault video hydration',()=>{
 const src=read('video-library.js');
 assert.match(src,/if \(!all\.some\(video => String\(video\.id\) === targetId\)\) return;/);
 assert.match(src,/if \(index < 0\) return;\s*state\.page = Math\.floor\(index \/ Pagination\.PAGE_SIZE\) \+ 1;\s*params\.delete\('returnVideo'\)/);
});
test('restoration is retried on render and access changes',()=>{
 const src=read('video-library.js');
 assert.match(src,/function render\(pageDirection = 0\) \{\s*loadLibraryState\(\);\s*restoreVideoPage\(\);/);
 assert.match(src,/if \(canReadProtectedData\(\)\) \{ render\(\); resumePendingLocalSync\(\); \}/);
 assert.match(read('video-list-route.js'),/video-library\.js\?v=20261012-restore-after-hydration/);
});