(() => {
  'use strict';

  const itemApi = typeof require === 'function' ? require('./encrypted-asset-item.js') : window.EncryptedAssetItem;

  function create(dependencies = {}) {
    const processPhoto = dependencies.processPhoto;
    const stage = dependencies.stage;
    const publish = dependencies.publish;
    const tombstone = dependencies.tombstone;
    const cleanupAsset = dependencies.cleanupAsset;
    const createAssetId = dependencies.createAssetId || (() => crypto.randomUUID());
    if (typeof processPhoto !== 'function' || typeof stage !== 'function' || typeof publish !== 'function' || typeof tombstone !== 'function') {
      throw new TypeError('image processing, staging, publishing, and tombstone operations are required');
    }

    async function importFiles({ files, title, onProgress, signal } = {}) {
      const selected = Array.from(files || []);
      const safeTitle = String(title || '').trim();
      if (!selected.length) throw new Error('画像ファイルを選択してください。');
      if (!safeTitle) throw new Error('作品名を入力してください。');
      const pages = [];
      const attemptedAssets = [];
      const aborted = () => Object.assign(new Error('処理を中止しました。'), { name: 'AbortError' });
      try {
        for (let index = 0; index < selected.length; index += 1) {
          if (signal?.aborted) throw Object.assign(new Error('処理を中止しました。'), { name: 'AbortError' });
          onProgress?.({ index, total: selected.length, fileName: selected[index].name || `画像 ${index + 1}`, phase: 'processing' });
          const processed = await processPhoto(selected[index], { signal });
          const assetId = createAssetId();
          const attempt = { assetId, revision: 1, published: false };
          attemptedAssets.push(attempt);
          const staged = await stage({ assetId, targetRevision: 1, processed, signal });
          if (signal?.aborted) throw aborted();
          const result = await publish({ assetId, targetRevision: 1, staged, signal });
          if (!result || result.ok === false) throw new Error('暗号化画像を同期できませんでした。');
          attempt.published = true;
          attempt.revision = Number(result.metadata?.revision) || 1;
          pages.push({ assetId, revision: attempt.revision, manifest: processed.manifest });
          if (signal?.aborted) throw aborted();
          onProgress?.({ index: index + 1, total: selected.length, fileName: selected[index].name || `画像 ${index + 1}`, phase: 'uploaded' });
        }
        if (signal?.aborted) throw aborted();
      } catch (error) {
        const cleanupFailures = [];
        for (const attempt of attemptedAssets.reverse()) {
          try {
            if (typeof cleanupAsset === 'function') await cleanupAsset(attempt);
            else if (attempt.published) await tombstone(attempt.assetId, attempt.revision);
          } catch (cleanupError) {
            cleanupFailures.push(cleanupError);
          }
        }
        if (cleanupFailures.length) {
          error.cleanupFailed = true;
          error.message += ' アップロード済みデータの後始末に失敗しました。';
        }
        throw error;
      }
      return { id: `encrypted-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, title: safeTitle, url: '', pages: [], encryptedAssets: itemApi.buildEncryptedAssets(pages), addedAt: Date.now() };
    }

    return Object.freeze({ importFiles });
  }

  const api = Object.freeze({ create });
  if (typeof window !== 'undefined') window.EncryptedAssetImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
