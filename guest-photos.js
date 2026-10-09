/* Guest-only local photo shelf. IndexedDB has its own DB name and never
   creates Supabase requests or handles authenticated encrypted asset records. */
(() => {
  'use strict';
  const DB_NAME = 'testCode-guest-photo-library-v1';
  const STORE = 'albums';
  const $ = (id) => document.getElementById(id);
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onerror = () => reject(req.error || new Error('ゲスト写真の保存領域を開けません'));
      req.onsuccess = () => resolve(req.result);
    });
  }
  function operate(db, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      try {
        const request = fn(store);
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
      } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('保存を中断しました'));
    });
  }
  async function start() {
    if (!window.TestCodeGuest?.isActive()) return;
    const gallery = $('imageGrid'), form = $('imageUploadForm'), empty = $('imageEmpty');
    const status = $('imageStatus'), titleInput = $('imageTitle'), fileInput = $('imageFiles');
    const button = $('imageUploadButton'), progress = $('imageUploadProgress');
    if (!gallery || !form || !empty || !status || !button) return;
    const db = await openDb();
    let albums = [];
    let thumbnails = [], viewerUrls = [], currentAlbum = null, currentPage = 0, scale = 1;
    const viewer = $('imageViewer');
    const stage = $('imageViewerStage');
    const title = $('imageViewerTitle');
    const position = $('imageViewerPage');
    const setStatus = (message) => { status.textContent = message; };
    const revoke = (urls) => { for (const url of urls) URL.revokeObjectURL(url); urls.length = 0; };
    const closeViewer = () => { viewer.hidden = true; revoke(viewerUrls); currentAlbum = null; stage.replaceChildren(); document.body.style.overflow = ''; };
    function showPage(index) {
      if (!currentAlbum || index < 0 || index >= currentAlbum.files.length) return;
      currentPage = index;
      scale = 1;
      const picture = document.createElement('img');
      picture.src = viewerUrls[index];
      picture.alt = currentAlbum.title + ' ' + (index + 1);
      picture.style.cssText = 'display:block;max-width:100%;max-height:80vh;object-fit:contain;transform-origin:center center;';
      stage.replaceChildren(picture);
      title.textContent = currentAlbum.title;
      position.textContent = (index + 1) + ' / ' + currentAlbum.files.length;
      $('imageViewerPrevious').disabled = index === 0;
      $('imageViewerNext').disabled = index === currentAlbum.files.length - 1;
    }
    function openViewer(album) {
      closeViewer();
      currentAlbum = album;
      viewerUrls = album.files.map((file) => URL.createObjectURL(file));
      viewer.hidden = false;
      document.body.style.overflow = 'hidden';
      showPage(0);
    }
    function render() {
      revoke(thumbnails);
      gallery.replaceChildren();
      empty.hidden = albums.length !== 0;
      for (const album of albums) {
        const card = document.createElement('div');
        card.className = 'imageTile';
        card.style.cssText = 'display:grid;gap:8px;min-width:0;';
        const open = document.createElement('button');
        open.type = 'button'; open.className = 'imageTileOpen';
        open.style.cssText = 'display:grid;gap:6px;min-width:0;cursor:pointer;';
        const img = document.createElement('img');
        const url = URL.createObjectURL(album.files[0]);
        thumbnails.push(url); img.src = url; img.alt = album.title; img.loading = 'lazy';
        img.style.cssText = 'width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;';
        const label = document.createElement('span');
        label.textContent = album.title + ' (' + album.files.length + '枚)';
        open.append(img, label); open.addEventListener('click', () => openViewer(album));
        const del = document.createElement('button');
        del.type = 'button'; del.textContent = '削除'; del.className = 'glassBtn';
        del.addEventListener('click', async () => {
          if (!confirm('「' + album.title + '」をゲストの端末保存から削除しますか？')) return;
          await operate(db, 'readwrite', (store) => store.delete(album.id));
          await refresh();
        });
        card.append(open, del); gallery.appendChild(card);
      }
    }
    async function refresh() {
      albums = (await operate(db, 'readonly', (store) => store.getAll())).sort((a,b) => b.createdAt - a.createdAt);
      render();
    }
    $('imageLibraryHead')?.setAttribute('data-guest', 'true');
    const heading = document.querySelector('.imageLibraryHead h2');
    if (heading) heading.textContent = 'ゲスト写真（端末内のみ）';
    const hint = document.createElement('p');
    hint.textContent = 'ゲスト写真はこのブラウザだけに保存します。同期・VPN確認・保管庫による暗号化はありません。機密画像の保存は避けてください。';
    form.before(hint);
    const quality = $('imageQualityMode');
    const qualityLabel = quality?.closest('label'); if (qualityLabel) qualityLabel.hidden = true;
    if (progress) progress.hidden = true;
    $('imageCancelButton').hidden = true;
    $('imageRetrySync').hidden = true;
    button.textContent = 'この端末に追加';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const files = Array.from(fileInput.files || []).filter((file) => file.type.startsWith('image/'));
      if (!files.length) { setStatus('画像を選択してください。'); return; }
      button.disabled = true;
      try {
        const record = { id: crypto.randomUUID ? crypto.randomUUID() : 'guest-' + Date.now() + '-' + Math.random(), title: titleInput.value.trim() || '無題', files, createdAt: Date.now() };
        await operate(db, 'readwrite', (store) => store.put(record));
        titleInput.value = ''; fileInput.value = '';
        await refresh();
        setStatus(files.length + '枚をゲスト領域へ保存しました。クラウドへは送信していません。');
      } catch (error) { setStatus('保存できませんでした：' + (error?.message || '容量・保存領域を確認してください')); }
      finally { button.disabled = false; }
    });
    $('imageViewerClose')?.addEventListener('click', closeViewer);
    $('imageViewerPrevious')?.addEventListener('click', () => showPage(currentPage - 1));
    $('imageViewerNext')?.addEventListener('click', () => showPage(currentPage + 1));
    const zoom = (multiplier) => {
      const img = stage.querySelector('img');
      if (!img) return;
      scale = Math.max(1, Math.min(4, scale * multiplier));
      img.style.transform = 'scale(' + scale + ')';
    };
    $('imageViewerZoomIn')?.addEventListener('click', () => zoom(1.25));
    $('imageViewerZoomOut')?.addEventListener('click', () => zoom(.8));
    document.addEventListener('keydown', (e) => {
      if (viewer.hidden) return;
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowRight') showPage(currentPage + 1);
      if (e.key === 'ArrowLeft') showPage(currentPage - 1);
    });
    window.addEventListener('pagehide', () => { closeViewer(); revoke(thumbnails); db.close(); }, { once: true });
    await refresh();
  }
  window.GuestPhotoLibrary = Object.freeze({ start });
})();
