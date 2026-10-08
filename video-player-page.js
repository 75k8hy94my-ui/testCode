(() => {
  'use strict';
  const page = document.getElementById('videoPlayerPage');
  const mediaAccess = window.MangaReaderMediaAccess;
  let initialized = false;
  const windowCleanups = [];
  function canReadProtectedData() {
    return !!mediaAccess && typeof mediaAccess.canReadProtectedData === 'function' && mediaAccess.canReadProtectedData() === true;
  }
  function showProtectedDataGate() {
    if (!page) return;
    const section = document.createElement('section'); section.className = 'profileContent vpnRouteGate';
    const heading = document.createElement('h2'); heading.textContent = 'VPN接続が必要です';
    const message = document.createElement('p'); message.className = 'profileLead'; message.textContent = 'VPN接続を確認できるまで、動画情報を読み込みません。';
    const status = document.createElement('button'); status.type = 'button'; status.className = 'glassBtn vpnStatusButton'; status.dataset.vpnStatusButton = '1'; status.dataset.vpnRecheckButton = '1'; status.textContent = 'VPN接続を再確認';
    const diagnostics = document.createElement('button'); diagnostics.type = 'button'; diagnostics.className = 'glassBtn vpnDiagnosticsButton'; diagnostics.dataset.vpnDiagnosticsButton = '1'; diagnostics.textContent = 'VPN診断';
    const back = document.createElement('a'); back.className = 'glassBtn'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
    section.append(heading, message, status, diagnostics, back); page.replaceChildren(section);
    if (mediaAccess && typeof mediaAccess.syncUi === 'function') mediaAccess.syncUi();
  }
  function disposePlayer() {
    while (windowCleanups.length) windowCleanups.pop()();
    if (window.MangaReaderVideoPlayerControls && typeof window.MangaReaderVideoPlayerControls.destroy === 'function') window.MangaReaderVideoPlayerControls.destroy();
    page.querySelectorAll('video').forEach((video) => { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {} });
    document.querySelectorAll('.videoEditDialog').forEach((dialog) => dialog.remove());
    page.replaceChildren(); document.title = '動画'; initialized = false;
  }
  function handleAccessStatus() {
    if (canReadProtectedData()) {
      if (!initialized) initializePlayer();
      return;
    }
    if (initialized) disposePlayer();
    showProtectedDataGate();
  }
  function listenWindow(type, handler) {
    window.addEventListener(type, handler);
    windowCleanups.push(() => window.removeEventListener(type, handler));
  }
  document.addEventListener('manga-reader-vpn-status', handleAccessStatus);
  function initializePlayer() {
    if (initialized || !canReadProtectedData()) return;
    initialized = true;
  const id = new URLSearchParams(location.search).get('id') || '';
  const VIDEO_KEY = 'mangaReaderVideos';
  const META_KEY = 'mangaReaderVideoMeta';
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value == null ? fallback : value; } catch (_) { return fallback; } };
  const baseVideos = read(VIDEO_KEY, []);
  const base = baseVideos.find((item) => String(item.id) === id);
  const allMeta = read(META_KEY, {});
  if (!base) { page.innerHTML = '<section class="profileContent"><h2>動画が見つかりません</h2><a class="glassBtn" href="video.html">動画一覧へ戻る</a></section>'; return; }

  const meta = allMeta[id] && typeof allMeta[id] === 'object' ? allMeta[id] : {};
  const videos = window.MangaReaderVideoData;
  const normalized = videos ? videos.normalizeVideo({ ...base, ...meta, id: base.id, a: base.a, b: base.b, addedAt: base.addedAt }) : { ...base, ...meta };
  const title = normalized.title || [base.a, base.b].filter(Boolean).join(' / ') || '動画';
  document.title = title;
  const tags = Array.isArray(normalized.tags) ? normalized.tags : [];
  const words = new Set(title.toLocaleLowerCase('ja').split(/[\s/・、,._-]+/).filter((word) => word.length >= 2));
  const related = baseVideos.filter((item) => String(item.id) !== id).map((item) => { const itemMeta = allMeta[item.id] || {}; const itemVideo = videos ? videos.normalizeVideo({ ...item, ...itemMeta, id: item.id, a: item.a, b: item.b, addedAt: item.addedAt }) : { ...item, ...itemMeta }; const itemTitle = itemVideo.title || [item.a, item.b].filter(Boolean).join(' / ') || '動画'; const itemTags = Array.isArray(itemVideo.tags) ? itemVideo.tags : []; const sharedTags = itemTags.filter((tag) => tags.includes(tag)).length; const sharedWords = [...words].filter((word) => itemTitle.toLocaleLowerCase('ja').includes(word)).length; return { item, itemVideo, itemTitle, itemTags, score: sharedTags * 100 + sharedWords }; }).sort((a, b) => b.score - a.score).slice(0, 12);

  const heading = document.createElement('h2'); heading.className = 'videoPlayerTitle'; heading.textContent = title; heading.contentEditable = 'false'; heading.setAttribute('role', 'button'); heading.setAttribute('tabindex', '0'); heading.setAttribute('aria-label', 'タイトルをクリックして編集'); heading.title = 'クリックしてタイトルを編集';
  const info = document.createElement('div'); info.className = 'videoPlayerInfo'; info.textContent = [base.a, base.b].filter(Boolean).join(' / ') || '動画';
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'videoPlayerEdit'; edit.textContent = '詳細を編集'; edit.setAttribute('aria-haspopup', 'dialog');
  const actionBar = document.createElement('div'); actionBar.className = 'videoPlayerActionBar'; actionBar.setAttribute('aria-label', '動画の操作'); actionBar.append(edit);
  const tagLine = document.createElement('div'); tagLine.className = 'videoPlayerTags';
  const renderTags = (nextTags) => { tagLine.textContent = nextTags.map((tag) => '#' + tag).join(' '); tagLine.hidden = !nextTags.length; };
  renderTags(tags); info.append(tagLine);
  const saveMetaPatch = async (patch) => {
    if (!canReadProtectedData()) throw new Error('VPN接続を確認できるまで動画を編集できません。');
    const nextMeta = read(META_KEY, {});
    const current = nextMeta[id] && typeof nextMeta[id] === 'object' ? nextMeta[id] : {};
    nextMeta[id] = { ...current, ...patch, updatedAt: Date.now() };
    localStorage.setItem(META_KEY, JSON.stringify(nextMeta));
    if (window.MangaVault && window.MangaVaultPayload && typeof window.MangaVault.savePayload === 'function' && window.MangaVault.loadActive && window.MangaVault.loadActive()) {
      await window.MangaVault.savePayload(window.MangaVaultPayload.buildFromLocalStorage());
    }
    if (!canReadProtectedData()) throw new Error('VPN接続を確認できるまで動画を編集できません。');
    Object.assign(allMeta, nextMeta);
    return nextMeta[id];
  };
  const beginTitleEdit = () => {
    if (!canReadProtectedData()) return;
    if (heading.contentEditable === 'true') return;
    heading.dataset.previousTitle = heading.textContent;
    heading.contentEditable = 'true'; heading.setAttribute('role', 'textbox'); heading.setAttribute('aria-label', '動画タイトル'); heading.setAttribute('aria-multiline', 'false'); heading.focus();
    const range = document.createRange(); range.selectNodeContents(heading); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  };
  const saveTitle = async () => {
    if (heading.contentEditable !== 'true') return;
    const previous = heading.dataset.previousTitle || title;
    const next = heading.textContent.replace(/[\r\n]+/g, ' ').trim();
    heading.contentEditable = 'false'; heading.removeAttribute('aria-multiline'); heading.setAttribute('role', 'button'); heading.setAttribute('aria-label', 'タイトルをクリックして編集');
    if (!next || next === previous) { heading.textContent = previous; return; }
    try {
      const saved = await saveMetaPatch({ title: next });
      if (!canReadProtectedData()) return;
      heading.textContent = saved.title; document.title = saved.title || '動画';
    } catch (_) { heading.textContent = previous; info.dataset.saveError = 'タイトルを保存できませんでした'; setTimeout(() => { delete info.dataset.saveError; }, 3500); }
  };
  heading.addEventListener('click', beginTitleEdit);
  heading.addEventListener('keydown', (event) => {
    if (heading.contentEditable !== 'true') { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); beginTitleEdit(); } return; }
    if (event.key === 'Enter') { event.preventDefault(); heading.blur(); }
    if (event.key === 'Escape') { event.preventDefault(); heading.textContent = heading.dataset.previousTitle || title; heading.contentEditable = 'false'; heading.removeAttribute('aria-multiline'); heading.setAttribute('role', 'button'); heading.setAttribute('aria-label', 'タイトルをクリックして編集'); }
  });
  heading.addEventListener('blur', saveTitle);
  const frame = document.createElement('div'); frame.className = 'videoPlayerFrame'; frame.style.height = 'min(540px, calc(100svh - 150px))'; frame.style.minHeight = '240px';
  const sourceUrl = normalized.url || base.url || '';
  const directVideo = /\.(?:mp4|webm|ogg|ogv|m4v|mov)(?:[?#].*)?$/i.test(sourceUrl);
  if (directVideo) {
    const video = document.createElement('video'); video.src = sourceUrl; video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.style.display = 'block'; video.style.width = '100%'; video.style.height = '100%'; video.style.maxWidth = '100%'; video.style.maxHeight = '100%'; video.style.objectFit = 'contain'; frame.append(video);
    const cleanupRotation = window.MangaReaderVideoRotation.install(frame, video, normalized.rotate90Direction);
    windowCleanups.push(cleanupRotation);
  }
  else if (base.a && base.b) { const iframe = document.createElement('iframe'); iframe.src = 'https://www.' + base.a + '.com/embed/' + base.b; iframe.title = title; iframe.allowFullscreen = true; frame.append(iframe); }
  else { const link = document.createElement('a'); link.className = 'glassBtn'; link.href = sourceUrl || '#'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '元ページを開く'; frame.append(link); }

  const markerList = document.createElement('div'); markerList.className = 'videoPlayerMarkerList'; markerList.innerHTML = '<h3>登録した秒数</h3><div class="videoMarkerList"></div>';
  const markerItems = markerList.querySelector('.videoMarkerList');
  const markerStore = () => { try { const value = JSON.parse(localStorage.getItem('mangaReaderVideoMarkers') || '{}'); return Array.isArray(value[id]) ? value[id] : []; } catch (_) { return []; } };
  const formatMarker = (seconds) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  const renderPageMarkers = () => { markerItems.replaceChildren(); markerStore().slice().sort((a, b) => a.seconds - b.seconds).forEach((marker) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = formatMarker(Number(marker.seconds) || 0) + ' ' + String(marker.label || '現在位置'); button.addEventListener('click', () => { const target = frame.querySelector('video'); if (target) { target.currentTime = marker.seconds; target.play(); } }); markerItems.append(button); }); markerList.hidden = !markerItems.children.length; };
  renderPageMarkers();
  listenWindow('manga-video-markers-changed', renderPageMarkers);

  const dialog = document.createElement('section'); dialog.className = 'videoEditDialog'; dialog.hidden = true; dialog.setAttribute('aria-hidden', 'true');
  dialog.innerHTML = '<div class="videoEditPanel" role="dialog" aria-modal="true" aria-labelledby="videoEditTitle"><header><h2 id="videoEditTitle">動画情報を編集</h2><button type="button" class="videoEditClose" aria-label="閉じる">×</button></header><form class="videoEditForm"><label>タイトル<input name="title" type="text" maxlength="240" autocomplete="off"></label><label>フォルダ<select name="folder"></select></label><label>状態<select name="status"><option value="">未設定</option><option value="later">あとで見る</option><option value="watching">視聴中</option><option value="watched">視聴済み</option></select></label><label>タグ（カンマ区切り）<input name="tags" type="text" autocomplete="off"></label><label>メモ<textarea name="memo" rows="3"></textarea></label><label class="videoEditCheck"><input name="favorite" type="checkbox"> お気に入り</label><p class="videoEditError" aria-live="polite"></p><footer><button type="button" class="videoEditCancel">キャンセル</button><button type="submit" class="videoEditSave">保存</button></footer></form></div>';
  const form = dialog.querySelector('form');
  const folderSelect = form.elements.folder;
  const folders = read('mangaReaderVideoFolders', []);
  const noneOption = document.createElement('option'); noneOption.value = ''; noneOption.textContent = '未分類'; folderSelect.append(noneOption);
  (Array.isArray(folders) ? folders : []).forEach((folder) => { if (!folder || !folder.id || !folder.name) return; const option = document.createElement('option'); option.value = String(folder.id); option.textContent = String(folder.name); folderSelect.append(option); });
  const openEditor = () => { const current = videos ? videos.normalizeVideo({ ...base, ...(read(META_KEY, {})[id] || {}), id: base.id, a: base.a, b: base.b, addedAt: base.addedAt }) : normalized; form.elements.title.value = current.title || ''; folderSelect.value = current.folderId || ''; form.elements.status.value = current.watchStatus || ''; form.elements.tags.value = current.tags.join(', '); form.elements.memo.value = current.memo || ''; form.elements.favorite.checked = !!current.favorite; dialog.hidden = false; dialog.setAttribute('aria-hidden', 'false'); form.elements.title.focus(); };
  const closeEditor = () => { dialog.hidden = true; dialog.setAttribute('aria-hidden', 'true'); edit.focus(); };
  edit.addEventListener('click', openEditor);
  dialog.querySelector('.videoEditClose').addEventListener('click', closeEditor);
  dialog.querySelector('.videoEditCancel').addEventListener('click', closeEditor);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closeEditor(); });
  listenWindow('keydown', (event) => { if (event.key === 'Escape' && !dialog.hidden) closeEditor(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canReadProtectedData()) return;
    const error = dialog.querySelector('.videoEditError'); error.textContent = '';
    const nextMeta = read(META_KEY, {});
    const current = nextMeta[id] && typeof nextMeta[id] === 'object' ? nextMeta[id] : {};
    const next = { ...current, title: form.elements.title.value.trim(), folderId: folderSelect.value || null, watchStatus: form.elements.status.value, tags: videos ? videos.parseTags(form.elements.tags.value) : form.elements.tags.value.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean), memo: form.elements.memo.value.trim(), favorite: form.elements.favorite.checked, updatedAt: Date.now() };
    nextMeta[id] = next;
    try {
      localStorage.setItem(META_KEY, JSON.stringify(nextMeta));
      if (window.MangaVault && window.MangaVaultPayload && typeof window.MangaVault.savePayload === 'function' && window.MangaVault.loadActive && window.MangaVault.loadActive()) {
        await window.MangaVault.savePayload(window.MangaVaultPayload.buildFromLocalStorage());
      }
      if (!canReadProtectedData()) return;
      Object.assign(allMeta, nextMeta);
      const savedTitle = next.title || [base.a, base.b].filter(Boolean).join(' / ') || '動画';
      heading.textContent = savedTitle; document.title = savedTitle; renderTags(next.tags); closeEditor();
    } catch (saveError) { error.textContent = '保存できませんでした。端末の保存状態を確認してください。'; }
  });

  const back = document.createElement('a'); back.className = 'glassBtn videoBack'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
  const relatedBox = document.createElement('aside'); relatedBox.className = 'videoRelated'; const relatedHeading = document.createElement('h3'); relatedHeading.textContent = '関連動画'; relatedBox.append(relatedHeading);
  related.forEach(({ item, itemVideo, itemTitle, itemTags }) => { const link = document.createElement('a'); link.className = 'videoRelatedItem'; link.href = 'video-player.html?id=' + encodeURIComponent(item.id); const thumb = document.createElement('span'); thumb.className = 'videoRelatedThumb'; if (window.MangaReaderVideoThumbnailRenderer) window.MangaReaderVideoThumbnailRenderer.render(thumb, itemVideo); const text = document.createElement('span'); text.className = 'videoRelatedText'; text.textContent = itemTitle; const tagsText = document.createElement('small'); tagsText.textContent = itemTags.slice(0, 3).map((tag) => '#' + tag).join(' '); text.append(tagsText); link.append(thumb, text); relatedBox.append(link); });
  const description = document.createElement('details'); description.className = 'videoPlayerDescription';
  const descriptionSummary = document.createElement('summary'); descriptionSummary.textContent = normalized.memo ? '動画のメモ' : '動画情報';
  const descriptionText = document.createElement('p'); descriptionText.textContent = normalized.memo || [base.a, base.b].filter(Boolean).join(' / ') || '動画'; description.append(descriptionSummary, descriptionText);
  const main = document.createElement('section'); main.className = 'videoPlayerMain'; main.append(frame, heading, info, actionBar, description, markerList, back); const layout = document.createElement('div'); layout.className = 'videoPlayerLayout'; layout.append(main, relatedBox); page.replaceChildren(layout); document.body.append(dialog);
  }
  handleAccessStatus();
})();
