import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');

test('direct video cards generate an automatic video-frame thumbnail when no manual thumbnail is set', () => {
  assert.match(source, /vl-thumb-direct-video/);
  assert.match(source, /thumbnailUrl/);
  assert.match(source, /muted\s*=\s*true/);
  assert.match(source, /preload\s*=\s*'auto'/);
  assert.match(source, /position:absolute;inset:0/);
  assert.match(source, /data-frame-ready/);
  assert.match(source, /addEventListener\('seeked'/);
});

test('direct video thumbnail adopts the media native aspect ratio', () => {
  assert.match(source, /videoWidth/);
  assert.match(source, /videoHeight/);
  assert.match(source, /thumb\.style\.aspectRatio/);
});

test('direct inline player adopts the media native aspect ratio after metadata loads', () => {
  assert.match(source, /player\.style\.aspectRatio/);
  assert.match(source, /loadedmetadata/);
  assert.match(source, /video\.videoWidth/);
  assert.match(source, /video\.videoHeight/);
});

test('direct card thumbnail seeks to the persisted thumbnail timestamp before reveal', () => {
  assert.match(source, /effective\.thumbnailTimeSeconds/);
  assert.match(source, /requestedThumbnailTime/);
  assert.match(source, /preview\.currentTime = targetThumbnailTime/);
  assert.match(source, /fallback\.hidden = true/);
});
