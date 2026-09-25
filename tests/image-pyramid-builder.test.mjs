import test from 'node:test';
import assert from 'node:assert/strict';
import imageProfile from '../image-compression-profile.js';
import pyramid from '../image-pyramid-builder.js';

const { getCompressionProfile, normalizeCompressionProfile } = imageProfile;
const {
  calculateScaledDimensions,
  planZoomLevels,
  calculateTileGrid,
  calculateTileRect,
  buildManifestMetadata
} = pyramid;

test('profile v1 exposes the requested preview and zoom values', () => {
  const profile = getCompressionProfile();
  assert.equal(profile.version, 1);
  assert.equal(profile.preview.maxLongEdge, 1440);
  assert.equal(profile.preview.mimeType, 'image/webp');
  assert.equal(profile.preview.initialQuality, 0.64);
  assert.equal(profile.preview.preferredQuality, 0.60);
  assert.equal(profile.preview.fallbackQuality, 0.56);
  assert.equal(profile.preview.minimumQuality, 0.54);
  assert.equal(profile.preview.targetBytes, 400 * 1024);
  assert.equal(profile.preview.fallbackLongEdge, 1280);
  assert.equal(profile.zoom.mimeType, 'image/webp');
  assert.equal(profile.zoom.quality, 0.88);
  assert.equal(profile.zoom.tileSize, 512);
  assert.equal(profile.zoom.intermediateLongEdge, 2048);
  assert.equal(profile.zoom.maximumLongEdge, 4096);
});

test('profile snapshots are detached and normalization rejects invalid values', () => {
  const profile = getCompressionProfile();
  profile.preview.maxLongEdge = 1;
  assert.equal(getCompressionProfile().preview.maxLongEdge, 1440);
  assert.throws(() => normalizeCompressionProfile({ version: 2 }), /version/i);
  assert.throws(() => normalizeCompressionProfile({ version: 1, preview: {}, zoom: {} }), /maxLongEdge/i);
});

test('scale calculations preserve aspect ratio and never enlarge', () => {
  assert.deepEqual(calculateScaledDimensions(6000, 4000, 1440), { width: 1440, height: 960, longEdge: 1440 });
  assert.deepEqual(calculateScaledDimensions(4000, 6000, 1440), { width: 960, height: 1440, longEdge: 1440 });
  assert.deepEqual(calculateScaledDimensions(1000, 1000, 1440), { width: 1000, height: 1000, longEdge: 1000 });
  assert.deepEqual(calculateScaledDimensions(513, 1025, 512), { width: 256, height: 512, longEdge: 512 });
});

test('zoom plans use available resolution without duplicates or upscaling', () => {
  assert.deepEqual(planZoomLevels(6000, 4000).map(level => level.longEdge), [2048, 4096]);
  assert.deepEqual(planZoomLevels(4000, 3000).map(level => level.longEdge), [2048, 4000]);
  assert.deepEqual(planZoomLevels(3000, 2000).map(level => level.longEdge), [2048, 3000]);
  assert.deepEqual(planZoomLevels(1900, 1200).map(level => level.longEdge), [1900]);
  assert.deepEqual(planZoomLevels(1400, 1000), []);
  assert.deepEqual(planZoomLevels(4096, 4096).map(level => level.longEdge), [2048, 4096]);
});

test('zoom level dimensions are deterministic for portrait, landscape, and square photos', () => {
  assert.deepEqual(planZoomLevels(6000, 4000), [
    { level: 0, width: 2048, height: 1365, longEdge: 2048 },
    { level: 1, width: 4096, height: 2731, longEdge: 4096 }
  ]);
  assert.deepEqual(planZoomLevels(3000, 4000), [
    { level: 0, width: 1536, height: 2048, longEdge: 2048 },
    { level: 1, width: 3000, height: 4000, longEdge: 4000 }
  ]);
});

test('tile geometry handles exact, edge, portrait, and landscape dimensions without padding', () => {
  assert.deepEqual(calculateTileGrid(512, 512, 512), { columns: 1, rows: 1 });
  assert.deepEqual(calculateTileGrid(513, 1025, 512), { columns: 2, rows: 3 });
  assert.deepEqual(calculateTileGrid(1024, 1024, 512), { columns: 2, rows: 2 });
  assert.deepEqual(calculateTileGrid(1025, 513, 512), { columns: 3, rows: 2 });
  assert.deepEqual(calculateTileGrid(1200, 900, 512), { columns: 3, rows: 2 });
  assert.deepEqual(calculateTileRect(513, 1025, 0, 0, 512), { pixelX: 0, pixelY: 0, width: 512, height: 512 });
  assert.deepEqual(calculateTileRect(513, 1025, 1, 0, 512), { pixelX: 512, pixelY: 0, width: 1, height: 512 });
  assert.deepEqual(calculateTileRect(513, 1025, 0, 2, 512), { pixelX: 0, pixelY: 1024, width: 512, height: 1 });
  assert.deepEqual(calculateTileRect(513, 1025, 1, 2, 512), { pixelX: 512, pixelY: 1024, width: 1, height: 1 });
});

test('manifest metadata contains only pure dimensions and binary metadata', () => {
  const metadata = buildManifestMetadata({
    source: { width: 4000, height: 3000, mimeType: 'image/jpeg', bytes: 123456 },
    preview: { width: 1440, height: 1080, mimeType: 'image/webp', bytes: 321000, quality: 0.6, longEdge: 1440 },
    levels: [{
      level: 0,
      width: 2048,
      height: 1536,
      longEdge: 2048,
      columns: 4,
      rows: 3,
      tiles: [{ x: 0, y: 0, pixelX: 0, pixelY: 0, width: 512, height: 512, mimeType: 'image/webp', bytes: 50000, quality: 0.88 }]
    }]
  });
  assert.deepEqual(metadata, {
    schemaVersion: 1,
    compressionProfileVersion: 1,
    source: { width: 4000, height: 3000, mimeType: 'image/jpeg', bytes: 123456 },
    preview: { width: 1440, height: 1080, mimeType: 'image/webp', bytes: 321000, quality: 0.6, longEdge: 1440 },
    zoom: {
      tileSize: 512,
      levels: [{
        level: 0,
        width: 2048,
        height: 1536,
        longEdge: 2048,
        columns: 4,
        rows: 3,
        tiles: [{ x: 0, y: 0, pixelX: 0, pixelY: 0, width: 512, height: 512, mimeType: 'image/webp', bytes: 50000, quality: 0.88 }]
      }]
    }
  });
});
