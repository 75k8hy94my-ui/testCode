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


  const UPLOAD_PHASES = Object.freeze(['processing', 'encrypt', 'upload', 'register', 'sync']);
  const UPLOAD_LABELS = Object.freeze({
    processing: '画像を加工中', encrypt: '暗号化中', checking: 'サーバーの状態を確認中',
    upload: '暗号化データを送信中', register: 'ページ情報を登録中',
    registered: 'ページの登録確認済み', uploaded: 'ページの登録確認済み',
    sync: '作品一覧をクラウド同期中', cleanup: '中断・失敗したデータを整理中',
    done: 'すべて完了', error: '処理に失敗', canceled: 'キャンセルしました'
  });
  function displayBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return Math.round(bytes) + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  // The classic/default profile retains historical readers and other callers.
  // Image uploads alone use one zoom resolution instead of storing both 2048
  // and 4096-pixel pyramids for each page.
  const IMAGE_UPLOAD_PRESETS = Object.freeze({
    compact: Object.freeze({ longEdge: 2048, quality: 0.68, tileSize: 1024 }),
    balanced: Object.freeze({ longEdge: 3072, quality: 0.76, tileSize: 1024 }),
    detailed: Object.freeze({ longEdge: 4096, quality: 0.82, tileSize: 1024 })
  });
  function createImageUploadProfile(mode, baseProfile = window.ImageCompressionProfile?.getCompressionProfile?.()) {
    const preset = IMAGE_UPLOAD_PRESETS[mode] || IMAGE_UPLOAD_PRESETS.balanced;
    if (!baseProfile?.zoom || !baseProfile?.preview) throw new Error('画像圧縮設定を読み込めませんでした。');
    // A single zoom level is enough; preview still provides instant navigation.
    return {
      ...baseProfile,
      zoom: {
        ...baseProfile.zoom,
        tileSize: preset.tileSize,
        quality: preset.quality,
        intermediateLongEdge: preset.longEdge,
        maximumLongEdge: preset.longEdge
      }
    };
  }

  // This tracker measures confirmed responses rather than guessing the progress
  // of an in-flight HTTP POST. Image-processing "complete" never means uploaded.
  function createUploadProgressTracker(now = () => Date.now()) {
    let current = null;
    const between = (n, low, high) => Math.max(low, Math.min(high, n));
    function start(totalPages) {
      const stamp = now();
      current = {
        phase: 'processing', state: 'running', totalPages: Math.max(0, Math.floor(Number(totalPages) || 0)),
        completedPages: 0, fileIndex: 0, fileName: '', detail: '画像の処理を準備しています',
        startedAt: stamp, lastChangeAt: stamp
      };
      return snapshot();
    }
    function detailText(phase, detail = {}, completedPages = 0, totalPages = 0) {
      const count = Number(detail.completed);
      const total = Number(detail.total);
      const fraction = Number.isInteger(count) && Number.isInteger(total) && total > 0
        ? '（' + count + ' / ' + total + '）' : '';
      if (phase === 'processing') {
        const operation = detail.phase;
        if (operation === 'decode') return '画像ファイルを読み込んでいます' + fraction;
        if (operation === 'preview') return 'プレビュー画像を生成しました';
        if (operation === 'tiles') return '拡大用の画像を作成中' + fraction;
        if (operation === 'pyramid') return '解像度別画像を生成中' + fraction;
        if (operation === 'complete') return '画像加工は完了しました。暗号化・アップロードはこれからです。';
        if (operation === 'size') return '変換後のサイズを確認しました';
        return '画像を読み込み・圧縮しています';
      }
      if (phase === 'encrypt') return 'プレビューと拡大画像を暗号化しています' + fraction;
      if (phase === 'checking') return '保存先の登録状態を問い合わせています';
      if (phase === 'upload') {
        const bytes = Number(detail.confirmedBytes) || 0;
        const size = Number(detail.totalBytes) || 0;
        const wait = Number.isInteger(count) && Number.isInteger(total) && count < total
          ? '。次のファイルの送信・応答待ち' : '';
        return '送信を確認したファイル ' + (Number.isInteger(count) ? count : 0) +
          ' / ' + (Number.isInteger(total) ? total : '確認中') +
          (size > 0 ? '、応答確認済み ' + displayBytes(bytes) + ' / ' + displayBytes(size) : '') + wait;
      }
      if (phase === 'register') return '暗号化ファイルの送信後、サーバーへのページ登録完了を待っています';
      if (phase === 'registered') return 'サーバーからページ登録完了の応答を受信しました';
      if (phase === 'uploaded') return 'ページ登録を確認しました（' + completedPages + ' / ' + totalPages + 'ページ）';
      if (phase === 'sync') return '全ページの登録後、作品一覧を保管庫へ保存しています';
      if (phase === 'cleanup') return 'アップロード済みデータを確認し、不要なデータを削除しています';
      if (phase === 'done') return '画像の登録と作品一覧のクラウド同期が完了しました';
      if (phase === 'canceled') return 'アップロードを中断しました';
      if (phase === 'error') return '処理は完了していません。表示されたエラー内容を確認してください';
      return '';
    }
    function update(event = {}) {
      if (!current) start(event.total ?? 0);
      const phase = UPLOAD_LABELS[event.phase] ? event.phase : current.phase;
      const totalPages = Number.isInteger(event.total) && event.total >= 0 ? event.total : current.totalPages;
      const completed = Number.isInteger(event.completedPages) ?
        between(event.completedPages, current.completedPages, totalPages) : current.completedPages;
      const index = Number.isInteger(event.fileIndex) ? event.fileIndex :
        (Number.isInteger(event.index) ? event.index : current.fileIndex);
      current = {
        ...current, phase, totalPages, completedPages: completed,
        fileIndex: between(index, 0, Math.max(totalPages - 1, 0)),
        fileName: event.fileName == null ? current.fileName : String(event.fileName),
        detail: event.message || detailText(phase, event.detail || {}, completed, totalPages),
        lastChangeAt: now()
      };
      if (phase === 'done') current.state = 'done';
      else if (phase === 'error') current.state = 'error';
      else if (phase === 'canceled') current.state = 'canceled';
      return snapshot();
    }
    function snapshot() {
      if (!current) return null;
      const elapsed = Math.max(0, Math.floor((now() - current.startedAt) / 1000));
      const idle = Math.max(0, Math.floor((now() - current.lastChangeAt) / 1000));
      const phaseIndex = UPLOAD_PHASES.indexOf(current.phase);
      const index = current.phase === 'checking' ? 2 :
        (current.phase === 'registered' || current.phase === 'uploaded' ? 3 : phaseIndex);
      return {
        ...current, elapsedSeconds: elapsed, idleSeconds: idle,
        label: UPLOAD_LABELS[current.phase],
        stageIndex: index, waiting: current.state === 'running' && idle >= 30
      };
    }
    return Object.freeze({ start, update, snapshot });
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

  let uploadProgress = null;
  let uploadProgressInterval = null;
  function formatSeconds(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    if (total < 60) return total + '秒';
    return Math.floor(total / 60) + '分' + String(total % 60).padStart(2, '0') + '秒';
  }
  function renderUploadProgress() {
    const info = uploadProgress?.snapshot();
    const panel = $('imageUploadProgress');
    if (!panel || !info) return;
    panel.hidden = false;
    panel.dataset.status = info.state === 'running' ? 'running' : info.state;
    $('imageProgressState').textContent = info.label;
    $('imageProgressElapsed').textContent = '経過 ' + formatSeconds(info.elapsedSeconds);
    $('imageProgressFile').textContent = info.fileName
      ? '処理対象：' + info.fileName + '（' + Math.min(info.fileIndex + 1, info.totalPages) + ' / ' + info.totalPages + 'ページ目）'
      : (info.totalPages === 0 ? '画像本体の再送信はありません' : '全' + info.totalPages + 'ページ');
    const bar = $('imagePageProgress');
    bar.hidden = info.totalPages === 0;
    bar.max = Math.max(1, info.totalPages);
    bar.value = Math.min(info.completedPages, bar.max);
    $('imageProgressCount').textContent = info.totalPages
      ? 'サーバー登録確認済み：' + info.completedPages + ' / ' + info.totalPages + 'ページ'
      : '画像本体は保存済み（再送信なし）';
    $('imageProgressActivity').textContent = info.state === 'running'
      ? '最終進捗更新：' + formatSeconds(info.idleSeconds) + '前'
      : (info.state === 'done' ? 'すべての保存完了を確認' : '処理は終了しています');
    $('imageProgressDetail').textContent = info.detail;
    $('imageProgressSteps').querySelectorAll('li[data-upload-stage]').forEach((item,index) => {
      const state = info.state === 'done' ? 'complete'
        : info.state === 'running' && info.stageIndex >= 0
          ? (index < info.stageIndex ? 'complete' : index === info.stageIndex ? 'active' : 'pending')
          : 'pending';
      item.dataset.state = state;
      if (state === 'active') item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    $('imageProgressHint').textContent = info.waiting
      ? '30秒以上進捗更新がありません。現在の段階で通信の応答または画像処理を待機している可能性があります。処理が完了したとは限りません。'
      : info.state === 'done' ? '画像のサーバー登録と作品一覧のクラウド同期が完了しました。'
      : info.state === 'error' ? '処理は正常完了していません。エラー内容と再試行ボタンを確認してください。'
      : info.state === 'canceled' ? 'アップロードを中止しました。新しい操作を開始できます。'
      : '画像加工の「complete」はアップロード完了ではありません。ページ登録・一覧同期まで確認します。';
  }
  function startUploadProgress(totalPages) {
    if (uploadProgressInterval != null) {
      window.clearInterval(uploadProgressInterval);
      uploadProgressInterval = null;
    }
    uploadProgress = createUploadProgressTracker();
    uploadProgress.start(totalPages);
    renderUploadProgress();
    uploadProgressInterval = window.setInterval(renderUploadProgress, 1000);
  }
  function reportUploadProgress(event) {
    if (!uploadProgress) return;
    if (activeController?.signal?.aborted && !['cleanup','canceled','error'].includes(event?.phase)) return;
    uploadProgress.update(event);
    renderUploadProgress();
    updateButtons();
  }
  function finishUploadProgress(phase, message) {
    if (!uploadProgress) return;
    uploadProgress.update({ phase, message });
    if (uploadProgressInterval != null) {
      window.clearInterval(uploadProgressInterval);
      uploadProgressInterval = null;
    }
    renderUploadProgress();
  }


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
    $('imageCancelButton').hidden = !busy || !activeController || pendingSync ||
      ['sync', 'cleanup', 'done', 'error'].includes(uploadProgress?.snapshot()?.phase);
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
    startUploadProgress(0);
    reportUploadProgress({ phase: 'sync', message: '画像の再アップロードなしで作品一覧だけを同期しています' });
    updateButtons();
    status('作品一覧のクラウド同期を再試行しています…');
    try {
      await syncMetadata();
      finishUploadProgress('done', '作品一覧のクラウド同期が完了しました（画像の再送信なし）');
      status('クラウド同期が完了しました。');
    } catch (error) {
      pendingSync = true;
      finishUploadProgress('error', '作品一覧の同期に失敗しました。画像本体は保存済みです。');
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
    // Snapshot selected quality; changing a field cannot alter a running import.
    const profile = createImageUploadProfile($('imageQualityMode').value);
    let processedTotalBytes = 0;
    let encryptedParts = 0;
    const controller = new AbortController();
    activeController = controller;
    busy = true;
    startUploadProgress(files.length);
    $('imageUploadSize').textContent = '画像の容量を計測しています…';
    updateButtons();
    let item = null;
    let persisted = false;
    status('アップロード処理中です。各段階の進捗を下に表示しています。');
    try {
      const secret = requireUnlock();
      const service = window.EncryptedAssetImport.create({
        processPhoto: (file, options) => window.ImagePhotoProcessor.processPhoto(file, {
          ...options, profile, preferWorker: true, onProgress: options.onProgress
        }),
        stage: ({assetId,targetRevision,processed,signal,onProgress}) =>
          window.EncryptedAssetSync.stageProcessedRevision({
            cache, masterKey:secret, assetId,targetRevision,processed,signal,onProgress
          }),
        publish: ({assetId,targetRevision,staged,signal,onProgress}) =>
          window.EncryptedAssetSync.publishPendingRevision({
            vault:api, storage:transport, cache, assetId,targetRevision,
            objectIds:staged.objectIds,signal,transferStorage,onProgress
          }),
        tombstone: (assetId,revision) => window.EncryptedAssetSync.tombstoneAsset({
          vault:api,assetId,expectedRevision:revision
        }),
        cleanupAsset: record => discard(record)
      });
      item = await service.importFiles({
        files,title,signal:controller.signal,
        onProgress: progress => {
          if (progress.phase === 'processing' && progress.detail?.phase === 'size') {
            const size = progress.detail;
            processedTotalBytes += size.outputBytes;
            encryptedParts += size.parts;
            $('imageUploadSize').textContent =
              '保存用画像の合計：' + displayBytes(processedTotalBytes) +
              '（' + encryptedParts + 'ファイル、暗号化前。通信量は少し増えます）' +
              ' ／ 現在のページ：元 ' + displayBytes(size.originalBytes) +
              ' → 変換後 ' + displayBytes(size.outputBytes);
          }
          reportUploadProgress(progress);
        }
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
      reportUploadProgress({
        phase: 'sync', completedPages: files.length, total: files.length,
        message: '全ページの登録完了を確認しました。作品一覧を保管庫へ同期しています'
      });
      await renderGallery();
      status('全ページの登録が完了しました。作品一覧のクラウド同期を確認中です…');
      await syncMetadata();
      finishUploadProgress('done');
      $('imageUploadForm').reset();
      status('画像を暗号化して保存し、クラウド同期しました。');
    } catch (error) {
      if (item && !persisted) {
        reportUploadProgress({ phase: 'cleanup', message: '登録済み画像を整理しています…' });
        for (const page of item.encryptedAssets.pages) {
          try { await discard(page); } catch (_) {}
        }
      }
      if (persisted) {
        pendingSync = true;
        finishUploadProgress('error', '画像は保存済みですが、作品一覧のクラウド同期が完了していません');
        status('画像は保存されています。クラウド同期を再試行してください：' +
          (error?.message || '通信エラー'), true);
      } else {
        const canceled = !error?.cleanupFailed && (error?.name === 'AbortError' || controller.signal.aborted);
        finishUploadProgress(canceled ? 'canceled' : 'error',
          canceled ? '処理を中断しました。未完了の画像は保存済み作品に追加していません' :
          '処理を完了できませんでした：' + (error?.message || '不明なエラー'));
        status(canceled ? '追加を中止しました。' :
          (error?.message || '画像を追加できませんでした。'), !canceled);
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
      if (!activeController || !busy || pendingSync) return;
      activeController.abort();
      reportUploadProgress({ phase: 'cleanup', message: '中断要求を送信しました。アップロード済みのデータを整理しています' });
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

  window.EncryptedImages = Object.freeze({ isEncryptedItem, vpnFreeTransferStorage, createImageUploadProfile, createUploadProgressTracker, initialize });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>{void initialize();},{once:true});
  else void initialize();
})();