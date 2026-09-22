import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const route = read('video-list-route.js');
const template = read('video-list-template.js');
const spa = read('home-profile-spa.js');
const page = read('video.html');

test('video route has a dedicated template and route runtime without reader HTML', () => {
  assert.match(template, /id="videoListSection"/);
  assert.match(route, /VideoListRouteFactory/);
  assert.doesNotMatch(route, /reader\.html|ReaderRouteRuntimeFactory|savedListOverlay|mangaListSection/);
  assert.doesNotMatch(template, /savedListOverlay|mangaListSection|tocOverlay|videoPlayerOverlay/);
});

test('video route loads its existing video modules without fetching reader.html', () => {
  assert.match(spa, /renderVideo\(generation\)/);
  assert.match(spa, /video-list-route\.js\?v=20260922-video-route/);
  assert.match(spa, /video-list-template\.js\?v=20260922-video-template/);
  assert.match(spa, /VideoListRouteFactory\.create\(/);
  assert.match(spa, /video-data\.js\?v=20260918-video-data-no-window/);
  assert.match(spa, /video-library\.js\?v=20260918-video-library-no-window/);
  assert.match(spa, /video-routing-fix\.js\?v=20260918-video-routing-no-window/);
  assert.match(spa, /video-thumbnail-time\.js\?v=20260916-video-thumbnail/);
  assert.match(spa, /else if\(route==='video'\)renderVideo\(generation\)/);
  assert.match(spa, /else if\(route==='reader'\)renderReader\(route,generation\)/);
  const renderVideo = spa.slice(spa.indexOf('async function renderVideo'), spa.indexOf('async function renderReader'));
  assert.doesNotMatch(renderVideo, /fetch\('reader\.html/);
  assert.doesNotMatch(page, /reader-route-runtime|reader\.html/);
});

test('video route passes media gate before video feature modules', () => {
  const route = read('video-list-route.js');
  const gate = route.indexOf("deps.loadMediaGate()");
  const data = route.indexOf("deps.loadScript('video-data.js?v=20260918-video-data-no-window'");
  const library = route.indexOf("deps.loadScript('video-library.js?v=20260918-video-library-no-window'");
  assert.ok(gate >= 0 && gate < data);
  assert.ok(data < library);
});

test('video route detaches its retained DOM when leaving the route', () => {
  assert.match(spa, /function cleanupVideoRoute\(\)\{if\(videoRouteRuntime\)videoRouteRuntime\.detach\(\);\}/);
  assert.match(route, /function detach\(\)/);
});

test('video library can be reinitialized after a route interruption without rebinding events', () => {
  const library = read('video-library.js');
  assert.match(library, /window\.MangaReaderVideoLibrary\s*=\s*Object\.freeze\(\{ init \}\)/);
  assert.match(library, /let eventsBound = false/);
  assert.match(library, /if \(eventsBound\) return;/);
  assert.match(library, /if \(section\.dataset\.videoLibraryEnhanced === '1'\) return true/);
  assert.match(library, /if \(dom\.search\) dom\.search\.value = state\.query/);
  assert.match(route, /MangaReaderVideoLibrary\.init\(\)/);
  assert.match(route, /bootPromise = null/);
});
