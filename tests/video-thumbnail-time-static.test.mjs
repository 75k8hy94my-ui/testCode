import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const featureUrl = new URL('../video-thumbnail-time.js', import.meta.url);

test('thumbnail timestamp feature module exists', () => {
  assert.equal(fs.existsSync(featureUrl), true);
});

test('video editor exposes thumbnail preview, slider, and mm:ss timestamp input', () => {
  assert.equal(fs.existsSync(featureUrl), true);
  const source = fs.readFileSync(featureUrl, 'utf8');
  assert.match(source, /videoLibraryThumbnailPreview/);
  assert.match(source, /videoLibraryThumbnailRange/);
  assert.match(source, /videoLibraryThumbnailTime/);
  assert.match(source, /type = 'range'/);
});

test('video editor restores and saves thumbnailTimeSeconds', () => {
  assert.equal(fs.existsSync(featureUrl), true);
  const source = fs.readFileSync(featureUrl, 'utf8');
  assert.match(source, /thumbnailTimeSeconds/);
  assert.match(source, /localStorage\.setItem\(META_KEY/);
  assert.match(source, /scheduleVaultSync/);
});

test('thumbnail preview synchronizes slider, timestamp text, and media currentTime', () => {
  assert.equal(fs.existsSync(featureUrl), true);
  const source = fs.readFileSync(featureUrl, 'utf8');
  assert.match(source, /thumbnailPreview\.currentTime/);
  assert.match(source, /thumbnailRange\.addEventListener\('input'/);
  assert.match(source, /thumbnailTime\.addEventListener\('change'/);
  assert.match(source, /Data\.formatMediaTime/);
  assert.match(source, /Data\.parseMediaTime/);
});

test('direct card thumbnail seeks to the saved thumbnail timestamp', () => {
  assert.equal(fs.existsSync(featureUrl), true);
  const source = fs.readFileSync(featureUrl, 'utf8');
  assert.match(source, /vl-thumb-direct-video/);
  assert.match(source, /thumbnailTimeSeconds/);
  assert.match(source, /preview\.currentTime/);
});
