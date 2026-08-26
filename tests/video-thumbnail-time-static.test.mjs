import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const library = fs.readFileSync(new URL('../video-library.js', import.meta.url), 'utf8');
const routing = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');

test('video editor exposes thumbnail preview, slider, and mm:ss timestamp input', () => {
  assert.match(library, /videoLibraryThumbnailPreview/);
  assert.match(library, /videoLibraryThumbnailRange/);
  assert.match(library, /videoLibraryThumbnailTime/);
  assert.match(library, /type=\"range\"/);
});

test('video editor restores and saves thumbnailTimeSeconds', () => {
  assert.match(library, /thumbnailTimeSeconds/);
  assert.match(library, /dom\.thumbnailTime/);
  assert.match(library, /dom\.thumbnailRange/);
});

test('thumbnail preview synchronizes slider, timestamp text, and media currentTime', () => {
  assert.match(library, /thumbnailPreview\.currentTime/);
  assert.match(library, /thumbnailRange\.addEventListener\('input'/);
  assert.match(library, /thumbnailTime\.addEventListener\('change'/);
  assert.match(library, /formatMediaTime/);
  assert.match(library, /parseMediaTime/);
});

test('direct card thumbnail seeks to the saved thumbnail timestamp', () => {
  assert.match(routing, /effective\.thumbnailTimeSeconds/);
  assert.match(routing, /preview\.currentTime/);
});
