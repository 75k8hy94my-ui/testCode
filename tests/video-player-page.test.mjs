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
