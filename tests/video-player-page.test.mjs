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

test('video detail editing navigates to the standalone editor without opening a dialog', () => {
  assert.match(page, /video-edit\.html\?id=/);
  assert.match(page, /return=player/);
  assert.doesNotMatch(page, /videoEditDialog|role="dialog"/);
  const library = fs.readFileSync(new URL('../video-library.js', import.meta.url), 'utf8');
  assert.match(library, /video-edit\.html/);
  assert.match(library, /return', 'list'/);
});

test('standalone video editor guards protected reads and saves through Vault sync', () => {
  const editor = fs.readFileSync(new URL('../video-edit-page.js', import.meta.url), 'utf8');
  assert.match(editor, /function canReadProtectedData\(\)/);
  assert.match(editor, /if \(!canReadProtectedData\(\)\) return fallback/);
  assert.match(editor, /manga-reader-vpn-status/);
  assert.match(editor, /localStorage\.setItem\(VIDEO_KEY/);
  assert.match(editor, /localStorage\.setItem\(META_KEY/);
  assert.match(editor, /MangaVault\.savePayload\(window\.MangaVaultPayload\.buildFromLocalStorage\(\)\)/);
  assert.match(editor, /title: elements\.title\.value\.trim\(\)/);
  assert.match(editor, /rotate90Direction: elements\.rotate\.value/);
  const html = fs.readFileSync(new URL('../video-edit.html', import.meta.url), 'utf8');
  assert.match(html, /media-access-gate\.js/);
  assert.match(html, /video-edit-page\.js\?v=20261008-video-edit-page/);
});

test('video title edits in place and player details follow the video in a watch-page layout', () => {
  assert.match(page, /heading\.contentEditable\s*=\s*['"]true['"]/);
  assert.match(page, /heading\.addEventListener\(['"]keydown['"]/);
  assert.match(page, /saveTitle/);
  assert.match(page, /main\.append\(frame, heading, info, actionBar, description, markerList, back\)/);
  assert.match(page, /videoPlayerActionBar/);
  assert.match(fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8'), /\.videoPlayerActionBar/);
});

test('video player document cache keys identify the current watch-page design', () => {
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.match(html, /home-profile-shell\.css\?v=20261007-video-watch-layout/);
  assert.match(html, /video-player-page\.js\?v=20261008-vpn-data/);
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
