import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
const controls = fs.readFileSync(new URL('../video-player-controls.js', import.meta.url), 'utf8');

test('video player page uses the normalized saved title and renders marker list', () => {
  assert.match(page, /document\.title\s*=\s*title/);
  assert.match(page, /videoMarkerList/);
  assert.match(page, /videoMarker/);
});

test('related videos use normalized thumbnail metadata and the shared renderer', () => {
  assert.match(page, /itemVideo/);
  assert.match(page, /MangaReaderVideoThumbnailRenderer\.render\(thumb, itemVideo/);
  assert.match(fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8'), /video-thumbnail-renderer\.js/);
});

test('video player waits for protected-data access before reading records or rendering metadata', () => {
  const accessCheck = page.indexOf('function canReadProtectedData()');
  const initialize = page.indexOf('function initializePlayer()');
  assert.ok(accessCheck >= 0 && initialize > accessCheck);
  assert.ok(page.indexOf('const baseVideos = read(VIDEO_KEY, [])') > initialize);
  assert.match(page, /manga-reader-vpn-status/);
  assert.match(page, /function disposePlayer\(\)/);
  assert.match(page, /page\.replaceChildren\(\)/);
  assert.match(controls, /manga-reader-vpn-status/);
  assert.match(controls, /function initializeControls\(\)/);
  assert.match(controls, /canReadProtectedData\(\)/);
});

test('video player page exposes quick editing for saved video details and syncs Vault payload', () => {
  assert.match(page, /動画情報を編集/);
  assert.match(page, /videoEditForm/);
  assert.match(page, /name="title"/);
  assert.match(page, /name="tags"/);
  assert.match(page, /name="memo"/);
  assert.match(page, /localStorage\.setItem\(META_KEY, JSON\.stringify\(nextMeta\)\)/);
  assert.match(page, /MangaVault\.savePayload\(window\.MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
});

test('video title edits in place and player details follow the video in a watch-page layout', () => {
  assert.match(page, /heading\.contentEditable\s*=\s*['"]true['"]/);
  assert.match(page, /heading\.addEventListener\(['"]keydown['"]/);
  assert.match(page, /saveTitle/);
  assert.match(page, /main\.append\(frame, heading, info, actionBar, description, markerList, back\)/);
  assert.match(page, /videoPlayerActionBar/);
  assert.match(fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8'), /\.videoPlayerActionBar/);
});

test('custom player defers single taps and maps double-tap zones to seek or fullscreen', () => {
  assert.match(controls, /Gestures\.create\(/);
  assert.match(controls, /onSingleTap: \(\) => \{ video\.paused \? video\.play\(\) : video\.pause\(\); \}/);
  assert.match(controls, /Gestures\.actionAt\(event\.clientX, video\.getBoundingClientRect\(\)\)/);
  assert.match(controls, /else toggleFullscreen\(\)/);
  assert.match(controls, /gestureController\.destroy\(\)/);
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('video-player-gestures.js') < html.indexOf('video-player-controls.js'));
});

test('video player document cache keys identify the current watch-page design', () => {
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.match(html, /home-profile-shell\.css\?v=20261007-video-watch-layout/);
  assert.match(html, /video-player-page\.js\?v=20261008-shared-thumbnails/);
});

test('marker registration defaults to the current playback position', () => {
  assert.match(controls, /video\.currentTime/);
  assert.match(controls, /secondsInput\.value/);
  assert.match(controls, /currentTime/);
});

test('saved markers are rendered as seekable rows on the player page', () => {
  assert.match(page, /mangaReaderVideoMarkers/);
  assert.match(page, /currentTime\s*=\s*marker\.seconds/);
  assert.match(page, /videoMarkerList/);
});
