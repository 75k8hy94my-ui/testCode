import test from 'node:test';
import assert from 'node:assert/strict';
import processor from '../image-photo-processor.js';

function fakePhoto({ width = 6000, height = 4000, type = 'image/jpeg', size = 900000 } = {}) {
  return { name: 'photo.jpg', type, size, width, height };
}

function createFakeRuntime({ width = 6000, height = 4000, delay = 0 } = {}) {
  const encoded = [];
  const runtime = {
    async decode(file) {
      return {
        source: { width, height }, width, height,
        close() {}
      };
    },
    createCanvas(canvasWidth, canvasHeight) {
      return { width: canvasWidth, height: canvasHeight, getContext() { return { drawImage() {} }; } };
    },
    async encode(canvas, mimeType, quality) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const blob = new Blob([new Uint8Array(Math.max(1, Math.round(canvas.width * canvas.height * (1 - quality) / 100)))], { type: mimeType });
      encoded.push({ width: canvas.width, height: canvas.height, quality, blob });
      return blob;
    },
    drawImage() {},
    releaseCanvas() {},
    encoded
  };
  return runtime;
}

test('processor API is exposed', () => {
  assert.equal(typeof processor.processPhoto, 'function');
});

test('processor returns independent preview and tile blobs with manifest metadata', async () => {
  const result = await processor.processPhoto(fakePhoto(), { preferWorker: false, runtime: createFakeRuntime() });
  assert.ok(result.previewBlob instanceof Blob);
  assert.ok(Array.isArray(result.tileBlobs));
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.compressionProfileVersion, 1);
  assert.deepEqual(result.manifest.source, { width: 6000, height: 4000, mimeType: 'image/jpeg', bytes: 900000 });
  assert.equal(result.manifest.preview.mimeType, 'image/webp');
  assert.equal(result.manifest.preview.longEdge, 1440);
  assert.equal(result.manifest.preview.quality, 0.64);
  assert.deepEqual(result.manifest.zoom.levels.map(level => level.longEdge), [2048, 4096]);
  assert.equal(result.tileBlobs.length, result.manifest.zoom.levels.reduce((sum, level) => sum + level.tiles.length, 0));
  assert.equal(result.manifest.zoom.levels[0].tiles[0].quality, 0.88);
});

test('preview candidates use adaptive quality and fallback dimensions in order', async () => {
  const runtime = createFakeRuntime();
  await processor.processPhoto(fakePhoto(), { preferWorker: false, runtime, previewTargetBytes: 1 });
  assert.deepEqual(runtime.encoded.slice(0, 4).map(item => [item.width, item.height, item.quality]), [
    [1440, 960, 0.64],
    [1440, 960, 0.60],
    [1440, 960, 0.56],
    [1280, 853, 0.56]
  ]);
});

test('progress reports required phases and completes after all binaries are made', async () => {
  const updates = [];
  const result = await processor.processPhoto(fakePhoto({ width: 1900, height: 1200 }), {
    preferWorker: false,
    runtime: createFakeRuntime({ width: 1900, height: 1200 }),
    onProgress: update => updates.push(update)
  });
  assert.deepEqual([...new Set(updates.map(update => update.phase))], ['decode', 'preview', 'pyramid', 'tiles', 'complete']);
  assert.equal(updates.at(-1).phase, 'complete');
  assert.equal(result.manifest.zoom.levels.length, 1);
});

test('abort is reported as AbortError and never returns partial output', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => processor.processPhoto(fakePhoto(), { signal: controller.signal, preferWorker: false, runtime: createFakeRuntime() }),
    error => error.name === 'AbortError'
  );
});

test('abort during work stops before completing the result', async () => {
  const controller = new AbortController();
  const runtime = createFakeRuntime({ delay: 2 });
  await assert.rejects(
    () => processor.processPhoto(fakePhoto(), {
      signal: controller.signal,
      preferWorker: false,
      runtime,
      onProgress: update => { if (update.phase === 'tiles' && update.completed > 0) controller.abort(); }
    }),
    error => error.name === 'AbortError'
  );
});
