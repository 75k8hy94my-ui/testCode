import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import readerApi from '../encrypted-asset-reader.js';
const { MIN_SCALE, MAX_SCALE, ZOOM_SETTLE_MS, validateManifest, calculateContainRect, clampTransform, selectZoomLevel, calculateVisibleRect, selectVisibleTiles, selectTileRing, createEncryptedAssetReader } = readerApi;

function manifest() {
  const tiles = [];
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) tiles.push({ x, y, pixelX: x * 512, pixelY: y * 512, width: 512, height: 512, mimeType: 'image/webp', bytes: 100, quality: 0.88 });
  return { schemaVersion: 1, compressionProfileVersion: 1, preview: { width: 1024, height: 768, mimeType: 'image/webp', bytes: 200, quality: 0.6, longEdge: 1024 }, zoom: { tileSize: 512, levels: [{ level: 0, width: 2048, height: 2048, longEdge: 2048, columns: 4, rows: 4, tiles }, { level: 1, width: 4096, height: 4096, longEdge: 4096, columns: 8, rows: 8, tiles: tiles.map((t) => ({ ...t, x: t.x * 2, y: t.y * 2, pixelX: t.pixelX * 2, pixelY: t.pixelY * 2, width: 1024, height: 1024 })) }] } };
}

test('manifest validation accepts stage 1 manifest and rejects malformed geometry', () => {
  const valid = manifest();
  assert.equal(validateManifest(valid), valid);
  assert.throws(() => validateManifest({ ...valid, schemaVersion: 2 }));
  assert.throws(() => validateManifest({ ...valid, preview: { ...valid.preview, width: 0 } }));
  assert.throws(() => validateManifest({ ...valid, zoom: { ...valid.zoom, levels: [{ ...valid.zoom.levels[0], tiles: [valid.zoom.levels[0].tiles[0], valid.zoom.levels[0].tiles[0]] }] } }), /duplicate/);
  assert.throws(() => validateManifest({ ...valid, zoom: { ...valid.zoom, levels: [{ ...valid.zoom.levels[0], tiles: [{ ...valid.zoom.levels[0].tiles[0], x: 4 }] }] } }));
  assert.throws(() => validateManifest({ ...valid, zoom: { ...valid.zoom, levels: [{ ...valid.zoom.levels[0], tiles: [{ ...valid.zoom.levels[0].tiles[0], bytes: 0 }] }] } }));
});

test('contain and transform helpers preserve bounds', () => {
  assert.deepEqual(calculateContainRect({ containerWidth: 1000, containerHeight: 500, imageWidth: 800, imageHeight: 800 }), { width: 500, height: 500, left: 250, top: 0 });
  assert.deepEqual(calculateContainRect({ containerWidth: 500, containerHeight: 1000, imageWidth: 800, imageHeight: 400 }), { width: 500, height: 250, left: 0, top: 375 });
  assert.deepEqual(clampTransform({ scale: 1, translateX: 50, translateY: -50, containerWidth: 500, containerHeight: 500, imageWidth: 500, imageHeight: 500 }), { scale: 1, translateX: 0, translateY: 0 });
  const clamped = clampTransform({ scale: 99, translateX: 9999, translateY: -9999, containerWidth: 500, containerHeight: 500, imageWidth: 500, imageHeight: 500 });
  assert.equal(clamped.scale, MAX_SCALE); assert.equal(clamped.translateX, 750); assert.equal(clamped.translateY, -750);
  assert.equal(MIN_SCALE, 1); assert.equal(MAX_SCALE, 4); assert.equal(ZOOM_SETTLE_MS, 180);
});

test('zoom level selection and visible tile/ring selection are deterministic', () => {
  const m = manifest();
  assert.equal(selectZoomLevel({ manifest: m, scale: 2, renderedWidth: 500, renderedHeight: 500, devicePixelRatio: 2 }).level, 0);
  assert.equal(selectZoomLevel({ manifest: m, scale: 2.1, renderedWidth: 500, renderedHeight: 500, devicePixelRatio: 2 }).level, 1);
  assert.equal(selectZoomLevel({ manifest: m, scale: 10, renderedWidth: 500, renderedHeight: 500, devicePixelRatio: 2 }).level, 1);
  const level = m.zoom.levels[0];
  const center = selectVisibleTiles(level, { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 });
  assert.deepEqual(center.map((t) => `${t.x}:${t.y}`), ['1:1', '2:1', '1:2', '2:2']);
  assert.deepEqual(selectVisibleTiles(level, { x0: 0, y0: 0, x1: 0.2, y1: 0.2 }).map((t) => `${t.x}:${t.y}`), ['0:0']);
  const ring = selectTileRing(level, center, 1).map((t) => `${t.x}:${t.y}`);
  assert.equal(ring.length, 12); assert.ok(!ring.includes('1:1')); assert.ok(!ring.some((id) => id.startsWith('-')));
  const visibleRect = calculateVisibleRect({ scale: 2, translateX: 0, translateY: 0, containerWidth: 500, containerHeight: 500, imageWidth: 500, imageHeight: 500 });
  assert.ok(visibleRect.x0 >= 0 && visibleRect.x1 <= 1);
});

class FakeElement {
  constructor(tag) { this.tagName = tag; this.style = {}; this.children = []; this.parentNode = null; this.clientWidth = 500; this.clientHeight = 500; this.className = ''; this.listeners = new Map(); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; return child; }
  get firstChild() { return this.children[0] || null; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
}

function fakeDom() {
  const revoked = []; let serial = 0;
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  globalThis.URL = { createObjectURL: () => `blob:test-${++serial}`, revokeObjectURL: (url) => revoked.push(url) };
  return { revoked };
}

test('renderer loads preview, keeps it during tile failures, and revokes URLs on destroy', async () => {
  const urls = fakeDom(); const calls = [];
  const sync = { loadDecryptedObject: async (args) => { calls.push(args); if (args.objectId !== 'preview') throw new Error('tile unavailable'); return new Uint8Array([1, 2]); }, loadEncryptedObject: async () => new Uint8Array([3]) };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings: { load: () => ({ networkMode: 'data-saver' }), SAVER_NETWORK_MODE: 'data-saver', STANDARD_NETWORK_MODE: 'standard' }, remoteAccess: { recordPartialSavings() {} }, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'asset', revision: 1, manifest: manifest() });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.filter((call) => call.objectId === 'preview').length, 1);
  assert.match(reader.getState().scale.toString(), /1/);
  reader.setScale(2); await new Promise((resolve) => setTimeout(resolve, 220));
  assert.ok(reader.getState().scale > 1); assert.ok(reader.getState());
  const previewUrl = 'blob:test-1'; reader.destroy(); assert.ok(urls.revoked.includes(previewUrl));
});

test('renderer uses injected estimated bytes and does not request HQ at scale one', async () => {
  fakeDom(); const calls = []; const estimates = [];
  const sync = { loadDecryptedObject: async (args) => { calls.push(args.objectId); estimates.push(args.estimatedBytes); return new Uint8Array([1]); }, loadEncryptedObject: async () => { throw new Error('must not prefetch at scale one'); } };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings: { load: () => ({ networkMode: 'standard' }), SAVER_NETWORK_MODE: 'data-saver', STANDARD_NETWORK_MODE: 'standard' }, remoteAccess: { recordPartialSavings() {} }, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'a', revision: 1, manifest: manifest() });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['preview']); assert.equal(estimates[0], 236); reader.destroy();
});

test('reader source is a classic script', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync('./encrypted-asset-reader.js', 'utf8')));
});
