import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');

test('direct video playback restores saved progress after metadata loads', () => {
  assert.match(source, /loadedmetadata/);
  assert.match(source, /progressSeconds/);
  assert.match(source, /durationSeconds/);
  assert.match(source, /currentTime\s*=/);
});

test('direct video playback persists progress while playing and on pause or end', () => {
  assert.match(source, /timeupdate/);
  assert.match(source, /pause/);
  assert.match(source, /ended/);
  assert.match(source, /localStorage\.setItem\(META_KEY/);
});

test('closing or leaving flushes the active direct video progress', () => {
  assert.match(source, /closeActivePlayer/);
  assert.match(source, /pagehide/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /scheduleVaultSync/);
});


test('direct playback applies timed left rotation and rechecks after seeking', () => {
  assert.match(source, /rotateLeftStartSeconds/);
  assert.match(source, /rotateLeftEndSeconds/);
  assert.match(source, /vl-rotate-left/);
  assert.match(source, /rotate\(-90deg\)/);
  assert.match(source, /seeking/);
  assert.match(source, /seeked/);
});
