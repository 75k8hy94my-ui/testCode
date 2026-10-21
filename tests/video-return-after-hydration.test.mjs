import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('return intent waits for hydration and hidden videos use ordinary list',()=>{
  const src=read('video-library.js');
  assert.match(src,/const target = all\.find\(video => String\(video\.id\) === targetId\)/);
  assert.match(src,/if \(!target\) return;/);
  assert.match(src,/if \(target\.hidden\) \{[\s\S]*?state\.showHidden = false;[\s\S]*?state\.page = 1/);
  assert.match(src,/const calculatedPage = Math\.floor\(index \/ Pagination\.PAGE_SIZE\) \+ 1/);
});
test('restoration is retried on render and access changes',()=>{
 const src=read('video-library.js');
 assert.match(src,/function render\(pageDirection = 0\) \{\s*loadLibraryState\(\);\s*restoreVideoPage\(\);/);
 assert.match(src,/if \(canReadProtectedData\(\)\) \{ render\(\); resumePendingLocalSync\(\); \}/);
 assert.match(read('video-list-route.js'),/video-library\.js\?v=20261012-restore-after-hydration/);
});