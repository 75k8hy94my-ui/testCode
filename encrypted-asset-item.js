(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./encrypted-asset-reader.js') : root.EncryptedAssetReader);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EncryptedAssetItem = api;
}(typeof window !== 'undefined' ? window : globalThis, function (readerApi) {
  'use strict';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function assertUuid(value, name) { if (typeof value !== 'string' || !UUID_RE.test(value)) throw new TypeError(`${name} must be a UUID`); return value.toLowerCase(); }
  function assertRevision(value) { if (!Number.isInteger(value) || value < 1) throw new TypeError('revision must be a positive integer'); return value; }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function validatePage(page) {
    if (!page || typeof page !== 'object' || Array.isArray(page)) throw new TypeError('encrypted asset page is invalid');
    return { assetId: assertUuid(page.assetId, 'assetId'), revision: assertRevision(page.revision), manifest: readerApi.validateManifest(page.manifest) };
  }
  function encryptedAssetPagesForItem(item) {
    if (!item || item.encryptedAssets == null) return null;
    const assets = item.encryptedAssets;
    if (!assets || assets.schemaVersion !== 1 || !Array.isArray(assets.pages) || !assets.pages.length) throw new TypeError('encrypted image information is invalid');
    return assets.pages.map(validatePage);
  }
  function buildEncryptedAssets(pages) {
    if (!Array.isArray(pages) || !pages.length) throw new TypeError('published encrypted pages are required');
    return { schemaVersion: 1, pages: pages.map(validatePage).map((page) => ({ assetId: page.assetId, revision: page.revision, manifest: clone(page.manifest) })) };
  }
  async function publishProcessedPages({ pages, createAssetId = () => crypto.randomUUID(), stage, publish }) {
    if (!Array.isArray(pages) || !pages.length || typeof stage !== 'function' || typeof publish !== 'function') throw new TypeError('pages, stage, and publish are required');
    const published = [];
    for (const processed of pages) {
      const assetId = assertUuid(createAssetId(), 'assetId');
      const targetRevision = 1;
      const staged = await stage({ assetId, targetRevision, processed });
      const result = await publish({ assetId, targetRevision, staged });
      if (!result || result.ok === false) throw new Error('encrypted asset publish failed');
      published.push({ assetId, revision: targetRevision, manifest: clone(processed.manifest) });
    }
    return buildEncryptedAssets(published);
  }
  return { UUID_RE, encryptedAssetPagesForItem, buildEncryptedAssets, publishProcessedPages };
}));
