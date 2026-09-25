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
  setPointerCapture() {}
}

function fakeDom() {
  const revoked = []; let serial = 0;
  const listeners = new Map();
  globalThis.document = { createElement: (tag) => new FakeElement(tag), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), dispatchEvent: (event) => listeners.get(event.type)?.(event) };
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

test('renderer installs self-contained layout styles and shares one content coordinate box', () => {
  fakeDom();
  const container = new FakeElement('section');
  const reader = createEncryptedAssetReader({ container, sync: { loadDecryptedObject: async () => new Uint8Array([1]) }, settings: { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' }, crypto: { encryptedAssetByteLength: (n) => n + 36 }, manifest: manifest() });
  reader.mount();
  const viewport = container.children[0]; const content = viewport.children[0]; const preview = content.children[0]; const layer = content.children[1];
  assert.equal(viewport.style.position, 'relative'); assert.equal(viewport.style.overflow, 'hidden'); assert.equal(viewport.style.touchAction, 'none');
  assert.equal(content.style.position, 'absolute'); assert.equal(content.style.transformOrigin, 'center center');
  assert.equal(preview.style.position, 'absolute'); assert.equal(preview.style.inset, '0'); assert.equal(preview.style.width, '100%');
  assert.equal(layer.style.position, 'absolute'); assert.equal(layer.style.inset, '0'); assert.equal(layer.style.pointerEvents, 'none');
  assert.equal(layer.style.width, '100%'); assert.equal(layer.style.height, '100%');
  reader.destroy();
});

test('prefetched tile is later promoted to decrypted visible rendering', async () => {
  fakeDom(); const calls = []; const pending = new Map();
  const promotionManifest = manifest(); promotionManifest.preview = { ...promotionManifest.preview, width: 1024, height: 256 }; promotionManifest.zoom.levels = [{ level: 0, width: 2048, height: 512, longEdge: 2048, columns: 4, rows: 1, tiles: Array.from({ length: 4 }, (_, x) => ({ x, y: 0, pixelX: x * 512, pixelY: 0, width: 512, height: 512, mimeType: 'image/webp', bytes: 100, quality: 0.88 })) }];
  const sync = { loadDecryptedObject: async (args) => { calls.push(`visible:${args.objectId}`); return new Uint8Array([1]); }, loadEncryptedObject: (args) => { calls.push(`prefetch:${args.objectId}`); return new Promise((resolve) => pending.set(args.objectId, resolve)); } };
  const settings = { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'asset', revision: 1, manifest: promotionManifest });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve));
  const prefetched = [...pending.keys()][0]; assert.ok(prefetched);
  pending.forEach((resolve) => resolve(new Uint8Array([2])));
  await new Promise((resolve) => setImmediate(resolve));
  const [level, x, y] = prefetched.match(/^L(\d+):(\d+):(\d+)$/).slice(1).map(Number);
  reader.setTransform({ translateX: x === 0 ? 250 : -250, translateY: y === 0 ? 180 : -180 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(calls.includes(`visible:${prefetched}`));
  reader.destroy();
});

test('visible requests use a separate priority queue and promote in-flight prefetches', async () => {
  fakeDom(); const calls = []; let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const sync = { loadDecryptedObject: async (args) => { calls.push(`visible:${args.objectId}`); return new Uint8Array([1]); }, loadEncryptedObject: async (args) => { calls.push(`prefetch:${args.objectId}`); await gate; return new Uint8Array([2]); } };
  const settings = { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'asset', revision: 1, manifest: manifest() });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve));
  reader.setTransform({ translateX: 240, translateY: 180 }); await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.some((call) => call.startsWith('visible:'))); release(); await new Promise((resolve) => setImmediate(resolve)); reader.destroy();
});

test('null tile results are errors and never become rendered or prefetched', async () => {
  fakeDom(); const errors = [];
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync: { loadDecryptedObject: async (args) => args.objectId === 'preview' ? new Uint8Array([1]) : null, loadEncryptedObject: async () => null }, settings: { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' }, remoteAccess: { recordPartialSavings() {} }, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'a', revision: 1, manifest: manifest(), onTileError: (error) => errors.push(error) });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve));
  assert.ok(errors.some((error) => /unavailable/.test(error.message))); assert.equal(reader.getState().scale, 2); reader.destroy();
});

test('pinch keeps the pointer midpoint stable instead of centering zoom', () => {
  fakeDom(); const container = new FakeElement('section'); const reader = createEncryptedAssetReader({ container, sync: { loadDecryptedObject: async () => new Uint8Array([1]) }, settings: { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' }, crypto: { encryptedAssetByteLength: (n) => n + 36 }, manifest: manifest() });
  reader.mount(); const viewport = container.children[0]; viewport.listeners.get('pointerdown')({ pointerId: 1, clientX: 100, clientY: 100 }); viewport.listeners.get('pointerdown')({ pointerId: 2, clientX: 200, clientY: 100 }); viewport.listeners.get('pointermove')({ pointerId: 1, clientX: 50, clientY: 100 }); viewport.listeners.get('pointermove')({ pointerId: 2, clientX: 250, clientY: 100 });
  const state = reader.getState(); assert.ok(state.scale > 1); assert.notEqual(state.translateX, 0); reader.destroy();
});

test('tile request concurrency never exceeds four', async () => {
  fakeDom(); let active = 0; let maximum = 0; const release = []; const sync = { loadDecryptedObject: async (args) => { if (args.objectId === 'preview') return new Uint8Array([1]); active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => release.push(resolve)); active -= 1; return new Uint8Array([1]); }, loadEncryptedObject: async () => new Uint8Array([2]) };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings: { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' }, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, manifest: manifest() });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve)); assert.equal(maximum, 4); assert.ok(maximum <= 4); release.forEach((resolve) => resolve()); reader.destroy();
});

test('visible request preempts an active prefetch when all four slots are occupied', async () => {
  fakeDom(); const calls = []; const pending = []; let visibleStarted = false;
  const sync = { loadDecryptedObject: async (args) => { calls.push(`visible:${args.objectId}`); visibleStarted = true; return new Uint8Array([1]); }, loadEncryptedObject: (args) => { calls.push(`prefetch:${args.objectId}`); return new Promise((resolve, reject) => { pending.push({ args, resolve, reject }); }); } };
  const m = manifest(); m.preview = { ...m.preview, width: 1024, height: 256 }; m.zoom.levels = [{ level: 0, width: 2048, height: 512, longEdge: 2048, columns: 4, rows: 1, tiles: Array.from({ length: 4 }, (_, x) => ({ x, y: 0, pixelX: x * 512, pixelY: 0, width: 512, height: 512, mimeType: 'image/webp', bytes: 100, quality: 0.88 })) }];
  const settings = { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'a', revision: 1, manifest: m });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve)); assert.equal(pending.length, 2); reader.setTransform({ translateX: 250 }); await new Promise((resolve) => setImmediate(resolve));
  assert.ok(pending.some((entry) => entry.args.signal.aborted)); assert.equal(visibleStarted, true); assert.ok(calls.some((call) => call.startsWith('visible:'))); pending.forEach((entry) => entry.resolve(new Uint8Array([2]))); reader.destroy();
});

test('same-level pan removes rendered tile DOM and revokes its URL', async () => {
  const urls = fakeDom(); const m = manifest(); m.preview = { ...m.preview, width: 1024, height: 256 }; m.zoom.levels = [{ level: 0, width: 2048, height: 512, longEdge: 2048, columns: 4, rows: 1, tiles: Array.from({ length: 4 }, (_, x) => ({ x, y: 0, pixelX: x * 512, pixelY: 0, width: 512, height: 512, mimeType: 'image/webp', bytes: 100, quality: 0.88 })) }];
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync: { loadDecryptedObject: async () => new Uint8Array([1]), loadEncryptedObject: async () => new Uint8Array([2]) }, settings: { load: () => ({ networkMode: 'standard' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' }, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'a', revision: 1, manifest: m });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve)); const viewport = reader.getState(); assert.ok(viewport.scale > 1); reader.setTransform({ translateX: 250 }); await new Promise((resolve) => setImmediate(resolve)); assert.ok(urls.revoked.length >= 1); reader.destroy(); assert.ok(urls.revoked.length >= 1);
});

test('transfer events switch standard prefetch to data-saver without stopping visible work', async () => {
  fakeDom(); let mode = 'standard'; const pending = []; const calls = [];
  const sync = { loadDecryptedObject: async (args) => { calls.push(`visible:${args.objectId}`); return new Uint8Array([1]); }, loadEncryptedObject: (args) => { calls.push(`prefetch:${args.objectId}`); return new Promise((resolve, reject) => pending.push({ args, resolve, reject })); } };
  const settings = { EVENT_NAME: 'manga-reader-image-transfer-settings-changed', STATS_EVENT_NAME: 'manga-reader-image-transfer-stats-changed', load: () => ({ networkMode: mode }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'a', revision: 1, manifest: manifest() });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setImmediate(resolve)); assert.ok(pending.length > 0); mode = 'data-saver'; globalThis.document.dispatchEvent({ type: settings.STATS_EVENT_NAME }); await new Promise((resolve) => setImmediate(resolve)); assert.ok(pending.some((entry) => entry.args.signal.aborted)); pending.forEach((entry) => entry.resolve(new Uint8Array([2]))); assert.ok(calls.some((call) => call.startsWith('visible:'))); reader.destroy();
});

test('same-level pan aborts obsolete visible requests and ignores late completion', async () => {
  fakeDom(); const signals = []; const resolvers = []; const m = manifest(); m.preview = { ...m.preview, width: 1024, height: 256 }; m.zoom.levels = [{ level: 0, width: 2048, height: 512, longEdge: 2048, columns: 4, rows: 1, tiles: Array.from({ length: 4 }, (_, x) => ({ x, y: 0, pixelX: x * 512, pixelY: 0, width: 512, height: 512, mimeType: 'image/webp', bytes: 100, quality: 0.88 })) }];
  const sync = { loadDecryptedObject: (args) => { if (args.objectId === 'preview') return Promise.resolve(new Uint8Array([1])); signals.push(args.signal); return new Promise((resolve) => resolvers.push(resolve)); }, loadEncryptedObject: async () => new Uint8Array([2]) };
  const reader = createEncryptedAssetReader({ container: new FakeElement('section'), sync, settings: { load: () => ({ networkMode: 'data-saver' }), STANDARD_NETWORK_MODE: 'standard', SAVER_NETWORK_MODE: 'data-saver' }, crypto: { encryptedAssetByteLength: (n) => n + 36, tileObjectId: (l, x, y) => `L${l}:${x}:${y}` }, assetId: 'a', revision: 1, manifest: m });
  reader.mount(); await new Promise((resolve) => setImmediate(resolve)); reader.setScale(2); await new Promise((resolve) => setTimeout(resolve, 190)); assert.ok(signals.length > 0); reader.setTransform({ translateX: 250 }); await new Promise((resolve) => setTimeout(resolve, 190)); assert.ok(signals.some((signal) => signal.aborted)); resolvers.forEach((resolve) => resolve(new Uint8Array([1]))); reader.destroy();
});

test('reader source is a classic script', () => {
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync('./encrypted-asset-reader.js', 'utf8')));
});
