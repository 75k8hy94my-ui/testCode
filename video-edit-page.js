(() => {
  'use strict';
  const page = document.getElementById('videoEditPage');
  const access = window.MangaReaderMediaAccess;
  const Data = window.MangaReaderVideoData;
  const VIDEO_KEY = 'mangaReaderVideos';
  const FOLDER_KEY = 'mangaReaderVideoFolders';
  const META_KEY = 'mangaReaderVideoMeta';
  let initialized = false;
  const isAddMode = new URLSearchParams(location.search).get('mode') === 'add';
  const shellTitle = document.getElementById('shellTitle');
  if (shellTitle) shellTitle.textContent = isAddMode ? '動画を追加' : '動画を編集';
  document.title = isAddMode ? '動画を追加' : '動画を編集';

  function canReadProtectedData() {
    return !!access && typeof access.canReadProtectedData === 'function' && access.canReadProtectedData() === true;
  }
  function read(key, fallback) {
    if (!canReadProtectedData()) return fallback;
    try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch (_) { return fallback; }
  }
  function writeVideoRecordsAtomically(videos, metadata) {
    const previousVideos = localStorage.getItem(VIDEO_KEY);
    const previousMetadata = localStorage.getItem(META_KEY);
    try {
      localStorage.setItem(VIDEO_KEY, JSON.stringify(videos));
      localStorage.setItem(META_KEY, JSON.stringify(metadata));
    } catch (error) {
      try { if (previousVideos == null) localStorage.removeItem(VIDEO_KEY); else localStorage.setItem(VIDEO_KEY, previousVideos); } catch (_) {}
      try { if (previousMetadata == null) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, previousMetadata); } catch (_) {}
      throw error;
    }
  }
  function showGate() {
    const section = document.createElement('section'); section.className = 'videoEditNotice vpnRouteGate';
    const heading = document.createElement('h2'); heading.textContent = 'VPN接続が必要です';
    const message = document.createElement('p'); message.textContent = 'VPN接続を確認できるまで、動画情報の読み込みと追加・編集を停止しています。';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'videoEditButton'; retry.dataset.vpnStatusButton = '1'; retry.dataset.vpnRecheckButton = '1'; retry.textContent = 'VPN接続を再確認';
    const diagnostics = document.createElement('button'); diagnostics.type = 'button'; diagnostics.className = 'videoEditButton'; diagnostics.dataset.vpnDiagnosticsButton = '1'; diagnostics.textContent = 'VPN診断';
    const back = document.createElement('a'); back.className = 'videoEditButton'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
    section.replaceChildren(heading, message, retry, diagnostics, back); page.replaceChildren(section);
    if (access && typeof access.syncUi === 'function') access.syncUi();
  }
  function returnTarget(kind, id) {
    if (kind === 'player') return 'video-player.html?id=' + encodeURIComponent(id);
    return 'video.html';
  }
  function initialize() {
    if (initialized || !canReadProtectedData()) return;
    initialized = true;
    const params = new URLSearchParams(location.search);
    const videoId = isAddMode ? '' : (params.get('id') || '');
    const returnKind = params.get('return') === 'player' ? 'player' : 'list';
    const videos = read(VIDEO_KEY, []);
    const baseVideos = Array.isArray(videos) ? videos : [];
    const base = isAddMode ? null : baseVideos.find((item) => String(item.id) === videoId);
    if (!isAddMode && !base) {
      const missing = document.createElement('section'); missing.className = 'videoEditNotice';
      const heading = document.createElement('h2'); heading.textContent = '動画が見つかりません';
      const back = document.createElement('a'); back.className = 'videoEditButton'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
      missing.replaceChildren(heading, back); page.replaceChildren(missing); return;
    }
    const allMeta = read(META_KEY, {});
    const originalMeta = !isAddMode && allMeta[videoId] && typeof allMeta[videoId] === 'object' ? allMeta[videoId] : {};
    const current = isAddMode
      ? Data.normalizeVideo({ id: 'draft', addedAt: Date.now() })
      : Data.normalizeVideo({ ...base, ...originalMeta, id: base.id, a: base.a, b: base.b, addedAt: base.addedAt });
    const folders = Data.normalizeFolders(read(FOLDER_KEY, []));
    const heading = document.createElement('h2'); heading.className = 'videoEditHeading'; heading.textContent = isAddMode ? '動画を追加' : '動画を編集';
    const lead = document.createElement('p'); lead.className = 'videoEditLead'; lead.textContent = isAddMode ? '動画URLと情報を入力してください。' : (current.title || current.url || '動画情報を変更できます。');
    const form = document.createElement('form'); form.className = 'videoEditForm';
    form.innerHTML = `
      ${isAddMode ? '<details class="videoEditField videoEditJsonImport"><summary>JSONからURLを一括追加</summary><p class="videoEditHelp">URL文字列の配列を含むJSONファイルを選択します。例: ["https://example.com/1.mp4"]</p><label for="videoEditJsonFile">JSONファイル</label><input id="videoEditJsonFile" type="file" accept="application/json,.json" data-json-import></details>' : ''}
      <div class="videoEditUrlRow"><div class="videoEditField"><label for="videoEditUrl">動画URL</label><input id="videoEditUrl" name="url" type="url" autocomplete="off" required readonly></div><button class="videoEditButton" type="button" data-edit-url>URLを変更</button></div>
      <div class="videoEditField"><label for="videoEditTitle">タイトル</label><input id="videoEditTitle" name="title" type="text" maxlength="240" autocomplete="off"></div>
      <div class="videoEditField"><label for="videoEditFolder">フォルダ</label><select id="videoEditFolder" name="folder"></select></div>
      <div class="videoEditField"><label for="videoEditStatus">状態</label><select id="videoEditStatus" name="status"><option value="">未設定</option><option value="later">あとで見る</option><option value="watching">視聴中</option><option value="watched">視聴済み</option></select></div>
      <div class="videoEditField"><label for="videoEditTags">タグ（カンマ区切り）</label><input id="videoEditTags" name="tags" type="text" autocomplete="off"></div>
      <div class="videoEditField"><label for="videoEditMemo">メモ</label><textarea id="videoEditMemo" name="memo"></textarea></div>
      <label class="videoEditCheck"><input name="favorite" type="checkbox"> お気に入り</label>
      <label class="videoEditCheck"><input name="hidden" type="checkbox"> 動画を非表示</label>
      <div class="videoEditField"><label for="videoEditRotate">再生時の回転</label><select id="videoEditRotate" name="rotate"><option value="none">回転なし</option><option value="left">常に左90°回転</option><option value="right">常に右90°回転</option></select></div>
      <details class="videoEditField"><summary>再生情報・サムネイル</summary><div class="videoEditField"><label for="videoEditService">サービス名</label><input id="videoEditService" name="service" type="text" autocomplete="off"></div><div class="videoEditField"><label for="videoEditLegacyId">動画ID</label><input id="videoEditLegacyId" name="legacyId" type="text" autocomplete="off"></div><div class="videoEditField"><label for="videoEditThumbnail">サムネイルURL（任意）</label><input id="videoEditThumbnail" name="thumbnail" type="url" autocomplete="off"></div><div class="videoEditField"><label for="videoEditThumbnailTime">サムネイル時刻（mm:ss）</label><input id="videoEditThumbnailTime" name="thumbnailTime" type="text" inputmode="numeric" placeholder="0:00" autocomplete="off"></div></details>
      <p class="videoEditError" role="status" aria-live="polite"></p><div class="videoEditActions"><button class="videoEditButton danger" type="button" data-delete>動画を削除</button><a class="videoEditButton" data-cancel>キャンセル</a><button class="videoEditButton save" type="submit">保存</button></div>`;
    const elements = form.elements;
    elements.url.value = current.url;
    elements.title.value = current.title;
    elements.status.value = current.watchStatus;
    elements.tags.value = current.tags.join(', ');
    elements.memo.value = current.memo;
    elements.favorite.checked = current.favorite;
    elements.hidden.checked = current.hidden;
    elements.rotate.value = current.rotate90Direction;
    elements.service.value = base ? (base.a || '') : '';
    elements.legacyId.value = base ? (base.b || '') : '';
    if (isAddMode) {
      elements.url.readOnly = false;
      form.querySelector('[data-edit-url]').hidden = true;
      form.querySelector('[data-delete]').hidden = true;
      form.querySelector('button[type="submit"]').textContent = '追加';
    }
    elements.thumbnail.value = current.thumbnailUrl;
    elements.thumbnailTime.value = current.thumbnailTimeSeconds == null ? '' : Data.formatMediaTime(current.thumbnailTimeSeconds);
    elements.thumbnailTime.disabled = !Data.isDirectVideoUrl(current.url);
    if (!isAddMode && /^https?:\/\//i.test(current.url)) {
      const source = document.createElement('a'); source.className = 'videoEditButton videoEditSource';
      source.href = current.url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = '元ページを開く ↗';
      form.prepend(source);
    }
    const none = document.createElement('option'); none.value = ''; none.textContent = '未分類'; elements.folder.append(none);
    folders.forEach((folder) => { const option = document.createElement('option'); option.value = folder.id; option.textContent = folder.name; elements.folder.append(option); });
    elements.folder.value = current.folderId || '';
    form.querySelector('[data-cancel]').href = returnTarget(returnKind, videoId);
    form.querySelector('[data-edit-url]').addEventListener('click', () => { if (!canReadProtectedData()) return; elements.url.readOnly = false; elements.url.focus(); });
    if (isAddMode) {
      const jsonImport = form.querySelector('[data-json-import]');
      jsonImport.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        const error = form.querySelector('.videoEditError');
        error.textContent = '';
        if (!file || !canReadProtectedData()) return;
        let parsed;
        try { parsed = JSON.parse(await file.text()); }
        catch (_) { error.textContent = 'JSONを読み込めませんでした。形式を確認してください。'; return; }
        if (!Array.isArray(parsed)) { error.textContent = 'JSONはURL文字列の配列にしてください。'; return; }

        const urls = [];
        for (let index = 0; index < parsed.length; index += 1) {
          if (typeof parsed[index] !== 'string' || Data.classifyVideoUrl(parsed[index].trim()).kind === 'invalid') {
            error.textContent = 'JSONの' + (index + 1) + '件目に無効な動画URLがあります。';
            return;
          }
          urls.push(parsed[index].trim());
        }
        const latestVideos = read(VIDEO_KEY, []);
        const savedVideos = Array.isArray(latestVideos) ? latestVideos : [];
        const seen = new Set(savedVideos.map((item) => Data.normalizeVideo(item).url));
        const newVideos = [];
        const newMeta = {};
        const now = Date.now();
        urls.forEach((url) => {
          if (seen.has(url)) return;
          seen.add(url);
          const fields = Data.storageFieldsForVideoUrl(url);
          const videoId = 'v-' + (window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + now) + '-import-' + newVideos.length;
          newVideos.push(Data.normalizeVideo({ id: videoId, title: '', url, ...fields, addedAt: now, updatedAt: now }));
          newMeta[videoId] = { title: '', folderId: null, watchStatus: '', tags: [], memo: '', favorite: false, hidden: false, rotate90: false, rotate90Direction: 'none', thumbnailUrl: '', thumbnailTimeSeconds: null, updatedAt: now };
        });
        if (!newVideos.length) {
          error.textContent = '追加できる新しい動画URLがありません。';
          event.target.value = '';
          return;
        }
        const currentMeta = read(META_KEY, {});
        const nextMeta = currentMeta && typeof currentMeta === 'object' && !Array.isArray(currentMeta) ? { ...currentMeta, ...newMeta } : newMeta;
        try {
          writeVideoRecordsAtomically([...newVideos, ...savedVideos], nextMeta);
        } catch (_) {
          error.textContent = '端末に保存できませんでした。ブラウザの保存容量を確認してください。';
          event.target.value = '';
          return;
        }
        if (!window.TestCodeGuest?.isActive()) {
          if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function') {
            error.textContent = '端末には保存しましたが、クラウド未同期の状態を管理できません。保管庫を開いて再試行してください。';
            event.target.value = '';
            return;
          }
          if (!window.MangaVault.markLocalChangesPending()) {
            error.textContent = '端末には保存しましたが、未同期状態を記録できませんでした。保管庫を確認して再試行してください。';
            event.target.value = '';
            return;
          }
        }
        let syncMessage = '端末に保存しました。';
        if (!window.TestCodeGuest?.isActive()) {
          if (canReadProtectedData()) {
            try { await window.MangaVault.saveLocalChanges(); syncMessage = 'クラウド同期も完了しました。'; }
            catch (syncError) { syncMessage = '未同期として保持し、後で再試行します。 ' + (syncError?.message || ''); }
          } else syncMessage = 'VPN未許可のため未同期として保持しました。';
        } else syncMessage = 'ゲスト端末内に保存しました。';
        error.textContent = newVideos.length + '件追加しました。' + syncMessage;
        event.target.value = '';
      });
    }
    elements.url.addEventListener('change', () => {
      const classified = Data.classifyVideoUrl(elements.url.value);
      const fields = classified.kind === 'invalid' ? null : Data.storageFieldsForVideoUrl(elements.url.value);
      elements.thumbnailTime.disabled = !Data.isDirectVideoUrl(elements.url.value);
      if (!fields) return;
      elements.service.value = fields.a;
      elements.legacyId.value = fields.b;
    });
    let saving = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = form.querySelector('.videoEditError'); error.textContent = '';
      if (!canReadProtectedData()) return;
      const url = elements.url.value.trim();
      const classified = Data.classifyVideoUrl(url);
      if (classified.kind === 'invalid') { error.textContent = '有効な動画URLを入力してください。'; return; }
      const latestVideos = read(VIDEO_KEY, []);
      const savedVideos = Array.isArray(latestVideos) ? latestVideos : [];
      const duplicate = savedVideos.some((item) => (isAddMode || String(item.id) !== videoId) && Data.normalizeVideo(item).url === url);
      if (duplicate) { error.textContent = '同じ動画URLはすでに登録されています。'; return; }
      const fields = Data.storageFieldsForVideoUrl(url);
      const timestamp = elements.thumbnailTime.value.trim();
      const parsedTime = timestamp ? Data.parseMediaTime(timestamp) : null;
      if (Data.isDirectVideoUrl(url) && timestamp && parsedTime == null) {
        error.textContent = 'サムネイル時刻は mm:ss 形式で入力してください。'; return;
      }
      const a = isAddMode ? fields.a : (elements.service.value.trim() || classified.a || fields.a);
      const b = isAddMode ? fields.b : (elements.legacyId.value.trim() || classified.b || fields.b);
      const now = Date.now();
      const savedId = isAddMode ? 'v-' + (window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + now) : videoId;
      const nextBase = isAddMode
        ? Data.normalizeVideo({ id: savedId, title: elements.title.value.trim(), url, a, b, addedAt: now, updatedAt: now })
        : { ...base, title: elements.title.value.trim(), url, a, b, updatedAt: now };
      const storedMeta = read(META_KEY, {});
      const nextMeta = storedMeta && typeof storedMeta === 'object' && !Array.isArray(storedMeta) ? storedMeta : {};
      nextMeta[savedId] = { ...(nextMeta[savedId] || {}), title: elements.title.value.trim(), folderId: elements.folder.value || null, watchStatus: elements.status.value, tags: Data.parseTags(elements.tags.value), memo: elements.memo.value.trim(), favorite: elements.favorite.checked, hidden: elements.hidden.checked, rotate90: elements.rotate.value !== 'none', rotate90Direction: elements.rotate.value, thumbnailUrl: elements.thumbnail.value.trim(), thumbnailTimeSeconds: Data.isDirectVideoUrl(url) ? parsedTime : current.thumbnailTimeSeconds, updatedAt: Date.now() };
      const nextVideos = isAddMode ? [nextBase, ...savedVideos] : savedVideos.map((item) => String(item.id) === videoId ? nextBase : item);
      if (saving) return;
      saving = true;
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        try {
          localStorage.setItem(VIDEO_KEY, JSON.stringify(nextVideos));
          localStorage.setItem(META_KEY, JSON.stringify(nextMeta));
        } catch (_) {
          error.textContent = '端末に保存できませんでした。ブラウザの保存容量を確認してください。';
          return;
        }
        if (window.TestCodeGuest?.isActive()) {
          location.href = returnTarget(returnKind, savedId);
          return;
        }
        if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function') {
          error.textContent = '端末には保存しましたが、クラウド未同期の状態を管理できません。保管庫を開いて再試行してください。';
          return;
        }
        if (!window.MangaVault.markLocalChangesPending()) {
          error.textContent = '端末には保存しましたが、未同期状態を記録できませんでした。保管庫を確認して再試行してください。';
          return;
        }
        location.href = returnTarget(returnKind, savedId);
      } finally {
        saving = false;
        if (submitButton) submitButton.disabled = false;
      }
    });
    if (!isAddMode) form.querySelector('[data-delete]').addEventListener('click', async () => {
      if (!canReadProtectedData()) return;
      if (!confirm('「' + (current.title || 'この動画') + '」を削除しますか？')) return;
      const error = form.querySelector('.videoEditError'); error.textContent = '';
      const latestVideos = read(VIDEO_KEY, []);
      const latestMeta = read(META_KEY, {});
      if (!Array.isArray(latestVideos)) { error.textContent = '動画一覧を読み込めませんでした。'; return; }
      const remaining = latestVideos.filter((item) => String(item.id) !== videoId);
      if (remaining.length === latestVideos.length) { error.textContent = '動画が見つかりません。'; return; }
      const remainingMeta = latestMeta && typeof latestMeta === 'object' && !Array.isArray(latestMeta) ? { ...latestMeta } : {};
      delete remainingMeta[videoId];
      try {
        localStorage.setItem(VIDEO_KEY, JSON.stringify(remaining));
        localStorage.setItem(META_KEY, JSON.stringify(remainingMeta));
      } catch (_) {
        error.textContent = '端末に削除を保存できませんでした。ブラウザの保存容量を確認してください。';
        return;
      }
      if (window.TestCodeGuest?.isActive()) {
        location.href = 'video.html';
        return;
      }
      if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function' || !window.MangaVault.markLocalChangesPending()) {
        error.textContent = '端末には削除を保存しましたが、未同期状態を記録できませんでした。保管庫を確認して再試行してください。';
        return;
      }
      if (!canReadProtectedData()) {
        error.textContent = '端末には削除を保存しましたが、VPN接続を確認できないためクラウド未同期です。';
        return;
      }
      location.href = 'video.html';
    });
    page.replaceChildren(heading, lead, form);
    if (isAddMode) elements.url.focus();
  }
  function handleAccess() {
    if (canReadProtectedData()) initialize();
    else { initialized = false; showGate(); }
  }
  document.addEventListener('manga-reader-vpn-status', handleAccess);
  handleAccess();
})();
