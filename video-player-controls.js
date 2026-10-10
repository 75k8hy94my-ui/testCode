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
  const id = new URLSearchParams(location.search).get('id') || 'unknown';
  const key = 'mangaReaderVideoMarkers';
  const read = () => { try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; } };
  const save = (markers) => { if (!canReadProtectedData()) return; try { const all = read(); all[id] = markers; localStorage.setItem(key, JSON.stringify(all)); } catch (_) {} };
  const normalizeMarkers = window.MangaVaultPayload && window.MangaVaultPayload.normalizeVideoMarkers;
  const markers = normalizeMarkers ? normalizeMarkers({ [id]: read()[id] })[id] || [] : (Array.isArray(read()[id]) ? read()[id].map((marker) => ({ seconds: Number(marker.seconds) || 0, icon: ['water', 'triangle', 'toilet'].includes(marker.icon) ? marker.icon : 'triangle' })) : []);
  let selectedMarkerIcon = 'water';
  video.controls = false;
  const frame = video.closest('.videoPlayerFrame');
  if (!frame) return;
  frame.classList.add('customVideoPlayer');
  const controls = document.createElement('div'); controls.className = 'customVideoControls';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'customVideoButton'; play.textContent = '▶'; play.setAttribute('aria-label', '再生');
  const seekWrap = document.createElement('div'); seekWrap.className = 'customVideoSeekWrap';
  const seek = document.createElement('input'); seek.type = 'range'; seek.className = 'customVideoSeek'; seek.min = '0'; seek.max = '0'; seek.step = '0.1'; seek.value = '0'; seek.setAttribute('aria-label', '再生位置'); seekWrap.append(seek);
  const time = document.createElement('span'); time.className = 'customVideoTime'; time.textContent = '0:00 / 0:00';
  const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'customVideoButton customVideoMute'; mute.setAttribute('aria-label', 'ミュート');
  const muteIcon = document.createElement('img'); muteIcon.className = 'customVideoMuteIcon'; muteIcon.alt = ''; muteIcon.setAttribute('aria-hidden', 'true'); mute.append(muteIcon);
  const volume = document.createElement('input'); volume.type = 'range'; volume.className = 'customVideoVolume'; volume.min = '0'; volume.max = '100'; volume.step = '1'; volume.value = String(Math.round(video.volume * 100)); volume.setAttribute('aria-label', '音量');
  const volumeGroup = document.createElement('div'); volumeGroup.className = 'customVideoVolumeGroup'; volumeGroup.append(mute, volume);
  const full = document.createElement('button'); full.type = 'button'; full.className = 'customVideoButton'; full.textContent = '⛶'; full.setAttribute('aria-label', '全画面');
  const markerToggle = document.createElement('button'); markerToggle.type = 'button'; markerToggle.className = 'customVideoButton'; markerToggle.textContent = '秒数登録';
  controls.append(play, seekWrap, time, volumeGroup, markerToggle, full); frame.append(controls);
  const markerPanel = document.createElement('div'); markerPanel.className = 'videoMarkerPanel'; markerPanel.hidden = true;
  const iconSvg = (icon) => ({ water: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C9.2 6 5 10.1 5 14a7 7 0 0 0 14 0c0-3.9-4.2-8-7-12Zm-3.5 12a3.5 3.5 0 0 0 3.5 3.5"/></svg>', triangle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 9 16H3L12 4Z"/></svg>', toilet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h8v6H5zM4 9h14l-2 7a4 4 0 0 1-4 3h-2a5 5 0 0 1-5-4L4 9Zm9 10v2m4-2 2 2"/></svg>' })[icon];
  const iconLabels = { water: '水しぶき', triangle: '上向き三角', toilet: 'トイレマーク' };
  const iconChoices = document.createElement('div'); iconChoices.className = 'videoMarkerChoices'; iconChoices.setAttribute('role', 'group'); iconChoices.setAttribute('aria-label', '登録アイコン');
  ['water', 'triangle', 'toilet'].forEach((icon) => { const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'videoMarkerIconChoice'; choice.dataset.markerIcon = icon; choice.setAttribute('aria-label', iconLabels[icon]); choice.setAttribute('aria-pressed', String(icon === selectedMarkerIcon)); choice.innerHTML = iconSvg(icon); choice.addEventListener('click', () => { selectedMarkerIcon = icon; Array.from(iconChoices.children).forEach((item) => item.setAttribute('aria-pressed', String(item === choice))); }); iconChoices.append(choice); });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'videoMarkerAdd'; add.textContent = '現在位置に登録';
  const list = document.createElement('div'); list.className = 'videoMarkerList';
  markerPanel.append(iconChoices, add, list);
  frame.append(markerPanel);
  const notice = document.createElement('div'); notice.className = 'videoMarkerNotice'; frame.append(notice);
  const format = (value) => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
  let markerBubbles = [];
  const update = () => { seek.max = String(Number.isFinite(video.duration) ? video.duration : 0); seek.value = String(video.currentTime || 0); time.textContent = format(video.currentTime) + ' / ' + format(video.duration); const current = markers.find((marker) => Math.abs(marker.seconds - video.currentTime) < 1); notice.innerHTML = current ? iconSvg(current.icon) : ''; notice.setAttribute('aria-label', current ? iconLabels[current.icon] : ''); notice.classList.toggle('visible', Boolean(current)); };
  const renderMarkers = () => { list.replaceChildren(); markerBubbles.forEach((node) => node.remove()); markerBubbles = []; markers.slice().sort((a, b) => a.seconds - b.seconds).forEach((marker) => { const bubble = document.createElement('button'); bubble.type = 'button'; bubble.className = 'videoMarkerBubble'; bubble.dataset.seconds = String(marker.seconds); bubble.style.left = (Number(video.duration) > 0 ? Math.max(0, Math.min(100, marker.seconds / video.duration * 100)) : 0) + '%'; bubble.setAttribute('aria-label', iconLabels[marker.icon] + ' ' + format(marker.seconds) + 'へ移動'); bubble.innerHTML = iconSvg(marker.icon); bubble.addEventListener('click', (event) => { event.stopPropagation(); video.currentTime = marker.seconds; video.play(); }); seekWrap.append(bubble); markerBubbles.push(bubble); const button = document.createElement('button'); button.type = 'button'; button.className = 'videoMarkerListItem'; button.setAttribute('aria-label', iconLabels[marker.icon] + ' ' + format(marker.seconds) + 'へ移動'); button.innerHTML = iconSvg(marker.icon); button.addEventListener('click', () => { video.currentTime = marker.seconds; video.play(); }); const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'videoMarkerRemove'; remove.textContent = '×'; remove.setAttribute('aria-label', iconLabels[marker.icon] + 'を削除'); remove.addEventListener('click', () => { const index = markers.indexOf(marker); if (index >= 0) markers.splice(index, 1); save(markers); renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); }); const row = document.createElement('span'); row.append(button, remove); list.append(row); }); };
  play.addEventListener('click', () => video.paused ? video.play() : video.pause()); video.addEventListener('play', () => { play.textContent = '❚❚'; }); video.addEventListener('pause', () => { play.textContent = '▶'; }); video.addEventListener('loadedmetadata', () => { update(); renderMarkers(); }); video.addEventListener('timeupdate', update); seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
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
  video.addEventListener('volumechange', syncVolume);
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
  markerToggle.addEventListener('click', () => { markerPanel.hidden = !markerPanel.hidden; renderMarkers(); }); add.addEventListener('click', () => { const seconds = Math.max(0, Number(video.currentTime) || 0); markers.push({ seconds, icon: selectedMarkerIcon }); save(markers); renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); });
  const handleArrowSeek = (event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; const target = event.target; if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName || '') || target.closest?.('button,input,textarea,select,[contenteditable="true"]'))) return; event.preventDefault(); const duration = Number.isFinite(video.duration) ? video.duration : Infinity; video.currentTime = Math.max(0, Math.min(duration, (Number(video.currentTime) || 0) + (event.key === 'ArrowLeft' ? -10 : 10))); };
  document.addEventListener('keydown', handleArrowSeek);
  let hideTimer; const showControls = () => { frame.classList.add('controlsVisible'); clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!video.paused && markerPanel.hidden && !controls.contains(document.activeElement)) frame.classList.remove('controlsVisible'); }, 2500); };
  const gestureController = Gestures && Gestures.create({
    onSingleTap: () => { video.paused ? video.play() : video.pause(); },
    onDoubleTap: (event) => {
      const action = Gestures.actionAt(event.clientX, video.getBoundingClientRect());
      if (action === 'seekBackward') video.currentTime = Math.max(0, video.currentTime - 10);
      else if (action === 'seekForward') video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, video.currentTime + 10);
      else toggleFullscreen();
    },
  });
  video.addEventListener('click', (event) => { showControls(); if (gestureController) gestureController.tap(event); });
  frame.addEventListener('mousemove', showControls); frame.addEventListener('touchstart', showControls, { passive: true }); controls.addEventListener('focusin', showControls); controls.addEventListener('focusout', showControls);
  renderMarkers(); update(); showControls();
  disposeCurrent = () => { clearTimeout(hideTimer); if (document.removeEventListener) document.removeEventListener('keydown', handleArrowSeek); if (gestureController) gestureController.destroy(); try { video.pause(); } catch (_) {} controls.remove(); markerPanel.remove(); notice.remove(); delete video.dataset.customControlsReady; };
  }
  function handleAccessChange() { if (canReadProtectedData()) initializeControls(); else destroy(); }
  window.MangaReaderVideoPlayerControls = Object.freeze({ destroy, initialize: initializeControls });
  document.addEventListener('manga-reader-vpn-status', handleAccessChange);
  initializeControls();
})();
