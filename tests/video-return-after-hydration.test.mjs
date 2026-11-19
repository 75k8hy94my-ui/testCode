import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('return intent waits for hydration and hidden videos use ordinary list',()=>{
  const src=read('video-library.js');
  assert.match(src,/const target = all\.find\(video => String\(video\.id\) === targetId\)/);
  assert.match(src,/if \(!target\) return;/);
  assert.match(src,/function resetReturnFilters\(\)[\s\S]*?showHidden: false/);
  assert.match(src,/if \(target\.hidden\) \{\s*clearReturnIntent\(\);\s*resetReturnFilters\(\);\s*state\.page = 1/);
});
test('restoration is retried on render and access changes',()=>{
 const src=read('video-library.js');
 assert.match(src,/function render\(pageDirection = 0\) \{\s*if \(!isListMounted\(\)\) return;\s*loadLibraryState\(\);\s*restoreVideoPage\(\);/);
 assert.match(src,/document\.addEventListener\('manga-reader-vpn-status'[\s\S]*?if \(!canReadProtectedData\(\)\) return;[\s\S]*?if \(isListMounted\(\)\) render\(\);[\s\S]*?resumePendingLocalSync\(\)/);
 assert.match(read('video-list-route.js'),/video-library\.js\?v=[\w-]+/);
});
