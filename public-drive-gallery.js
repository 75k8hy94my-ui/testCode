(() => {
  'use strict';
  const api = window.PublicDriveGallery;
  const cryptoSettings = window.PublicDriveGalleryVault;
  const vaultApi = window.MangaVault;
  const vaultPayload = window.MangaVaultPayload;
  const settingsStorageKey = vaultPayload.DATA_KEYS.driveGalleryEncrypted;
  const syncStatus = document.getElementById('driveSyncStatus');
  let saving = false;
  const byId = (id) => document.getElementById(id);
  const form = byId('driveGalleryForm');
  const folderInput = byId('driveFolder');
  const keyInput = byId('driveApiKey');
  const loadButton = byId('driveLoad');
  const cancelButton = byId('driveCancel');
  const status = byId('driveGalleryStatus');
  const count = byId('driveGalleryCount');
  const grid = byId('driveGalleryGrid');
  const empty = byId('driveGalleryEmpty');
  const viewer = byId('driveViewer');
  const viewerImage = byId('driveViewerImage');
  let controller = null;
  let files = [];
  let viewerIndex = -1;
  let restoreFocus = null;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.error = error ? 'true' : 'false';
  }
  function loading(value) {
    loadButton.disabled = value;
    cancelButton.hidden = !value;
    loadButton.textContent = value ? '取得中…' : '設定を暗号化・同期して読み込む';
  }
  function setSyncStatus(message, error = false) {
    syncStatus.textContent = message;
    syncStatus.dataset.error = error ? 'true' : 'false';
  }
  function vaultKey() {
    const active = vaultApi?.loadActive?.();
    if (!active?.rawKey) throw new Error('保管庫の解錠が必要です。');
    return active.rawKey;
  }
  async function persistSettings(settings) {
    // Only an AES-GCM envelope is stored on the device; plaintext never goes to localStorage.
    const encrypted = await cryptoSettings.encryptSettings(vaultKey(), settings);
    if (!vaultApi.loadActive()) throw new Error('保管庫がロックされています。再度解錠してください。');
    localStorage.setItem(settingsStorageKey, JSON.stringify(encrypted));
    setSyncStatus('暗号化した設定をクラウドへ同期しています…');
    try {
      await vaultApi.savePayload(vaultPayload.buildFromLocalStorage());
      setSyncStatus('APIキーとフォルダを暗号化してクラウド同期しました。');
    } catch (error) {
      // Keep only the encrypted local value so a later explicit save can retry.
      setSyncStatus('端末には暗号化保存済みですが、クラウド同期に失敗しました。再度保存してください。' +
        (error?.message ? ' ' + error.message : ''), true);
    }
  }
  function attachImageFallback(img, id, failureCallback) {
    const urls = api.imageUrls(id);
    let triedFallback = false;
    img.onerror = () => {
      if (!triedFallback) {
        triedFallback = true;
        img.src = urls.thumbnail;
      } else {
        img.onerror = null;
        if (failureCallback) failureCallback();
      }
    };
    img.src = urls.direct;
  }
  function displayImages(images) {
    const fragment = document.createDocumentFragment();
    images.forEach((file, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'driveTile';
      card.title = file.name;
      card.setAttribute('aria-label', file.name + 'を表示');
      const img = document.createElement('img');
      img.alt = file.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      attachImageFallback(img, file.id, () => {
        img.remove();
        const placeholder = document.createElement('span');
        placeholder.className = 'driveImageUnavailable';
        placeholder.textContent = 'プレビュー不可（画像を開いて確認）';
        card.prepend(placeholder);
      });
      const title = document.createElement('span');
      title.textContent = file.name;
      card.append(img, title);
      card.addEventListener('click', () => openViewer(index));
      fragment.append(card);
    });
    grid.replaceChildren(fragment);
    count.textContent = images.length + '枚';
    empty.hidden = images.length !== 0;
  }
  function updateViewer() {
    const file = files[viewerIndex];
    if (!file) return;
    byId('driveViewerTitle').textContent = file.name;
    byId('driveViewerPosition').textContent = (viewerIndex + 1) + ' / ' + files.length;
    byId('driveViewerPrev').disabled = viewerIndex === 0;
    byId('driveViewerNext').disabled = viewerIndex === files.length - 1;
    byId('driveViewerOriginal').href = api.imageUrls(file.id).drive;
    const message = byId('driveViewerMessage');
    message.textContent = '';
    viewerImage.alt = file.name;
    attachImageFallback(viewerImage, file.id, () => {
      viewerImage.removeAttribute('src');
      message.textContent = '直接表示できません。必要なら「Driveで開く」を使用してください。';
    });
  }
  function openViewer(index) {
    if (index < 0 || index >= files.length) return;
    restoreFocus = document.activeElement;
    viewerIndex = index;
    viewer.hidden = false;
    document.body.classList.add('driveViewerOpen');
    updateViewer();
    byId('driveViewerClose').focus();
  }
  function closeViewer() {
    viewer.hidden = true;
    document.body.classList.remove('driveViewerOpen');
    viewerImage.removeAttribute('src');
    viewerIndex = -1;
    if (restoreFocus && restoreFocus.isConnected) restoreFocus.focus();
  }
  function moveViewer(delta) {
    if (viewerIndex < 0) return;
    const target = viewerIndex + delta;
    if (target < 0 || target >= files.length) return;
    viewerIndex = target;
    updateViewer();
  }

  async function loadImages(folderId, apiKey) {
    if (controller) controller.abort();
    controller = new AbortController();
    const current = controller;
    loading(true);
    files = [];
    grid.replaceChildren();
    empty.hidden = true;
    count.textContent = '';
    setStatus('Google Driveに接続しています…');
    try {
      const result = await api.listPublicImages({
        folderId, apiKey, signal: current.signal,
        onPage: ({ pageCount, imageCount }) => {
          if (controller === current) setStatus(pageCount + 'ページ取得：' + imageCount + '枚の画像を検出しました。続きの確認中…');
        }
      });
      if (controller !== current) return;
      files = result;
      displayImages(files);
      setStatus(files.length ? '画像一覧を読み込みました。画像を選択すると拡大表示します。' : '画像が見つかりませんでした。');
      const url = new URL(window.location.href);
      url.searchParams.set('folder', folderId);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (error) {
      if (controller !== current) return;
      if (error.name === 'AbortError') setStatus('読み込みを中止しました。');
      else setStatus(error.message || '画像一覧を取得できませんでした。', true);
    } finally {
      if (controller === current) { controller = null; loading(false); }
    }
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || controller) return;
    const folderId = api.folderIdFromInput(folderInput.value);
    if (!folderId) { setStatus('正しいGoogle DriveフォルダURLまたはIDを入力してください。', true); return; }
    const apiKey = keyInput.value.trim();
    if (!apiKey) { setStatus('Google Drive APIキーを入力してください。', true); return; }
    try {
      cryptoSettings.validateSettings({ folderId, apiKey });
      saving = true;
      loadButton.disabled = true;
      await persistSettings({ folderId, apiKey });
    } catch (error) {
      setSyncStatus(error?.message || '設定を暗号化して保存できませんでした。', true);
      return;
    } finally {
      saving = false;
      loadButton.disabled = false;
    }
    await loadImages(folderId, apiKey);
  });
  async function initialize() {
    const config = window.MANGA_READER_SUPABASE || {};
    const session = vaultApi?.loadSession?.();
    if (!session?.refresh_token || !config.url || !config.publishableKey) {
      location.replace('index.html');
      return;
    }
    let active = vaultApi.loadActive();
    if (!active && typeof vaultApi.waitForActive === 'function') active = await vaultApi.waitForActive(2500);
    if (!active?.rawKey) {
      location.replace('sync.html?next=drive-gallery.html');
      return;
    }
    try {
      await vaultApi.ensureSession();
    } catch (error) {
      if (vaultApi.isSessionAuthError?.(error)) vaultApi.saveSession(null);
      location.replace('index.html');
      return;
    }
    window.addEventListener('manga-vault-cleared', () => {
      controller?.abort();
      controller = null;
      files = [];
      grid.replaceChildren();
      keyInput.value = '';
      folderInput.value = '';
      viewerImage.removeAttribute('src');
      if (!viewer.hidden) closeViewer();
      location.replace('sync.html?next=drive-gallery.html');
    });
    document.documentElement.classList.remove('auth-pending');
    const saved = vaultPayload.buildFromLocalStorage().driveGalleryEncrypted;
    if (!saved) {
      setSyncStatus('保存済みのGoogle Drive設定はありません。入力すると暗号化して同期します。');
      return;
    }
    try {
      const settings = await cryptoSettings.decryptSettings(vaultKey(), saved);
      folderInput.value = settings.folderId;
      keyInput.value = settings.apiKey;
      setSyncStatus('保管庫から保存済み設定を復元しました。');
      await loadImages(settings.folderId, settings.apiKey);
    } catch (error) {
      keyInput.value = '';
      setSyncStatus(error?.message || '保存済み設定を読み込めませんでした。', true);
    }
  }
  cancelButton.addEventListener('click', () => { if (controller) controller.abort(); });
  byId('driveViewerClose').addEventListener('click', closeViewer);
  byId('driveViewerPrev').addEventListener('click', () => moveViewer(-1));
  byId('driveViewerNext').addEventListener('click', () => moveViewer(1));
  document.addEventListener('keydown', (event) => {
    if (viewer.hidden) return;
    if (event.key === 'Escape') closeViewer();
    if (event.key === 'ArrowLeft') moveViewer(-1);
    if (event.key === 'ArrowRight') moveViewer(1);
    if (event.key === 'Tab') {
      const focusables = Array.from(viewer.querySelectorAll('button:not(:disabled), a[href]'));
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  const initialFolder = new URLSearchParams(window.location.search).get('folder');
  if (initialFolder) folderInput.value = api.folderIdFromInput(initialFolder);
  void initialize();
})();
