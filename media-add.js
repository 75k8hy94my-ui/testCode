(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('mangaAddForm');
  if (!form) return;
  const open = $('openMangaAdd');
  const panel = $('mangaAddSection');
  const message = $('mangaAddStatus');
  const batchMessage = $('mangaBatchStatus');
  const accessMessage = $('mediaAddAccessMessage');
  const ITEMS = 'mangaReaderSavedItems';
  const AUTHORS = 'mangaReaderAuthorCards';
  const authorized = () => !!window.MangaReaderMediaAccess?.canReadProtectedData?.();
  const guest = () => !!window.TestCodeGuest?.isActive?.();
  const getArray = key => {
    try { const parsed = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(parsed) ? parsed : []; }
    catch (_) { return []; }
  };
  const validUrl = value => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); }
    catch (_) { return false; }
  };
  const createId = () => 'i-' + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
  function markPending() {
    if (guest()) return;
    if (!window.MangaVault?.markLocalChangesPending?.()) {
      throw new Error('未同期状態を記録できません。作品は変更していません。保管庫を開いて再試行してください。');
    }
  }
  function saveRecords(items, authorCards) {
    // Preflight both payloads before changing persistent data.
    const encodedItems = JSON.stringify(items);
    const encodedAuthors = JSON.stringify(authorCards);
    const oldItems = localStorage.getItem(ITEMS);
    const oldAuthors = localStorage.getItem(AUTHORS);
    try {
      localStorage.setItem(ITEMS, encodedItems);
      localStorage.setItem(AUTHORS, encodedAuthors);
    } catch (error) {
      try {
        if (oldItems === null) localStorage.removeItem(ITEMS);
        else localStorage.setItem(ITEMS, oldItems);
        if (oldAuthors === null) localStorage.removeItem(AUTHORS);
        else localStorage.setItem(AUTHORS, oldAuthors);
      } catch (_) {}
      throw new Error('端末への保存に失敗しました。保存容量を確認してください。');
    }
  }
  function syncAfterSave(target) {
    if (guest()) {
      target.textContent = '端末に保存しました（ゲストモード）。';
      return;
    }
    target.textContent = '端末に保存しました。クラウド同期を開始します。';
    if (typeof window.MangaVault?.saveLocalChanges === 'function') {
      window.MangaVault.saveLocalChanges().then(() => {
        target.textContent = '端末とクラウドに保存しました。';
      }).catch(() => {
        target.textContent = '端末には保存しましたが、クラウド同期は保留中です。';
      });
    }
  }
  function updateAccess() {
    const permitted = authorized();
    if (open) open.disabled = !permitted;
    $('mangaBatchImport').disabled = !permitted;
    if (panel && !permitted) panel.hidden = true;
    form.querySelectorAll('input,textarea,button').forEach(el => { el.disabled = !permitted; });
    accessMessage.textContent = permitted ? '' : 'VPNまたは保管庫へのアクセス確認が必要です。';
    if (permitted) document.documentElement.classList.remove('auth-pending');
  }
  open.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    open.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) form.elements.namedItem('title').focus();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    message.textContent = '';
    message.dataset.error = 'false';
    if (!authorized()) return updateAccess();
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    const initialUrl = String(data.get('url') || '').trim();
    const urls = String(data.get('pages') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!title || !validUrl(initialUrl) || urls.some(url => !validUrl(url))) {
      message.dataset.error = 'true';
      message.textContent = 'タイトルと有効なHTTP(S)の画像URLを入力してください。';
      return;
    }
    const existing = getArray(ITEMS);
    const canonicalUrl = urls[0] || initialUrl;
    if (existing.some(item => item.url === canonicalUrl || item.sourceUrl === initialUrl)) {
      message.dataset.error = 'true';
      message.textContent = 'このURLの漫画はすでに登録されています。';
      return;
    }
    const item = {
      id: createId(), title,
      author: String(data.get('author') || '').trim(),
      series: String(data.get('series') || '').trim(),
      tags: String(data.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean),
      folderId: null, sourceUrl: initialUrl, url: canonicalUrl, addedAt: Date.now()
    };
    const volume = Number(data.get('volume'));
    if (Number.isSafeInteger(volume) && volume > 0) item.volume = volume;
    if (urls.length) {
      item.pages = urls;
      item.pageManifest = { version: 1, pages: urls.slice(), splitSpreads: false };
    }
    try {
      markPending();
      saveRecords([...existing, item], getArray(AUTHORS));
      form.reset();
      syncAfterSave(message);
    } catch (error) {
      message.dataset.error = 'true';
      message.textContent = error.message || '保存に失敗しました。';
    }
  });
  const validator = window.MangaImportValidator;
  const candidateFactory = window.MangaImportCandidate;
  const dialogFactory = window.MangaImportDialog;
  const bridgeFactory = window.MangaImportBridge;
  const authorSync = window.MangaImportAuthorSync;
  const importBatch = window.MangaImportBatch;
  if (validator && candidateFactory && dialogFactory && bridgeFactory && authorSync && importBatch) {
    const dialog = dialogFactory.create({ documentRef: document, validator, candidateFactory });
    const bridge = bridgeFactory.create({ windowRef: window, origin: location.origin });
    $('mangaBatchImport').addEventListener('click', async () => {
      if (!authorized()) return;
      batchMessage.textContent = '拡張機能から読み込んでいます…';
      try {
        const queued = await bridge.requestQueuedCandidates();
        if (!authorized()) return;
        if (!queued.length) { batchMessage.textContent = '読み込める作品がありません。'; return; }
        dialog.open(queued, getArray(ITEMS), getArray(AUTHORS));
        batchMessage.textContent = '';
      } catch (error) {
        batchMessage.textContent = error.message || '拡張機能の読み込みに失敗しました。';
      }
    });
    $('mangaImportCancelButton').addEventListener('click', () => dialog.close());
    $('mangaImportRegisterButton').addEventListener('click', () => {
      if (!authorized()) return;
      const selection = dialog.getSelection();
      if (!selection.items.length) return dialog.setStatus('登録する作品を選択してください。');
      const checked = validator.validateBatch(selection.items.map(item => item.candidate));
      if (!checked.ok) return dialog.setStatus(checked.errors.map(error => error.message).join('、'));
      let latestItems = getArray(ITEMS);
      let latestAuthors = getArray(AUTHORS);
      const controller = importBatch.create({
        getState: () => ({savedItems: latestItems, authorCards: latestAuthors}),
        setState: next => {latestItems = next.savedItems; latestAuthors = next.authorCards;},
        validator, candidateFactory, authorSync,
        persistItems: () => {saveRecords(latestItems, latestAuthors); return true;},
        persistAuthorCards: () => {saveRecords(latestItems, latestAuthors); return true;},
        render: () => {},
        createId, now: () => Date.now()
      });
      try {
        markPending();
        const result = controller.register(selection);
        if (!result.ok) return dialog.setStatus('登録できませんでした。');
        dialog.close();
        batchMessage.textContent = result.registeredQueueIds.length + '件を端末に登録しました。';
        if (result.registeredQueueIds.length) syncAfterSave(batchMessage);
      } catch (error) {
        dialog.setStatus(error.message || '登録に失敗しました。');
      }
    });
  }
  document.addEventListener('manga-reader-vpn-status', updateAccess);
  updateAccess();
})();