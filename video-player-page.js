(() => {
  'use strict';
  const page = document.getElementById('videoPlayerPage');
  const mediaAccess = window.MangaReaderMediaAccess;
  let initialized = false;
  const windowCleanups = [];
  let syncRunning = false;
  let syncRequestedWhileRunning = false;
  let syncStatusNode = null;
  function setSyncStatus(message, isError) {
    if (!syncStatusNode) return;
    syncStatusNode.textContent = message || '';
    syncStatusNode.dataset.error = isError ? '1' : '0';
    syncStatusNode.hidden = !message;
  }
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
    page.replaceChildren(); document.title = '動画'; initialized = false;
  }
  function handleAccessStatus() {
    if (canReadProtectedData()) {
      if (!initialized) initializePlayer();
      else resumePendingLocalSync();
      return;
    }
    if (initialized) disposePlayer();
    showProtectedDataGate();
  }
  function listenWindow(type, handler) {
    window.addEventListener(type, handler);
    windowCleanups.push(() => window.removeEventListener(type, handler));
  }
  function hasPendingLocalSync() {
    const vault = window.MangaVault;
    if (!vault || typeof vault.hasPendingLocalChanges !== 'function') return false;
    try { return vault.hasPendingLocalChanges() === true; } catch (_) { return false; }
  }
  async function resumePendingLocalSync() {
    if (window.TestCodeGuest?.isActive() || !hasPendingLocalSync()) return false;
    if (syncRunning) { syncRequestedWhileRunning = true; return false; }
    if (!canReadProtectedData()) { setSyncStatus('端末保存済み・クラウド未同期（VPN接続後に同期します）', true); return false; }
    const vault = window.MangaVault;
    if (!vault || typeof vault.saveLocalChanges !== 'function' || typeof vault.loadActive !== 'function' || !vault.loadActive()) {
      setSyncStatus('端末保存済み・クラウド未同期（保管庫を開くと同期します）', true); return false;
    }
    syncRunning = true;
    setSyncStatus('クラウド同期中…', false);
    try {
      let attempts = 0;
      do {
        await vault.saveLocalChanges();
        attempts += 1;
      } while (hasPendingLocalSync() && attempts < 3 && canReadProtectedData());
      const synced = !hasPendingLocalSync();
      setSyncStatus(synced ? '' : '端末保存済み・クラウド未同期（後で再試行します）', !synced);
      return synced;
    } catch (_) {
      setSyncStatus('端末保存済み・クラウド未同期（通信復旧後に再試行します）', true);
      return false;
    } finally {
      syncRunning = false;
      if (syncRequestedWhileRunning && hasPendingLocalSync() && canReadProtectedData()) {
        syncRequestedWhileRunning = false;
        resumePendingLocalSync();
      }
    }
  }
  document.addEventListener('manga-reader-vpn-status', handleAccessStatus);
  function initializePlayer() {
    if (initialized || !canReadProtectedData()) return;
    initialized = true;
  listenWindow('beforeunload', (event) => {
    const vault = window.MangaVault;
    if (vault && typeof vault.guardPendingSyncLeave === 'function') vault.guardPendingSyncLeave(event, syncRunning);
  });
  listenWindow('online', () => { resumePendingLocalSync(); });
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
  syncStatusNode = document.createElement('small'); syncStatusNode.className = 'videoPlayerSyncStatus'; syncStatusNode.setAttribute('role', 'status');
  const edit = document.createElement('a'); edit.className = 'videoPlayerEdit'; edit.textContent = '詳細を編集'; edit.href = 'video-edit.html?id=' + encodeURIComponent(id) + '&return=player';
  const actionBar = document.createElement('div'); actionBar.className = 'videoPlayerActionBar'; actionBar.setAttribute('aria-label', '動画の操作'); actionBar.append(edit);
  const tagLine = document.createElement('div'); tagLine.className = 'videoPlayerTags';
  const renderTags = (nextTags) => { tagLine.textContent = nextTags.map((tag) => '#' + tag).join(' '); tagLine.hidden = !nextTags.length; };
  renderTags(tags); info.append(tagLine, syncStatusNode);
  const saveMetaPatch = async (patch) => {
    if (!canReadProtectedData()) throw new Error('VPN接続を確認できるまで動画を編集できません。');
    const nextMeta = read(META_KEY, {});
    const current = nextMeta[id] && typeof nextMeta[id] === 'object' ? nextMeta[id] : {};
    nextMeta[id] = { ...current, ...patch, updatedAt: Date.now() };
    localStorage.setItem(META_KEY, JSON.stringify(nextMeta));
    if (window.TestCodeGuest?.isActive()) { Object.assign(allMeta, nextMeta); return nextMeta[id]; }
    if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function' || !window.MangaVault.markLocalChangesPending()) {
      const error = new Error('端末には保存しましたが、未同期状態を記録できませんでした。'); error.localSaved = true; Object.assign(allMeta, nextMeta); throw error;
    }
    Object.assign(allMeta, nextMeta);
    if (canReadProtectedData()) resumePendingLocalSync();
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
    } catch (error) {
      if (error && error.localSaved && canReadProtectedData()) { heading.textContent = next; document.title = next || '動画'; info.dataset.saveError = '端末には保存しましたが、クラウド未同期です。'; }
      else heading.textContent = previous;
      setTimeout(() => { delete info.dataset.saveError; }, 3500);
    }
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
  // Keep the ordinary detail editor unchanged; the virtual editor is MP4-only.
  if (window.MangaReaderVideoVirtualEdit && window.MangaReaderVideoVirtualEdit.isMp4Url(sourceUrl)) {
    const virtualEdit = document.createElement('a');
    virtualEdit.className = 'videoPlayerEdit';
    virtualEdit.textContent = '区間を編集・結合';
    virtualEdit.href = 'video-virtual-editor.html?id=' + encodeURIComponent(id);
    actionBar.append(virtualEdit);
  }
  const directVideo = /\.(?:mp4|webm|ogg|ogv|m4v|mov)(?:[?#].*)?$/i.test(sourceUrl);
  if (directVideo) {
    const video = document.createElement('video'); video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.style.display = 'block'; video.style.width = '100%'; video.style.height = '100%'; video.style.maxWidth = '100%'; video.style.maxHeight = '100%'; video.style.objectFit = 'contain';
    const startValue = new URLSearchParams(location.search).get('start'); const startTime = startValue == null ? null : Number(startValue);
    if (Number.isFinite(startTime) && startTime >= 0) video.addEventListener('loadedmetadata', () => { if (canReadProtectedData()) video.currentTime = Math.min(startTime, Number.isFinite(video.duration) ? video.duration : startTime); }, { once: true });
    video.src = sourceUrl;
    frame.append(video);
    const cleanupRotation = window.MangaReaderVideoRotation.install(frame, video, normalized.rotate90Direction);
    windowCleanups.push(cleanupRotation);
  }
  else if (base.a && base.b) { const iframe = document.createElement('iframe'); iframe.src = 'https://www.' + base.a + '.com/embed/' + base.b; iframe.title = title; iframe.allowFullscreen = true; frame.append(iframe); }
  else { const link = document.createElement('a'); link.className = 'glassBtn'; link.href = sourceUrl || '#'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = '元ページを開く'; frame.append(link); }

  const markerList = document.createElement('div'); markerList.className = 'videoPlayerMarkerList'; markerList.innerHTML = '<h3>登録した秒数</h3><div class="videoMarkerList"></div>';
  const markerItems = markerList.querySelector('.videoMarkerList');
  const markerStore = () => { try { const value = JSON.parse(localStorage.getItem('mangaReaderVideoMarkers') || '{}'); const source = value && Array.isArray(value[id]) ? value[id] : []; const normalize = window.MangaVaultPayload && window.MangaVaultPayload.normalizeVideoMarkers; return normalize ? (normalize({ [id]: source })[id] || []) : source.map((marker) => ({ seconds: Number(marker.seconds) || 0, icon: ['water', 'triangle', 'toilet'].includes(marker.icon) ? marker.icon : 'triangle' })); } catch (_) { return []; } };
  const formatMarker = (seconds) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  const markerSvg = (icon) => ({ water: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C9.2 6 5 10.1 5 14a7 7 0 0 0 14 0c0-3.9-4.2-8-7-12Zm-3.5 12a3.5 3.5 0 0 0 3.5 3.5"/></svg>', triangle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3L12 4Z"/></svg>', toilet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h8v6H5zM4 9h14l-2 7a4 4 0 0 1-4 3h-2a5 5 0 0 1-5-4L4 9Zm9 10v2m4-2 2 2"/></svg>' })[icon] || '';
  const markerNames = { water: '水しぶき', triangle: '上向き三角', toilet: 'トイレマーク' };
  const renderPageMarkers = () => { markerItems.replaceChildren(); markerStore().slice().sort((a, b) => a.seconds - b.seconds).forEach((marker) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'videoPlayerMarkerButton'; button.setAttribute('aria-label', markerNames[marker.icon] + ' ' + formatMarker(Number(marker.seconds) || 0) + 'へ移動'); button.innerHTML = markerSvg(marker.icon); button.addEventListener('click', () => { const target = frame.querySelector('video'); if (target) { target.currentTime = marker.seconds; target.play(); } }); markerItems.append(button); }); markerList.hidden = !markerItems.children.length; };
  renderPageMarkers();
  listenWindow('manga-video-markers-changed', renderPageMarkers);

  const back = document.createElement('a'); back.className = 'glassBtn videoBack'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
  const relatedBox = document.createElement('aside'); relatedBox.className = 'videoRelated'; const relatedHeading = document.createElement('h3'); relatedHeading.textContent = '関連動画'; relatedBox.append(relatedHeading);
  related.forEach(({ item, itemVideo, itemTitle, itemTags }) => { const link = document.createElement('a'); link.className = 'videoRelatedItem'; link.href = 'video-player.html?id=' + encodeURIComponent(item.id); const thumb = document.createElement('span'); thumb.className = 'videoRelatedThumb'; if (window.MangaReaderVideoThumbnailRenderer) window.MangaReaderVideoThumbnailRenderer.render(thumb, itemVideo); const text = document.createElement('span'); text.className = 'videoRelatedText'; text.textContent = itemTitle; const tagsText = document.createElement('small'); tagsText.textContent = itemTags.slice(0, 3).map((tag) => '#' + tag).join(' '); text.append(tagsText); link.append(thumb, text); relatedBox.append(link); });
  const description = document.createElement('details'); description.className = 'videoPlayerDescription';
  const descriptionSummary = document.createElement('summary'); descriptionSummary.textContent = normalized.memo ? '動画のメモ' : '動画情報';
  const descriptionText = document.createElement('p'); descriptionText.textContent = normalized.memo || [base.a, base.b].filter(Boolean).join(' / ') || '動画'; description.append(descriptionSummary, descriptionText);
  const main = document.createElement('section'); main.className = 'videoPlayerMain'; main.append(frame, heading, info, actionBar, description, markerList, back); const layout = document.createElement('div'); layout.className = 'videoPlayerLayout'; layout.append(main, relatedBox); page.replaceChildren(layout);
  resumePendingLocalSync();
  }
  handleAccessStatus();
})();

