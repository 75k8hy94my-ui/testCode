import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import itemApi from '../encrypted-asset-item.js';

const uuid = '6dc3773a-a3ef-4bb8-9cbf-15096098db20';
const manifest = { schemaVersion: 1, compressionProfileVersion: 1, preview: { width: 1440, height: 960, mimeType: 'image/webp', bytes: 100, quality: 0.6, longEdge: 1440 }, zoom: { tileSize: 512, levels: [] } };

test('valid encrypted item pages normalize without plaintext binary fields', () => {
  const pages = itemApi.encryptedAssetPagesForItem({ encryptedAssets: { schemaVersion: 1, pages: [{ assetId: uuid.toUpperCase(), revision: 1, manifest }] } });
  assert.equal(pages[0].assetId, uuid);
  assert.deepEqual(pages[0].manifest, manifest);
  assert.equal('data' in pages[0].manifest, false);
});

test('missing encryptedAssets falls through as legacy while invalid assets fail closed', () => {
  assert.equal(itemApi.encryptedAssetPagesForItem({ pages: ['https://example.test/1.jpg'] }), null);
  assert.throws(() => itemApi.encryptedAssetPagesForItem({ storagePaths: ['x'], encryptedAssets: { schemaVersion: 1, pages: [{ assetId: 'bad', revision: 1, manifest }] } }), /invalid|UUID/);
  assert.throws(() => itemApi.encryptedAssetPagesForItem({ encryptedAssets: { schemaVersion: 1, pages: [{ assetId: uuid, revision: 0, manifest }] } }), /revision/);
  assert.throws(() => itemApi.encryptedAssetPagesForItem({ encryptedAssets: { schemaVersion: 1, pages: [{ assetId: uuid, revision: 1, manifest: { ...manifest, schemaVersion: 2 } }] } }), /manifest|version/);
});

test('published pages are assembled only after each page publish succeeds', async () => {
  const events = [];
  const result = await itemApi.publishProcessedPages({ pages: [{ manifest, previewBlob: new Uint8Array([1]), tileBlobs: [] }, { manifest, previewBlob: new Uint8Array([2]), tileBlobs: [] }], createAssetId: (() => { let n = 0; return () => `6dc3773a-a3ef-4bb8-9cbf-15096098db2${n++}`; })(), stage: async (args) => { events.push(`stage:${args.assetId}`); return args; }, publish: async ({ assetId }) => { events.push(`publish:${assetId}`); return { ok: true }; } });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.pages.length, 2);
  assert.deepEqual(events.map((event) => event.split(':')[0]), ['stage', 'publish', 'stage', 'publish']);
});

test('item module remains a classic script', () => { assert.doesNotThrow(() => new Function(fs.readFileSync('./encrypted-asset-item.js', 'utf8'))); });
