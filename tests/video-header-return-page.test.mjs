import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('player header and desktop/mobile video navigation carry target and page', () => {
  const player = read('video-player-page.js');
  assert.match(player, /document\.getElementById\('shellTitle'\)/);
  assert.match(player, /videoListReturnUrl\(\)/);
  assert.match(player, /destination\.searchParams\.set\('returnVideo', returnVideoId\)/);
  assert.match(player, /destination\.searchParams\.set\('returnPage', String\(validReturnPage\)\)/);
  assert.match(player, /document\.addEventListener\('click',[\s\S]*destination\.pathname\.split\('\/'\)\.pop\(\) !== 'video\.html'[\s\S]*true\)/);
  assert.match(player, /sessionStorage\.setItem\(RETURN_INTENT_KEY/);
  assert.doesNotMatch(player, /main\.append\(markerList, back\)/);
  assert.doesNotMatch(player, /videoBack/);
});

test('return intent survives hydration and SPA re-renders until a user changes the page', () => {
  const library = read('video-library.js');
  assert.match(library, /function readReturnIntent\(\)/);
  assert.match(library, /params\.get\('returnVideo'\)/);
  assert.match(library, /sessionStorage\.getItem\(RETURN_INTENT_KEY\)/);
  assert.match(library, /Data\.sortVideos\(filtered, state\.sort\)/);
  assert.match(library, /Math\.floor\(index \/ Pagination\.PAGE_SIZE\) \+ 1/);
  assert.match(library, /restoreVideoPage\(\);/);
  assert.match(library, /acknowledgeReturnIntent\(pageModel\.items\)/);
  assert.match(library, /dom\.results\.querySelectorAll\('\.vl-card'\)/);
  assert.match(library, /clearReturnIntent\(\);\s*state\.page = nextPage/);
});

test('entrypoints version the changed files', () => {
  assert.match(read('video-player.html'), /video-player-page\.js\?v=20261012-return-target-persist/);
  assert.match(read('video-list-route.js'), /video-library\.js\?v=20261012-return-target-persist/);
});
