import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import processor from '../image-photo-processor.js';
import worker from '../image-processing-worker.js';

function fakePhoto() {
  return { name: 'photo.jpg', type: 'image/jpeg', size: 500000, width: 1900, height: 1200 };
}

function fakeRuntime() {
  return {
    async decode() { return { source: {}, width: 1900, height: 1200, close() {} }; },
    createCanvas(width, height) { return { width, height }; },
    drawImage() {},
    async encode(canvas, type) { return new Blob(['x'], { type }); },
    releaseCanvas() {}
  };
}

function workerFactoryWith(handler) {
  return () => {
    const listeners = { message: [], error: [] };
    return {
      addEventListener(type, listener) { listeners[type].push(listener); },
      removeEventListener(type, listener) { listeners[type] = listeners[type].filter(candidate => candidate !== listener); },
      postMessage(message) {
        handler(message, payload => listeners.message.forEach(listener => listener({ data: payload })));
      },
      terminate() {}
    };
  };
}

test('worker and fallback expose the same result contract and geometry', async () => {
  const runtime = fakeRuntime();
  const workerHandler = worker.createWorkerMessageHandler({ process: options => processor.processPhotoOnMainThread(options.file, { ...options, runtime }) });
  const workerResult = await processor.processPhoto(fakePhoto(), {
    preferWorker: true,
    workerFactory: workerFactoryWith((message, send) => workerHandler(message, send))
  });
  const fallbackResult = await processor.processPhoto(fakePhoto(), { preferWorker: false, runtime });
  assert.deepEqual(Object.keys(workerResult.manifest), Object.keys(fallbackResult.manifest));
  assert.deepEqual(workerResult.manifest.zoom, fallbackResult.manifest.zoom);
  assert.equal(workerResult.previewBlob.type, fallbackResult.previewBlob.type);
  assert.equal(workerResult.tileBlobs.length, fallbackResult.tileBlobs.length);
});

test('worker construction failure falls back to main-thread processing', async () => {
  const result = await processor.processPhoto(fakePhoto(), {
    preferWorker: true,
    workerFactory: () => { throw new Error('worker unavailable'); },
    runtime: fakeRuntime()
  });
  assert.equal(result.manifest.schemaVersion, 1);
  assert.equal(result.manifest.zoom.levels.length, 1);
});

test('worker runtime error falls back without changing the result contract', async () => {
  const result = await processor.processPhoto(fakePhoto(), {
    preferWorker: true,
    workerFactory: workerFactoryWith((message, send) => send({ type: 'error', error: { message: 'worker failed' } })),
    runtime: fakeRuntime()
  });
  assert.equal(result.manifest.compressionProfileVersion, 1);
  assert.ok(result.previewBlob instanceof Blob);
});

test('abort terminates worker and does not fall back as a successful result', async () => {
  const controller = new AbortController();
  let terminated = false;
  const resultPromise = processor.processPhoto(fakePhoto(), {
    preferWorker: true,
    signal: controller.signal,
    workerFactory: () => ({
      addEventListener() {},
      removeEventListener() {},
      postMessage() { controller.abort(); },
      terminate() { terminated = true; }
    }),
    runtime: fakeRuntime()
  });
  await assert.rejects(resultPromise, error => error.name === 'AbortError');
  assert.equal(terminated, true);
});

test('new worker scripts are classic-script parseable', () => {
  for (const file of ['image-compression-profile.js', 'image-pyramid-builder.js', 'image-photo-processor.js', 'image-processing-worker.js']) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { filename: file }));
  }
});
