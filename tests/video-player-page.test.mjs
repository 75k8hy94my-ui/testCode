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

test('video player document cache keys identify the current watch-page design', () => {
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.match(html, /home-profile-shell\.css\?v=20261007-video-watch-layout/);
  assert.match(html, /video-player-page\.js\?v=20261007-video-watch-layout/);
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
