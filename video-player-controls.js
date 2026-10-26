(() => {
  'use strict';
  const mediaAccess = window.MangaReaderMediaAccess;
  const Gestures = window.MangaReaderVideoGestures;
  let disposeCurrent = () => {};
  function canReadProtectedData() {
    return !!mediaAccess && typeof mediaAccess.canReadProtectedData === 'function' && mediaAccess.canReadProtectedData() === true;
  }
  function destroy() { disposeCurrent(); disposeCurrent = () => {}; }
  function initializeControls() {
  if (!canReadProtectedData()) return;
  const video = document.querySelector('#videoPlayerPage video');
  if (!video || video.dataset.customControlsReady === '1') return;
  video.dataset.customControlsReady = '1';
  const nativeControls = video.controls;
  // The same controls operate on a real MP4 or a virtual edited sequence.
  const playback = video.__virtualPlaybackAdapter || video;
  const id = new URLSearchParams(location.search).get('id') || 'unknown';
  const key = 'mangaReaderVideoMarkers';
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } };
  const save = async (nextMarkers, deletedMarkers = []) => {
    if (!canReadProtectedData()) throw new Error('VPN接続を確認できるまで動画マーカーを変更できません。');
    const normalize = window.MangaVaultPayload && window.MangaVaultPayload.normalizeVideoMarkers;
    const normalized = normalize ? (normalize({ [id]: nextMarkers })[id] || []) : nextMarkers;
    const persist = () => { const all = read(); if (normalized.length) all[id] = normalized; else delete all[id]; localStorage.setItem(key, JSON.stringify(all)); };
    if (window.TestCodeGuest?.isActive()) { persist(); return normalized; }
    const vault = window.MangaVault;
    if (!vault || typeof vault.markLocalChangesPending !== 'function' || typeof vault.saveLocalChanges !== 'function') throw new Error('保管庫を開いてからマーカーを変更してください。');
    if (deletedMarkers.length) {
      const pointerPath = window.MangaVaultPayload && window.MangaVaultPayload.pointerPath;
      if (typeof vault.recordSyncDeletion !== 'function' || typeof pointerPath !== 'function') throw new Error('削除を同期用journalへ記録できません。');
      await vault.recordSyncDeletion(deletedMarkers.map((marker) => pointerPath('videoMarkers', id, marker.id)), persist);
    } else {
      if (!vault.markLocalChangesPending()) throw new Error('未同期状態を端末に記録できません。マーカーは変更していません。');
      persist();
    }
    try { await vault.saveLocalChanges(); notice.textContent = ''; }
    catch (_) { notice.textContent = '端末には保存しました。クラウド未同期のため、通信復旧後に再試行します。'; }
    return normalized;
  };
  const newMarkerId = () => 'marker-' + (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join(''));
  const normalizeMarkers = window.MangaVaultPayload && window.MangaVaultPayload.normalizeVideoMarkers;
  const markers = normalizeMarkers ? normalizeMarkers({ [id]: read()[id] })[id] || [] : (Array.isArray(read()[id]) ? read()[id].map((marker) => ({ seconds: Number(marker.seconds) || 0, icon: ['water', 'triangle', 'toilet', 'hand'].includes(marker.icon) ? marker.icon : 'triangle' })) : []);
  let selectedMarkerIcon = 'water';
  video.controls = false;
  const frame = video.closest('.videoPlayerFrame');
  if (!frame) return;
  frame.classList.add('customVideoPlayer');
  const controls = document.createElement('div'); controls.className = 'customVideoControls';
  // Playback changes only through this prominent center button, not video taps.
  const play = document.createElement('button'); play.type = 'button'; play.className = 'customVideoCenterPlay'; play.textContent = '▶'; play.setAttribute('aria-label', '再生');
  frame.append(play);
  const seekWrap = document.createElement('div'); seekWrap.className = 'customVideoSeekWrap';
  const seek = document.createElement('input'); seek.type = 'range'; seek.className = 'customVideoSeek'; seek.min = '0'; seek.max = '0'; seek.step = '0.1'; seek.value = '0'; seek.setAttribute('aria-label', '再生位置'); seekWrap.append(seek);
  const time = document.createElement('span'); time.className = 'customVideoTime'; time.textContent = '0:00 / 0:00';
  const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'customVideoButton customVideoMute'; mute.setAttribute('aria-label', 'ミュート');
  const muteIcon = document.createElement('img'); muteIcon.className = 'customVideoMuteIcon'; muteIcon.alt = ''; muteIcon.setAttribute('aria-hidden', 'true'); mute.append(muteIcon);
  const volume = document.createElement('input'); volume.type = 'range'; volume.className = 'customVideoVolume'; volume.min = '0'; volume.max = '100'; volume.step = '1'; volume.value = String(Math.round(video.volume * 100)); volume.setAttribute('aria-label', '音量');
  const volumeGroup = document.createElement('div'); volumeGroup.className = 'customVideoVolumeGroup'; volumeGroup.append(mute, volume);
  const full = document.createElement('button'); full.type = 'button'; full.className = 'customVideoButton'; full.textContent = '⛶'; full.setAttribute('aria-label', '全画面');
  const markerToggle = document.createElement('button'); markerToggle.type = 'button'; markerToggle.className = 'customVideoButton'; markerToggle.textContent = '秒数登録';
  controls.append(seekWrap, time, volumeGroup, markerToggle, full); frame.append(controls);
  const markerPanel = document.createElement('div'); markerPanel.className = 'videoMarkerPanel'; markerPanel.hidden = true;
  const iconSvg = (icon) => ({ water: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C9.2 6 5 10.1 5 14a7 7 0 0 0 14 0c0-3.9-4.2-8-7-12Zm-3.5 12a3.5 3.5 0 0 0 3.5 3.5"/></svg>', triangle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3L12 4Z"/></svg>', toilet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h8v6H5zM4 9h14l-2 7a4 4 0 0 1-4 3h-2a5 5 0 0 1-5-4L4 9Zm9 10v2m4-2 2 2"/></svg>' , hand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.8 21c-1.2-1.7-2.5-3.7-3.4-5.4-.6-1.2-.2-2.2.7-2.6.9-.4 1.7 0 2.3.8l1.4 1.8V4.2a1.5 1.5 0 0 1 3 0v8.1c.2-1.1.8-1.6 1.6-1.6 1 0 1.5.6 1.5 1.6v1.1c.2-1.2.8-1.7 1.6-1.7 1 0 1.5.7 1.5 1.7v.7l.6-9.4a1.5 1.5 0 0 1 3 .2l-.5 11.4c-.2 3-2.1 4.7-4.8 4.7H5.8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>' })[icon];
  const iconLabels = { water: '水しぶき', triangle: '上向き三角', toilet: 'トイレマーク', hand: '人差し指・小指・親指を伸ばした手' };
  const iconChoices = document.createElement('div'); iconChoices.className = 'videoMarkerChoices'; iconChoices.setAttribute('role', 'group'); iconChoices.setAttribute('aria-label', '登録アイコン');
  ['water', 'triangle', 'toilet', 'hand'].forEach((icon) => { const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'videoMarkerIconChoice'; choice.dataset.markerIcon = icon; choice.setAttribute('aria-label', iconLabels[icon]); choice.setAttribute('aria-pressed', String(icon === selectedMarkerIcon)); choice.innerHTML = iconSvg(icon); choice.addEventListener('click', () => { selectedMarkerIcon = icon; Array.from(iconChoices.children).forEach((item) => item.setAttribute('aria-pressed', String(item === choice))); }); iconChoices.append(choice); });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'videoMarkerAdd'; add.textContent = '現在位置に登録';
  const list = document.createElement('div'); list.className = 'videoMarkerList';
  const periodControls = document.createElement('div'); periodControls.className = 'videoMarkerPeriodControls';
  const startInput = document.createElement('input'); startInput.type = 'number'; startInput.min = '0'; startInput.step = '0.1'; startInput.placeholder = '開始秒'; startInput.setAttribute('aria-label', '期間の開始秒');
  const endInput = document.createElement('input'); endInput.type = 'number'; endInput.min = '0'; endInput.step = '0.1'; endInput.placeholder = '終了秒'; endInput.setAttribute('aria-label', '期間の終了秒');
  const startHere = document.createElement('button'); startHere.type = 'button'; startHere.textContent = '開始を現在位置に'; startHere.addEventListener('click', () => { startInput.value = String(Number(playback.currentTime) || 0); });
  const endHere = document.createElement('button'); endHere.type = 'button'; endHere.textContent = '終了を現在位置に'; endHere.addEventListener('click', () => { endInput.value = String(Number(playback.currentTime) || 0); });
  const addPeriod = document.createElement('button'); addPeriod.type = 'button'; addPeriod.className = 'videoMarkerAdd'; addPeriod.textContent = '期間を登録';
  periodControls.append(startInput, startHere, endInput, endHere, addPeriod);
  markerPanel.append(iconChoices, add, periodControls, list);
  frame.append(markerPanel);
  const notice = document.createElement('div'); notice.className = 'videoMarkerNotice'; frame.append(notice);
  const format = (value) => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
  let markerBubbles = [];
  const update = () => { seek.max = String(Number.isFinite(playback.duration) ? playback.duration : 0); seek.value = String(playback.currentTime || 0); time.textContent = format(playback.currentTime) + ' / ' + format(playback.duration); const current = markers.find((marker) => marker.endSeconds != null ? playback.currentTime >= marker.seconds && playback.currentTime <= marker.endSeconds : Math.abs(marker.seconds - playback.currentTime) < 1); notice.innerHTML = current ? iconSvg(current.icon) : ''; notice.setAttribute('aria-label', current ? iconLabels[current.icon] : ''); notice.classList.toggle('visible', Boolean(current)); };
  const renderMarkers = () => { list.replaceChildren(); markerBubbles.forEach((node) => node.remove()); markerBubbles = []; markers.slice().sort((a, b) => a.seconds - b.seconds).forEach((marker) => { const bubble = document.createElement('button'); bubble.type = 'button'; bubble.className = marker.endSeconds != null ? 'videoMarkerBubble videoMarkerPeriodBubble' : 'videoMarkerBubble'; if(marker.endSeconds != null){ bubble.style.width = Math.max(0, Math.min(100, (marker.endSeconds - marker.seconds) / (Number(playback.duration) || 1) * 100)) + '%'; bubble.title = format(marker.seconds) + '〜' + format(marker.endSeconds); } bubble.dataset.seconds = String(marker.seconds); bubble.style.left = (Number(playback.duration) > 0 ? Math.max(0, Math.min(100, marker.seconds / playback.duration * 100)) : 0) + '%'; bubble.setAttribute('aria-label', iconLabels[marker.icon] + ' ' + format(marker.seconds) + (marker.endSeconds != null ? '〜' + format(marker.endSeconds) : '') + 'へ移動'); bubble.innerHTML = iconSvg(marker.icon); bubble.addEventListener('click', (event) => { event.stopPropagation(); playback.currentTime = marker.seconds; playback.play(); }); seekWrap.append(bubble); markerBubbles.push(bubble); const button = document.createElement('button'); button.type = 'button'; button.className = 'videoMarkerListItem'; button.setAttribute('aria-label', iconLabels[marker.icon] + ' ' + format(marker.seconds) + 'へ移動'); button.innerHTML = iconSvg(marker.icon); button.addEventListener('click', () => { playback.currentTime = marker.seconds; playback.play(); }); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'videoMarkerRemove'; remove.textContent = '×'; remove.setAttribute('aria-label', iconLabels[marker.icon] + 'を削除'); remove.addEventListener('click', () => { const next = markers.filter((item) => item !== marker); save(next, [marker]).then((saved) => { markers.splice(0, markers.length, ...saved); renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); }).catch((error) => { notice.textContent = error.message || 'マーカーを削除できませんでした。'; }); }); const row = document.createElement('span'); row.append(button, remove); list.append(row); }); };
  const syncPlayState = () => {
    const isPlaying = !playback.paused;
    play.textContent = isPlaying ? '❚❚' : '▶';
    play.setAttribute('aria-label', isPlaying ? '一時停止' : '再生');
    play.setAttribute('aria-pressed', String(isPlaying));
  };
  const onPlay = () => { syncPlayState(); showControls(); };
  const onPause = () => { syncPlayState(); showControls(); };
  const onMetadata = () => { update(); renderMarkers(); };
  const onTimeUpdate = update;
  const onSeekInput = () => { playback.currentTime = Number(seek.value); };
  const onVideoClick = (event) => { if (gestureController) gestureController.tap(event); else toggleControls(); };
  const onFrameMouseMove = () => { if (Date.now() - lastSurfaceTapAt > 400) showControls(); };
  const onControlsFocus = () => showControls();
  play.addEventListener('click', (event) => {
    event.stopPropagation();
    if (playback.paused) {
      const result = playback.play();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } else playback.pause();
    showControls();
  });
  video.addEventListener('play', onPlay); video.addEventListener('pause', onPause);
  video.addEventListener('loadedmetadata', onMetadata); video.addEventListener('timeupdate', onTimeUpdate);
  const onVirtualUpdate = () => {
    update();
    syncPlayState();
  };
  if (video.__virtualPlaybackAdapter) video.addEventListener('virtual-edit-state', onVirtualUpdate);
  seek.addEventListener('input', onSeekInput);
  let lastAudibleVolume = video.volume > 0 ? video.volume : 1;
  const syncVolume = () => {
    const level = Math.round(video.volume * 100);
    const silent = video.muted || level === 0;
    if (!video.muted && level > 0) lastAudibleVolume = video.volume;
    volume.value = String(silent ? 0 : level);
    volume.setAttribute('aria-valuetext', (silent ? 0 : level) + '%');
    const iconSrc = silent ? 'assets/volume-muted.png' : 'assets/volume-on.png';
    if (muteIcon.getAttribute('src') !== iconSrc) muteIcon.setAttribute('src', iconSrc);
    mute.setAttribute('aria-label', silent ? 'ミュート解除' : 'ミュート');
    mute.setAttribute('aria-pressed', String(silent));
  };
  const onVolumeChange = syncVolume;
  volume.addEventListener('input', () => {
    const level = Math.max(0, Math.min(100, Number(volume.value)));
    video.volume = level / 100;
    video.muted = level === 0;
    syncVolume();
  });
  mute.addEventListener('click', () => {
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) video.volume = lastAudibleVolume;
      video.muted = false;
    } else video.muted = true;
    syncVolume();
  });
  video.addEventListener('volumechange', onVolumeChange);
  syncVolume();
  const toggleFullscreen = () => {
    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (fullscreenElement || video.webkitDisplayingFullscreen) {
      const exitVideo = video.webkitDisplayingFullscreen && video.webkitExitFullscreen;
      const exit = exitVideo ? video.webkitExitFullscreen : (document.exitFullscreen || document.webkitExitFullscreen);
      if (exit) { const result = exitVideo ? exit.call(video) : exit.call(document); if (result && typeof result.catch === 'function') result.catch(() => {}); }
      return;
    }
    let result;
    if (frame.requestFullscreen) result = frame.requestFullscreen();
    else if (frame.webkitRequestFullscreen) result = frame.webkitRequestFullscreen();
    else if (video.webkitEnterFullscreen) result = video.webkitEnterFullscreen();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  };
  full.addEventListener('click', toggleFullscreen);
  markerToggle.addEventListener('click', () => { markerPanel.hidden = !markerPanel.hidden; renderMarkers(); }); add.addEventListener('click', () => { const seconds = Math.max(0, Number(playback.currentTime) || 0); const next = markers.concat({ id: newMarkerId(), seconds, icon: selectedMarkerIcon }); save(next).then((saved) => { markers.splice(0, markers.length, ...saved); renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); }).catch((error) => { notice.textContent = error.message || 'マーカーを保存できませんでした。'; }); });
  addPeriod.addEventListener('click', () => {
    const seconds = Number(startInput.value), endSeconds = Number(endInput.value);
    if(startInput.value.trim()==='' || endInput.value.trim()==='' || !Number.isFinite(seconds) || !Number.isFinite(endSeconds) || seconds < 0 || endSeconds <= seconds || (Number.isFinite(playback.duration) && endSeconds > playback.duration)){ notice.textContent = '開始秒・終了秒を正しく指定してください。終了は開始より後、動画の長さ以内にしてください。'; return; }
    save(markers.concat({ id: newMarkerId(), seconds, endSeconds, icon: selectedMarkerIcon })).then((saved) => { markers.splice(0, markers.length, ...saved); renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); }).catch((error) => { notice.textContent = error.message || '期間を保存できませんでした。'; });
  });
  const handleArrowSeek = (event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; const target = event.target; if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName || '') || target.closest?.('button,input,textarea,select,[contenteditable="true"]'))) return; event.preventDefault(); const duration = Number.isFinite(playback.duration) ? playback.duration : Infinity; playback.currentTime = Math.max(0, Math.min(duration, (Number(playback.currentTime) || 0) + (event.key === 'ArrowLeft' ? -10 : 10))); };
  document.addEventListener('keydown', handleArrowSeek);
  let hideTimer;
  let lastSurfaceTapAt = 0;
  const hideControls = () => { clearTimeout(hideTimer); frame.classList.remove('controlsVisible'); };
  const showControls = () => {
    frame.classList.add('controlsVisible');
    clearTimeout(hideTimer);
    if (playback.paused || !markerPanel.hidden || controls.contains(document.activeElement)) return;
    hideTimer = setTimeout(() => {
      if (!playback.paused && markerPanel.hidden && !controls.contains(document.activeElement)) hideControls();
    }, 2500);
  };
  const toggleControls = () => {
    lastSurfaceTapAt = Date.now();
    if (frame.classList.contains('controlsVisible')) hideControls();
    else showControls();
  };
  const gestureController = Gestures && Gestures.create({
    onSingleTap: toggleControls,
    onDoubleTap: (event) => {
      const action = Gestures.actionAt(event.clientX, video.getBoundingClientRect());
      if (action === 'seekBackward') playback.currentTime = Math.max(0, playback.currentTime - 10);
      else if (action === 'seekForward') playback.currentTime = Math.min(Number.isFinite(playback.duration) ? playback.duration : Infinity, playback.currentTime + 10);
      else toggleFullscreen();
      showControls();
    },
  });
  video.addEventListener('click', onVideoClick);
  frame.addEventListener('mousemove', onFrameMouseMove);
  controls.addEventListener('focusin', onControlsFocus); controls.addEventListener('focusout', onControlsFocus);
  renderMarkers(); update(); syncPlayState(); showControls();
  disposeCurrent = () => {
    clearTimeout(hideTimer);
    if (document.removeEventListener) document.removeEventListener('keydown', handleArrowSeek);
    video.removeEventListener?.('play', onPlay); video.removeEventListener?.('pause', onPause);
    video.removeEventListener?.('loadedmetadata', onMetadata); video.removeEventListener?.('timeupdate', onTimeUpdate);
    video.removeEventListener?.('virtual-edit-state', onVirtualUpdate);
    video.removeEventListener?.('volumechange', onVolumeChange); video.removeEventListener?.('click', onVideoClick);
    seek.removeEventListener?.('input', onSeekInput);
    frame.removeEventListener?.('mousemove', onFrameMouseMove);
    controls.removeEventListener?.('focusin', onControlsFocus); controls.removeEventListener?.('focusout', onControlsFocus);
    if (gestureController) gestureController.destroy();
    try { playback.pause(); } catch (_) {}
    video.controls = nativeControls;
    play.remove(); controls.remove(); markerPanel.remove(); notice.remove();
    delete video.dataset.customControlsReady;
  };
  }
  function handleAccessChange() { if (canReadProtectedData()) initializeControls(); else destroy(); }
  window.MangaReaderVideoPlayerControls = Object.freeze({ destroy, initialize: initializeControls });
  document.addEventListener('manga-reader-vpn-status', handleAccessChange);
  initializeControls();
})();
