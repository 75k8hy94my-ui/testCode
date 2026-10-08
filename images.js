(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const ITEM_KEY = 'mangaReaderSavedItems';
  const RETRY_KEY = 'mangaReaderEncryptedImageUnsynced';
  const CLEANUP_KEY = 'mangaReaderPendingEncryptedAssetCleanup';
  const api = window.MangaVault;
  const isEncryptedItem = item => !!(item && item.encryptedAssets &&
    item.encryptedAssets.schemaVersion === 1 && Array.isArray(item.encryptedAssets.pages) &&
    item.encryptedAssets.pages.length > 0);
  // Scoped transport policy: this page alone ignores the optional VPN requirement.
  // All other settings and traffic accounting use the real underlying storage.
  function vpnFreeTransferStorage(backing) {
    return {
      getItem(key) {
        return key === 'mangaReaderImageVpnRequired' ? 'false' : backing.getItem(key);
      },
      setItem(key, value) {
        if (key !== 'mangaReaderImageVpnRequired') backing.setItem(key, value);
      },
      removeItem(key) {
        if (key !== 'mangaReaderImageVpnRequired') backing.removeItem(key);
      }
    };
  }

  let cache = null;
  let transport = null;
  let previewLoader = null;
  let renderer = null;
  let activeController = null;
  let selected = null;
  let pageIndex = 0;
  let pageGeneration = 0;
  let galleryGeneration = 0;
  let pendingSync = false;
  let busy = false;
  const transferStorage = vpnFreeTransferStorage(window.localStorage);

  function currentUserId() {
    return String(api.loadSession()?.user?.id || '');
  }
  function imageItems() {
    try {
      const data = JSON.parse(localStorage.getItem(ITEM_KEY) || '[]');
      return Array.isArray(data) ? data.filter(isEncryptedItem) : [];
    } catch (_) { return []; }
  }
  function status(message, error = false) {
    const node = $('imageStatus');
    if (node) { node.textContent = message; node.dataset.error = error ? 'true' : 'false'; }
  }
  function viewerStatus(message, error = false) {
    const node = $('imageViewerStatus');
    if (node) { node.textContent = message; node.dataset.error = error ? 'true' : 'false'; }
  }
  function requireUnlock() {
    const vault = api?.loadActive?.();
    if (!vault?.rawKey) throw new Error('保管庫の解錠が必要です。');
    return vault.rawKey;
  }
  function accessOptions(page) {
    return {
      assetId: page.assetId, revision: page.revision, manifest: page.manifest,
      masterKey: requireUnlock(), vault: api, storage: transport, cache,
      transferStorage, sync: window.EncryptedAssetSync,
      crypto: window.EncryptedAssetCrypto,
      settings: window.ImageTransferSettings,
      remoteAccess: window.ImageRemoteAccess
    };
  }
  function readCleanup() {
    try {
      const entries = JSON.parse(localStorage.getItem(CLEANUP_KEY) || '[]');
      return Array.isArray(entries) ? entries : [];
    } catch (_) { return []; }
  }
  function enqueueCleanup(assetId, revision) {
    const userId = currentUserId();
    if (!userId) return;
    const entries = readCleanup();
    if (entries.some(item => item.userId === userId && item.assetId === assetId && item.revision === revision)) return;
    localStorage.setItem(CLEANUP_KEY, JSON.stringify([...entries, {userId, assetId, revision}].slice(-2000)));
  }
  async function discard({assetId, revision}) {
    try {
      await window.EncryptedAssetSync.discardImportedAsset({
        vault: api, storage: transport, cache, assetId, expectedRevision: revision
      });
    } catch (error) {
      enqueueCleanup(assetId, revision);
      throw error;
    }
  }
  async function retryCleanup() {
    const userId = currentUserId();
    if (!userId) return;
    for (const record of readCleanup().filter(item => item?.userId === userId)) {
      try {
        await discard(record);
        localStorage.setItem(CLEANUP_KEY, JSON.stringify(readCleanup().filter(item =>
          !(item?.userId === userId && item.assetId === record.assetId && item.revision === record.revision))));
      } catch (_) { /* Try again after network availability returns. */ }
    }
  }
  function updateButtons() {
    $('imageUploadButton').disabled = busy || pendingSync;
    $('imageFiles').disabled = busy || pendingSync;
    $('imageTitle').disabled = busy || pendingSync;
    $('imageCancelButton').hidden = !busy;
    $('imageRetrySync').hidden = !pendingSync;
    $('imageRetrySync').disabled = busy;
  }
  async function syncMetadata() {
    requireUnlock();
    await api.savePayload(window.MangaVaultPayload.buildFromLocalStorage());
    pendingSync = false;
    localStorage.removeItem(RETRY_KEY);
    updateButtons();
  }
  async function retrySync() {
    if (busy) return;
    busy = true;
    updateButtons();
    status('本棚情報を暗号化してクラウドに同期しています…');
    try {
      await syncMetadata();
      status('クラウド同期が完了しました。');
    } catch (error) {
      pendingSync = true;
      status('画像は端末と暗号化ストレージに残っています。同期を再試行してください：' +
        (error?.message || '通信エラー'), true);
    } finally { busy = false; updateButtons(); }
  }
  function destroyRenderer() {
    renderer?.destroy?.();
    renderer = null;
  }
  function closeViewer() {
    ++pageGeneration;
    destroyRenderer();
    previewLoader?.retain([]);
    selected = null;
    $('imageViewer').hidden = true;
    $('imageViewerStage').replaceChildren();
  }
  async function showPage(index) {
    if (!selected) return;
    const pages = window.EncryptedAssetItem.encryptedAssetPagesForItem(selected);
    const target = Math.max(0, Math.min(pages.length - 1, index));
    const generation = ++pageGeneration;
    destroyRenderer();
    pageIndex = target;
    const stage = $('imageViewerStage');
    stage.replaceChildren();
    $('imageViewerPage').textContent = (target + 1) + ' / ' + pages.length;
    $('imageViewerPrevious').disabled = target === 0;
    $('imageViewerNext').disabled = target === pages.length - 1;
    viewerStatus('画像を読み込んでいます…');
    const host = document.createElement('div');
    host.style.width = '100%';
    host.style.height = '100%';
    stage.appendChild(host);
    let candidate = null;
    try {
      const options = accessOptions(pages[target]);
      previewLoader.retain([previewLoader.keyFor(options)]);
      const previewResource = await previewLoader.load(options);
      if (generation !== pageGeneration || !selected) return;
      candidate = window.EncryptedAssetReader.createEncryptedAssetReader({
        ...options, container: host,
        previewResourceLoader: { load: async () => previewResource },
        onTileError: () => viewerStatus('拡大画像の一部を読み込めませんでした。', true)
      });
      renderer = candidate;
      candidate.mount();
      await candidate.readyPromise;
      if (generation !== pageGeneration) return;
      viewerStatus('');
    } catch (error) {
      candidate?.destroy?.();
      if (generation === pageGeneration) viewerStatus(error?.message || '画像を読み込めませんでした。', true);
    }
  }
  function openViewer(item) {
    selected = item;
    pageIndex = 0;
    $('imageViewerTitle').textContent = item.title || '画像';
    $('imageViewer').hidden = false;
    void showPage(0);
    $('imageViewerClose').focus();
  }
  async function renderGallery() {
    const generation = ++galleryGeneration;
    const grid = $('imageGrid');
    grid.replaceChildren();
    const items = imageItems().slice().sort((a,b) => (Number(b.addedAt)||0) - (Number(a.addedAt)||0));
    $('imageEmpty').hidden = items.length > 0;
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'imageCard';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      const name = document.createElement('span');
      name.className = 'imageCardName'; name.textContent = item.title || '無題';
      const count = document.createElement('span');
      count.className = 'imageCardCount';
      count.textContent = item.encryptedAssets.pages.length + 'ページ';
      card.append(img,name,count);
      card.addEventListener('click', () => openViewer(item));
      grid.appendChild(card);
      try {
        const page = window.EncryptedAssetItem.encryptedAssetPagesForItem(item)[0];
        const opts = accessOptions(page);
        previewLoader.load(opts).then(entry => {
          if (generation === galleryGeneration && img.isConnected) img.src = entry.url;
        }).catch(() => {
          if (img.isConnected) img.alt = 'プレビューを読み込めませんでした';
        });
      } catch (error) {
        img.alt = '画像の形式を確認してください';
      }
    }
  }
  async function handleUpload(event) {
    event.preventDefault();
    if (busy || pendingSync) return;
    const files = [...$('imageFiles').files];
    const title = $('imageTitle').value.trim();
    if (!files.length || !title) return;
    const controller = new AbortController();
    activeController = controller;
    busy = true;
    updateButtons();
    let item = null;
    let persisted = false;
    status('画像を暗号化しています…');
    try {
      const secret = requireUnlock();
      const service = window.EncryptedAssetImport.create({
        processPhoto: (file, options) => window.ImagePhotoProcessor.processPhoto(file, {
          ...options, preferWorker: true,
          onProgress: progress => status((file.name || '画像') + '：' + progress.phase)
        }),
        stage: ({assetId,targetRevision,processed,signal}) =>
          window.EncryptedAssetSync.stageProcessedRevision({
            cache, masterKey:secret, assetId,targetRevision,processed,signal
          }),
        publish: ({assetId,targetRevision,staged,signal}) =>
          window.EncryptedAssetSync.publishPendingRevision({
            vault:api, storage:transport, cache, assetId,targetRevision,
            objectIds:staged.objectIds,signal,transferStorage
          }),
        tombstone: (assetId,revision) => window.EncryptedAssetSync.tombstoneAsset({
          vault:api,assetId,expectedRevision:revision
        }),
        cleanupAsset: record => discard(record)
      });
      item = await service.importFiles({
        files,title,signal:controller.signal,
        onProgress: progress => status(progress.index + ' / ' + progress.total + 'ページを暗号化保存しました')
      });
      if (controller.signal.aborted) throw Object.assign(new Error('中断しました'),{name:'AbortError'});
      const original = localStorage.getItem(ITEM_KEY);
      let items;
      try { items = JSON.parse(original || '[]'); } catch (_) { items = []; }
      if (!Array.isArray(items)) throw new Error('保存済み作品データが不正です。');
      localStorage.setItem(ITEM_KEY, JSON.stringify([item,...items]));
      persisted = true;
      pendingSync = true;
      localStorage.setItem(RETRY_KEY, currentUserId());
      await renderGallery();
      status('画像を保存しました。保管庫のメタデータをクラウド同期しています…');
      await syncMetadata();
      $('imageUploadForm').reset();
      status('画像を暗号化して保存し、クラウド同期しました。');
    } catch (error) {
      if (item && !persisted) {
        for (const page of item.encryptedAssets.pages) {
          try { await discard(page); } catch (_) {}
        }
      }
      if (persisted) {
        pendingSync = true;
        status('画像は保存されています。クラウド同期を再試行してください：' +
          (error?.message || '通信エラー'), true);
      } else {
        status(error?.name === 'AbortError' ? '追加を中止しました。' :
          (error?.message || '画像を追加できませんでした。'), error?.name !== 'AbortError');
      }
    } finally {
      busy = false;
      activeController = null;
      updateButtons();
    }
  }
  async function initialize() {
    const config = window.MANGA_READER_SUPABASE || {};
    const session = api?.loadSession?.();
    if (!session?.refresh_token || !config.url || !config.publishableKey) {
      location.replace('index.html');
      return;
    }
    let active = api.loadActive();
    if (!active && typeof api.waitForActive === 'function') active = await api.waitForActive(2500);
    if (!active?.rawKey) {
      location.replace('sync.html?next=images.html');
      return;
    }
    try { await api.ensureSession(); }
    catch (error) {
      if (api.isSessionAuthError?.(error)) api.saveSession(null);
      location.replace('index.html');
      return;
    }
    transport = window.EncryptedAssetStorage.createStorageTransport({
      baseUrl:config.url,publishableKey:config.publishableKey
    });
    cache = window.EncryptedAssetCache.createCache();
    previewLoader = window.EncryptedAssetReader.createPreviewLoader({ maxEntries: 40 });
    pendingSync = localStorage.getItem(RETRY_KEY) === currentUserId();
    document.documentElement.classList.remove('auth-pending');
    window.MobileBottomNav?.ensureSpaNav?.($('homeApp'));
    window.AppDesktopRail?.syncActive?.();
    $('imageUploadForm').addEventListener('submit',handleUpload);
    $('imageCancelButton').addEventListener('click',() => {
      activeController?.abort();
      status('アップロードを中止し、暗号化データを整理しています…');
    });
    $('imageRetrySync').addEventListener('click',retrySync);
    $('imageViewerClose').addEventListener('click',closeViewer);
    $('imageViewerPrevious').addEventListener('click',()=>void showPage(pageIndex-1));
    $('imageViewerNext').addEventListener('click',()=>void showPage(pageIndex+1));
    $('imageViewerZoomIn').addEventListener('click',()=>renderer?.setScale(Math.min(4,(renderer?.getState().scale||1)*1.35)));
    $('imageViewerZoomOut').addEventListener('click',()=>renderer?.setScale(Math.max(1,(renderer?.getState().scale||1)/1.35)));
    document.addEventListener('keydown',event=>{
      if ($('imageViewer').hidden) return;
      if (event.key === 'Escape') closeViewer();
      if (event.key === 'ArrowRight') void showPage(pageIndex+1);
      if (event.key === 'ArrowLeft') void showPage(pageIndex-1);
    });
    window.addEventListener('manga-vault-cleared',()=>{
      activeController?.abort();
      previewLoader?.destroy();
      destroyRenderer();
      location.replace('sync.html?next=images.html');
    });
    updateButtons();
    await renderGallery();
    if (pendingSync) status('画像は端末に保存済みです。クラウド同期を再試行してください。',true);
    void retryCleanup();
  }

  window.EncryptedImages = Object.freeze({ isEncryptedItem, vpnFreeTransferStorage, initialize });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{void initialize();},{once:true});
  else void initialize();
})();