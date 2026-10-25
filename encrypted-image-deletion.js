(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EncryptedImageDeletion = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // The encrypted storage path is derived from a page manifest, not from the
  // current device's (potentially evicted or empty) IndexedDB cache.
  function objectIdsForManifest(manifest, cryptoApi) {
    if (!manifest || !Array.isArray(manifest.zoom?.levels) || typeof cryptoApi?.tileObjectId !== 'function') {
      throw new Error('画像の保存情報が不正です。');
    }
    const ids = ['preview'];
    for (const level of manifest.zoom.levels) {
      if (!Array.isArray(level.tiles)) throw new Error('画像のタイル情報が不正です。');
      for (const tile of level.tiles) ids.push(cryptoApi.tileObjectId(level.level, tile.x, tile.y));
    }
    if (new Set(ids).size !== ids.length) throw new Error('画像の保存情報に重複があります。');
    return ids;
  }

  // Commit local removal only after every page has a server-side tombstone.
  // A partial remote failure leaves the work locally visible so deletion can
  // be retried. Tombstoned pages are safe to retry idempotently.
  async function deleteWork({ id, items, getPages, cryptoApi, lookupRemote, tombstoneRemote, rememberCleanup, persistLocal }) {
    if (!Array.isArray(items) || !id) throw new Error('作品一覧を読み込めませんでした。');
    const matches = items.filter(item => item?.id === id);
    if (matches.length !== 1 || !matches[0]?.encryptedAssets) throw new Error('削除対象の画像が見つかりません。');
    const item = matches[0];
    const pages = getPages(item).map(page => ({
      ...page, objectIds: objectIdsForManifest(page.manifest, cryptoApi)
    }));
    const assetIds = new Set(pages.map(page => page.assetId));
    if (pages.length === 0 || assetIds.size !== pages.length) throw new Error('画像の保存情報に重複があります。');
    for (const other of items) {
      if (other === item || !other?.encryptedAssets?.pages?.length) continue;
      if (getPages(other).some(page => assetIds.has(page.assetId))) {
        throw new Error('別の作品と画像データを共有しているため削除できません。');
      }
    }
    for (const page of pages) {
      const remote = await lookupRemote(page);
      if (remote && remote.revision !== page.revision) throw new Error('画像が別の端末で更新されています。再同期後に削除してください。');
      if (remote && !remote.deletedAt) {
        const removed = await tombstoneRemote(page);
        if (!removed?.deletedAt) throw new Error('画像のクラウド削除を確認できませんでした。');
      }
      await rememberCleanup(page);
    }
    await persistLocal(items.filter(other => other !== item));
    return { item, pages };
  }

  return Object.freeze({ objectIdsForManifest, deleteWork });
});
