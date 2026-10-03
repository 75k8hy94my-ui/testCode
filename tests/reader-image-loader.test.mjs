import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { self: {}, setTimeout, clearTimeout, Promise, Map, Set, Date, Error };
vm.runInNewContext(fs.readFileSync(new URL('../reader-image-loader.js', import.meta.url), 'utf8'), context);
const factory = context.self.ReaderImageLoaderFactory;

class FakeImage {
  static instances = [];
  constructor() { this.listeners = new Map(); this.naturalWidth = 100; this.naturalHeight = 150; this.complete = false; FakeImage.instances.push(this); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  set src(value) { this._src = value; }
  get src() { return this._src || ''; }
  dispatch(type) { this.complete = type === 'load'; this.listeners.get(type)?.(); }
  static reset() { FakeImage.instances = []; }
}

function loader(options = {}) {
  FakeImage.reset();
  return factory.create({ Image: FakeImage, nextPaint: () => Promise.resolve(), ...options });
}

async function finishLoad(image) {
  image.dispatch('load');
  await Promise.resolve();
  await Promise.resolve();
}

test('loader shares one in-flight image and returns the same ready image on cache hits', async () => {
  const images = loader();
  const first = images.load('https://img.test/1.jpg');
  const duplicate = images.load('https://img.test/1.jpg');
  assert.equal(first, duplicate);
  assert.equal(FakeImage.instances.length, 1);
  await finishLoad(FakeImage.instances[0]);
  const ready = await first;
  assert.equal(ready, FakeImage.instances[0]);
  assert.equal(await images.load('https://img.test/1.jpg'), ready);
  assert.equal(FakeImage.instances.length, 1);
});

test('decode rejection marks an image failed and retry creates a fresh attempt', async () => {
  const images = loader();
  const first = images.load('https://img.test/bad.jpg');
  FakeImage.instances[0].decode = () => Promise.reject(new Error('decode failed'));
  await finishLoad(FakeImage.instances[0]);
  await assert.rejects(first, /decode failed/);
  assert.equal(images.getState('https://img.test/bad.jpg').status, 'failed');

  const retry = images.retry('https://img.test/bad.jpg');
  assert.equal(FakeImage.instances.length, 2);
  FakeImage.instances[1].decode = () => Promise.resolve();
  await finishLoad(FakeImage.instances[1]);
  assert.equal(await retry, FakeImage.instances[1]);
  assert.equal(images.getState('https://img.test/bad.jpg').status, 'ready');
});

test('preload windows include neighbors and weight the travel direction first', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(factory.preloadWindow(100, 250, 'next'))), [
    100, 101, 99, 102, 103, 98,
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(factory.preloadWindow(1, 250, 'prev'))), [
    1, 2, 3, 4, 5, 6,
  ]);
});

test('loader bounds concurrent work and evicts least recently used ready images', async () => {
  const images = loader({ maxEntries: 2, maxConcurrent: 1 });
  const first = images.load('https://img.test/1.jpg');
  await finishLoad(FakeImage.instances[0]);
  await first;
  const second = images.load('https://img.test/2.jpg');
  await finishLoad(FakeImage.instances[1]);
  await second;
  await images.load('https://img.test/1.jpg'); // touch page 1 so page 2 is least recently used
  const third = images.load('https://img.test/3.jpg');
  assert.equal(FakeImage.instances.length, 3);
  await finishLoad(FakeImage.instances[2]);
  await third;
  assert.equal(images.snapshot().entries.length, 2);
  assert.equal(images.getState('https://img.test/2.jpg').status, 'idle');
  images.destroy();
});

test('load fails when decoded dimensions are unavailable', async () => {
  const images = loader();
  const pending = images.load('https://img.test/zero.jpg');
  FakeImage.instances[0].naturalWidth = 0;
  await finishLoad(FakeImage.instances[0]);
  await assert.rejects(pending, /dimensions/);
  assert.equal(images.getState('https://img.test/zero.jpg').status, 'failed');
});

test('a visible page request preempts a lower-priority stalled preload', async () => {
  const images = loader({ maxConcurrent: 1 });
  images.scheduleWindow(['https://img.test/preload.jpg']);
  const preloadImage = FakeImage.instances[0];
  const visible = images.load('https://img.test/current.jpg', 1000);
  assert.equal(FakeImage.instances.length, 2);
  assert.equal(FakeImage.instances[1].src, 'https://img.test/current.jpg');
  assert.equal(images.getState('https://img.test/preload.jpg').status, 'idle');
  await finishLoad(FakeImage.instances[1]);
  assert.equal(await visible, FakeImage.instances[1]);
  assert.equal(preloadImage.src, '');
  images.destroy();
});

test('successive navigation windows keep loading, queued, and ready entries within the cache cap', () => {
  const images = loader({ maxEntries: 3, maxConcurrent: 3 });
  const displayed = 'https://img.test/current.jpg';
  images.retain([displayed, 'https://img.test/next.jpg']);
  images.scheduleWindow([displayed, 'https://img.test/next.jpg', 'https://img.test/ahead-1.jpg', 'https://img.test/ahead-2.jpg']);
  assert.equal(images.snapshot().entries.length, 3);
  images.retain(['https://img.test/current.jpg', 'https://img.test/far.jpg']);
  images.scheduleWindow(['https://img.test/far.jpg', 'https://img.test/far-next.jpg', 'https://img.test/far-prev.jpg', 'https://img.test/current.jpg']);
  assert.ok(images.snapshot().entries.length <= 3);
  assert.equal(images.snapshot().entries.some((entry) => entry.url === 'https://img.test/far.jpg'), true);
  images.destroy();
});
