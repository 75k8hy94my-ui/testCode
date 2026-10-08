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
  const markers = Array.isArray(read()[id]) ? read()[id] : [];
  video.controls = false;
  const frame = video.closest('.videoPlayerFrame');
  if (!frame) return;
  frame.classList.add('customVideoPlayer');
  const controls = document.createElement('div'); controls.className = 'customVideoControls';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'customVideoButton'; play.textContent = '▶'; play.setAttribute('aria-label', '再生');
  const seek = document.createElement('input'); seek.type = 'range'; seek.className = 'customVideoSeek'; seek.min = '0'; seek.max = '0'; seek.step = '0.1'; seek.value = '0'; seek.setAttribute('aria-label', '再生位置');
  const time = document.createElement('span'); time.className = 'customVideoTime'; time.textContent = '0:00 / 0:00';
  const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'customVideoButton customVideoMute'; mute.textContent = '🔊'; mute.setAttribute('aria-label', 'ミュート');
  const volume = document.createElement('input'); volume.type = 'range'; volume.className = 'customVideoVolume'; volume.min = '0'; volume.max = '100'; volume.step = '1'; volume.value = String(Math.round(video.volume * 100)); volume.setAttribute('aria-label', '音量');
  const volumeGroup = document.createElement('div'); volumeGroup.className = 'customVideoVolumeGroup'; volumeGroup.append(mute, volume);
  const full = document.createElement('button'); full.type = 'button'; full.className = 'customVideoButton'; full.textContent = '⛶'; full.setAttribute('aria-label', '全画面');
  const markerToggle = document.createElement('button'); markerToggle.type = 'button'; markerToggle.className = 'customVideoButton'; markerToggle.textContent = '秒数登録';
  controls.append(play, seek, time, volumeGroup, markerToggle, full); frame.append(controls);
  const markerPanel = document.createElement('div'); markerPanel.className = 'videoMarkerPanel'; markerPanel.hidden = true;
  markerPanel.innerHTML = '<input class="videoMarkerSeconds" type="number" min="0" step="0.1" placeholder="秒数"><input class="videoMarkerLabel" type="text" maxlength="60" placeholder="ラベル"><button type="button">登録</button><div class="videoMarkerList"></div>';
  frame.append(markerPanel);
  const notice = document.createElement('div'); notice.className = 'videoMarkerNotice'; frame.append(notice);
  const secondsInput = markerPanel.querySelector('.videoMarkerSeconds'); const labelInput = markerPanel.querySelector('.videoMarkerLabel'); const add = markerPanel.querySelector('button'); const list = markerPanel.querySelector('.videoMarkerList');
  const format = (value) => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0'); };
  const update = () => { seek.max = String(Number.isFinite(video.duration) ? video.duration : 0); seek.value = String(video.currentTime || 0); time.textContent = format(video.currentTime) + ' / ' + format(video.duration); const current = markers.find((marker) => Math.abs(marker.seconds - video.currentTime) < 1); notice.textContent = current ? current.label : ''; notice.classList.toggle('visible', Boolean(current)); };
  const renderMarkers = () => { list.replaceChildren(); markers.slice().sort((a, b) => a.seconds - b.seconds).forEach((marker, index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = format(marker.seconds) + ' ' + marker.label; button.addEventListener('click', () => { video.currentTime = marker.seconds; video.play(); }); const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.addEventListener('click', () => { markers.splice(index, 1); save(markers); renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); }); const row = document.createElement('span'); row.append(button, remove); list.append(row); }); };
  play.addEventListener('click', () => video.paused ? video.play() : video.pause()); video.addEventListener('play', () => { play.textContent = '❚❚'; }); video.addEventListener('pause', () => { play.textContent = '▶'; }); video.addEventListener('loadedmetadata', update); video.addEventListener('timeupdate', update); seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
  let lastAudibleVolume = video.volume > 0 ? video.volume : 1;
  const syncVolume = () => {
    const level = Math.round(video.volume * 100);
    const silent = video.muted || level === 0;
    if (!video.muted && level > 0) lastAudibleVolume = video.volume;
    volume.value = String(silent ? 0 : level);
    volume.setAttribute('aria-valuetext', (silent ? 0 : level) + '%');
    mute.textContent = silent ? '🔇' : '🔊';
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
  markerToggle.addEventListener('click', () => { markerPanel.hidden = !markerPanel.hidden; if (!markerPanel.hidden) secondsInput.value = (Number(video.currentTime) || 0).toFixed(1); renderMarkers(); }); add.addEventListener('click', () => { const seconds = Number(secondsInput.value); const label = labelInput.value.trim() || '現在位置'; if (!Number.isFinite(seconds) || seconds < 0) return; markers.push({ seconds, label }); save(markers); secondsInput.value = ''; labelInput.value = ''; renderMarkers(); window.dispatchEvent(new CustomEvent('manga-video-markers-changed')); });
  let hideTimer; const showControls = () => { frame.classList.add('controlsVisible'); clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!video.paused && markerPanel.hidden) frame.classList.remove('controlsVisible'); }, 2500); };
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
  frame.addEventListener('mousemove', showControls); frame.addEventListener('touchstart', showControls, { passive: true });
  renderMarkers(); update();
  disposeCurrent = () => { clearTimeout(hideTimer); if (gestureController) gestureController.destroy(); try { video.pause(); } catch (_) {} controls.remove(); markerPanel.remove(); notice.remove(); delete video.dataset.customControlsReady; };
  }
  function handleAccessChange() { if (canReadProtectedData()) initializeControls(); else destroy(); }
  window.MangaReaderVideoPlayerControls = Object.freeze({ destroy, initialize: initializeControls });
  document.addEventListener('manga-reader-vpn-status', handleAccessChange);
  initializeControls();
})();
