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
  assert.match(read('video-player.html'), /video-player-page\.js\?v=[\w-]+/);
  assert.match(read('video-list-route.js'), /video-library\.js\?v=[\w-]+/);
});

test('the list records the opening view and restores it before computing the target page', () => {
  const lib = read('video-library.js');
  const interceptor = read('video-routing-fix.js');
  assert.match(lib, /function captureReturnContext\(videoId\)/);
  assert.match(lib, /sessionStorage\.setItem\(RETURN_VIEW_KEY/);
  assert.match(lib, /restoreReturnContext\(targetId\)/);
  assert.match(lib, /sortForReturn\(filtered\)/);
  assert.match(lib, /orderIds: ordered\.length/);
  assert.match(lib, /captureReturnContext\(videoId\);\s*updateMeta\(videoId/);
  assert.match(interceptor, /captureReturnContext\?\.\(videoId\);\s*recordOpen\(base\)/);
});

test('mobile video tab is actionable on the video player even when active', () => {
  const nav = read('mobile-bottom-nav.js');
  assert.match(nav, /onVideoPlayer && item\.dataset\.mobileRoute === 'video'/);
  assert.match(read('video-player.html'), /mobile-bottom-nav\.js\?v=[\w-]+/);
});

test('SPA entrypoints load the updated return-context handler', () => {
  assert.match(read('home-profile-spa.js'), /video-list-route\.js\?v=[\w-]+/);
  assert.match(read('video-list-route.js'), /video-library\.js\?v=[\w-]+/);
  assert.match(read('video-list-route.js'), /video-routing-fix\.js\?v=[\w-]+/);
});
