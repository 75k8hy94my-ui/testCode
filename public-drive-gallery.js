(() => {
  'use strict';
  const api = window.PublicDriveGallery;
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
    loadButton.textContent = value ? '取得中…' : '画像を読み込む';
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (controller) controller.abort();
    const folderId = api.folderIdFromInput(folderInput.value);
    if (!folderId) { setStatus('正しいGoogle DriveフォルダURLまたはIDを入力してください。', true); return; }
    const apiKey = keyInput.value.trim();
    if (!apiKey) { setStatus('Google Drive APIキーを入力してください。', true); return; }
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
  });
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
})();
