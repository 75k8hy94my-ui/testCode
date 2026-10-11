(() => {
  'use strict';
  const root = document.getElementById('virtualVideoEditor');
  const Edit = window.MangaReaderVideoVirtualEdit;
  const Store = window.MangaReaderVideoVirtualEditStore;
  const State = window.MangaReaderVideoVirtualEditorState;
  const Playback = window.MangaReaderVideoVirtualPlayback;
  const Data = window.MangaReaderVideoData;
  const access = window.MangaReaderMediaAccess;
  if (!root || !Edit || !Store || !State || !Data) {
    if (root) root.textContent = '編集画面を初期化できませんでした。';
    return;
  }

  const route = new URLSearchParams(location.search);
  const routeSourceId = route.get('id') || '';
  let initialized = false;
  let generation = 0;
  let repository = null;
  let sources = [];
  let project = null;
  let edit = null;
  let historyState = State.createHistory(null);
  let baselineEdit = null;
  let selectedIndex = null;
  let dirty = false;
  let busy = false;
  let stale = false;
  let refs = {};
  let previewUrl = '';
  let pendingSeek = null;
  let sourceSearchTerm = '';
  let zoom = State.DEFAULT_ZOOM;
  let timelinePosition = 0;
  let pointerGesture = null;
  let previewMode = 'source';
  let resultController = null;
  let resultGeneration = 0;
  let resultSnapshot = null;

  const canRead = () => !!access && access.canReadProtectedData() === true;
  const format = (seconds) => Number.isFinite(seconds) ? Data.formatMediaTime(seconds) : '不明';
  function requireAccess() {
    if (!canRead()) throw new Error('VPN接続と保管庫へのアクセスが必要です。');
  }
  function read(key, fallback) {
    requireAccess();
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }
  function status(message, isError = false) {
    if (!refs.status) return;
    refs.status.textContent = message;
    refs.status.dataset.error = isError ? '1' : '0';
    if (refs.saveStatus) {
      refs.saveStatus.textContent = message;
      refs.saveStatus.dataset.error = isError ? '1' : '0';
    }
  }
  function loadedProjectStatus() {
    if (window.TestCodeGuest && typeof window.TestCodeGuest.isActive === 'function'
        && window.TestCodeGuest.isActive()) return '端末のゲスト領域に保存済みです。クラウド同期はありません。';
    const vault = window.MangaVault;
    if (!vault || typeof vault.hasPendingLocalChanges !== 'function') return '端末に保存済みです。';
    return vault.hasPendingLocalChanges()
      ? '端末に保存済み・保管庫同期待ちです。'
      : '端末と保管庫に保存済みです。';
  }
  function stopPreview() {
    stopResultPreview();
    if (refs.preview) {
      try {
        refs.preview.pause();
        refs.preview.removeAttribute('src');
        refs.preview.load();
      } catch (_) {}
    }
    previewUrl = '';
    pendingSeek = null;
  }
  function stopResultPreview() {
    resultGeneration++;
    if (resultController) resultController.destroy();
    resultController = null;
    resultSnapshot = null;
  }
  function renderResultState(snapshot) {
    if (!snapshot || previewMode !== 'edit') return;
    resultSnapshot = snapshot;
    timelinePosition = Math.max(0, Math.min(snapshot.totalSeconds, snapshot.virtualSeconds));
    refs.previewMeta.textContent = snapshot.error || snapshot.message || (snapshot.phase === 'idle'
      ? '編集結果の再生準備ができました。' : '');
    if (refs.editPlay) refs.editPlay.textContent = snapshot.requestedPlay ? '一時停止' : '再生';
    if (refs.editSeek) refs.editSeek.max = String(snapshot.totalSeconds);
    if (refs.editSeek && !refs.editSeek.matches?.(':active')) refs.editSeek.value = String(timelinePosition);
    if (refs.editTime) refs.editTime.textContent = format(timelinePosition) + ' / ' + format(snapshot.totalSeconds);
    refs.playhead.style.left = timelinePosition * zoom + 'px';
  }
  function rebuildResultPreview(seconds = null) {
    if (previewMode !== 'edit' || !Playback || !canRead()) return;
    const previous = resultController && resultController.snapshot();
    const targetSeconds = Number.isFinite(seconds) ? seconds
      : previous ? previous.virtualSeconds : timelinePosition;
    stopResultPreview();
    previewUrl = '';
    pendingSeek = null;
    if (refs.preview) {
      try { refs.preview.pause(); refs.preview.removeAttribute('src'); refs.preview.load(); } catch (_) {}
    }
    if (!edit) {
      refs.editControls.hidden = true;
      refs.previewMeta.textContent = '編集区間がありません。';
      return;
    }
    try {
      const token = resultGeneration;
      const controller = Playback.createController({
        video: refs.preview, edit, sources,
        onState: (snapshot) => { if (token === resultGeneration && previewMode === 'edit' && canRead()) renderResultState(snapshot); },
      });
      resultController = controller;
      refs.preview.controls = false;
      refs.editControls.hidden = false;
      refs.previewMeta.textContent = '';
      if (Number.isFinite(targetSeconds) && Edit.totalDuration(edit) > 0) {
        controller.seek(Math.max(0, Math.min(Edit.totalDuration(edit), targetSeconds)));
      }
    } catch (error) {
      refs.previewMeta.textContent = error.message || '編集結果をプレビューできません。';
      refs.editControls.hidden = false;
    }
  }
  function setPreviewMode(mode) {
    if (mode !== 'source' && mode !== 'edit') return;
    if (mode === 'edit' && !edit) return status('プレビューする区間がありません。', true);
    const seconds = resultController ? resultController.snapshot().virtualSeconds : timelinePosition;
    if (previewMode === mode) return;
    previewMode = mode;
    refs.previewSource.classList.toggle('active', mode === 'source');
    refs.previewSource.setAttribute('aria-pressed', String(mode === 'source'));
    refs.previewEdit.classList.toggle('active', mode === 'edit');
    refs.previewEdit.setAttribute('aria-pressed', String(mode === 'edit'));
    if (mode === 'edit') rebuildResultPreview(seconds);
    else {
      stopResultPreview();
      refs.editControls.hidden = true;
      refs.preview.controls = true;
      const clip = selectedClip();
      if (clip) setPreview(clip.sourceVideoId, clip.startSeconds);
    }
  }
  function showGate(message) {
    stopPreview();
    refs = {};
    initialized = false;
    repository = null;
    project = null;
    edit = null;
    sources = [];
    selectedIndex = null;
    dirty = busy = stale = false;
    const box = document.createElement('section');
    box.className = 'vveNotice vpnRouteGate';
    const heading = document.createElement('h2'); heading.textContent = message ? '編集画面を開けません' : 'VPN接続が必要です';
    const detail = document.createElement('p'); detail.textContent = message || 'VPN接続が確認されるまで動画と編集情報の読み込みを停止します。';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'vveAction';
    retry.dataset.vpnStatusButton = '1'; retry.dataset.vpnRecheckButton = '1'; retry.textContent = 'VPN接続を再確認';
    const diagnostics = document.createElement('button'); diagnostics.type = 'button'; diagnostics.className = 'vveAction';
    diagnostics.dataset.vpnDiagnosticsButton = '1'; diagnostics.textContent = 'VPN診断';
    const back = document.createElement('a'); back.className = 'vveLink'; back.href = 'video.html'; back.textContent = '動画一覧へ戻る';
    box.append(heading, detail, retry, diagnostics, back);
    root.replaceChildren(box);
    if (access && typeof access.syncUi === 'function') access.syncUi();
  }
  function handleAccess() {
    if (!canRead()) {
      generation++;
      showGate();
      return;
    }
    if (!initialized) {
      try { initialize(); }
      catch (error) { showGate('動画・編集情報を読み込めませんでした。' + (error.message || '')); }
    }
  }

  function sourceFor(id) { return sources.find((source) => source.id === id) || null; }
  function selectedClip() { return edit && selectedIndex !== null ? edit.clips[selectedIndex] || null : null; }
  function setPreview(id, seconds = null) {
    if (!canRead()) return;
    const source = sourceFor(id);
    if (!source) {
      stopPreview();
      refs.previewMeta.textContent = 'MP4素材が見つかりません。';
      return;
    }
    if (previewUrl !== source.url) {
      stopPreview();
      previewUrl = source.url;
      pendingSeek = seconds;
      refs.preview.src = source.url;
      refs.preview.load();
      refs.previewMeta.textContent = 'MP4素材を読み込み中…';
    } else if (Number.isFinite(seconds)) {
      if (refs.preview.readyState >= 1) {
        try { refs.preview.currentTime = seconds; } catch (_) {}
      } else pendingSeek = seconds;
    }
  }

  function drawProjects() {
    refs.projects.replaceChildren();
    const fresh = document.createElement('option');
    fresh.value = ''; fresh.textContent = '新しい編集プロジェクト';
    refs.projects.append(fresh);
    repository.list().forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id; option.textContent = item.title;
      refs.projects.append(option);
    });
    refs.projects.value = project ? project.id : '';
  }
  function drawSources() {
    refs.sources.replaceChildren();
    const query = sourceSearchTerm.trim().toLocaleLowerCase();
    const matches = sources.filter((source) => !query
      || source.title.toLocaleLowerCase().includes(query) || source.id.toLocaleLowerCase().includes(query));
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'vveEmpty'; empty.textContent = '該当するMP4素材がありません。';
      refs.sources.append(empty);
      return;
    }
    matches.forEach((source) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'vveSource';
      button.dataset.sourceId = source.id;
      button.disabled = busy || stale;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-pressed', String(refs.source.value === source.id));
      button.setAttribute('aria-selected', String(refs.source.value === source.id));
      button.title = source.title + (Number.isFinite(source.durationSeconds) ? '・' + format(source.durationSeconds) : '');
      const title = document.createElement('strong'); title.textContent = source.title;
      const duration = document.createElement('small');
      duration.textContent = Number.isFinite(source.durationSeconds) ? format(source.durationSeconds) : '時間未取得';
      button.append(title, duration);
      button.addEventListener('click', () => {
        refs.source.value = source.id;
        drawSources();
        changeSource();
      });
      refs.sources.append(button);
    });
  }
  function drawClips() {
    refs.clips.replaceChildren();
    const displayEdit = pointerGesture && pointerGesture.kind === 'trim' ? pointerGesture.proposed : edit;
    const timeline = displayEdit ? State.clipOffsets(displayEdit) : { offsets: [], totalSeconds: 0 };
    if (!displayEdit) {
      const message = document.createElement('div'); message.className = 'vveEmpty';
      message.textContent = 'まだ区間がありません。MP4素材と開始・終了秒を指定して追加してください。';
      refs.clips.append(message);
    } else displayEdit.clips.forEach((clip, index) => {
      const item = document.createElement('div');
      item.className = 'vveClip';
      item.dataset.clipIndex = String(index);
      item.style.width = Math.max(1, (clip.endSeconds - clip.startSeconds) * zoom) + 'px';
      item.style.flex = '0 0 auto';
      item.setAttribute('aria-current', String(index === selectedIndex));
      item.setAttribute('role', 'listitem');
      const label = document.createElement('strong');
      const source = sourceFor(clip.sourceVideoId);
      label.textContent = (index + 1) + ' · ' + (source ? source.title : '参照できない素材');
      const duration = document.createElement('small');
      duration.textContent = format(clip.endSeconds - clip.startSeconds);
      const body = document.createElement('button');
      body.type = 'button'; body.className = 'vveClipBody'; body.dataset.clipBody = '1';
      body.dataset.clipIndex = String(index);
      body.setAttribute('aria-label', (index + 1) + '番目 ' + (source ? source.title : '参照できない素材'));
      body.title = (source ? source.title : '参照できない素材') + ' · ' + format(clip.startSeconds)
        + ' – ' + format(clip.endSeconds) + ' · ' + format(clip.endSeconds - clip.startSeconds);
      body.append(label, duration);
      body.addEventListener('click', () => chooseClip(index));
      const startHandle = document.createElement('button');
      startHandle.type = 'button'; startHandle.className = 'vveTrimHandle start';
      startHandle.dataset.trimBoundary = 'start'; startHandle.dataset.clipIndex = String(index);
      startHandle.setAttribute('aria-label', '開始端点をドラッグ');
      const endHandle = document.createElement('button');
      endHandle.type = 'button'; endHandle.className = 'vveTrimHandle end';
      endHandle.dataset.trimBoundary = 'end'; endHandle.dataset.clipIndex = String(index);
      endHandle.setAttribute('aria-label', '終了端点をドラッグ');
      item.append(startHandle, body, endHandle);
      refs.clips.append(item);
    });
    if (refs.insertMarker) refs.timeline.append(refs.insertMarker);
    if (pointerGesture && pointerGesture.kind === 'move' && refs.insertMarker) {
      refs.insertMarker.hidden = false;
      refs.insertMarker.style.left = reorderMarkerSeconds(pointerGesture, timeline.offsets) * zoom + 'px';
    } else if (refs.insertMarker) refs.insertMarker.hidden = true;
    refs.clips.style.width = Math.max(1, timeline.totalSeconds * zoom) + 'px';
    refs.clips.style.position = 'relative';
    refs.timeline.style.width = Math.max(1, timeline.totalSeconds * zoom) + 'px';
    if (refs.ruler) refs.ruler.style.backgroundSize = (zoom * 5) + 'px 100%';
    refs.playhead.style.left = Math.max(0, Math.min(timeline.totalSeconds, timelinePosition || 0)) * zoom + 'px';
    const chosen = selectedClip();
    const displayChosen = pointerGesture && pointerGesture.kind === 'trim' && chosen
      ? pointerGesture.proposed.clips[selectedIndex] : chosen;
    refs.selectedDuration.textContent = displayChosen ? '長さ ' + format(displayChosen.endSeconds - displayChosen.startSeconds)
      + (pointerGesture && pointerGesture.kind === 'trim' ? ' · ' + format(displayChosen.startSeconds) + '–' + format(displayChosen.endSeconds) : '')
      : '未選択';
    refs.total.textContent = edit
      ? edit.clips.length + '区間・合計' + format(Edit.totalDuration(edit)) + '（仮想再生時間）'
      : '0区間';
    const hasSelected = !!selectedClip() && !busy && !stale;
    refs.duplicate.disabled = !hasSelected || edit.clips.length >= Edit.MAX_CLIPS;
    refs.trim.disabled = !hasSelected;
    refs.split.disabled = !hasSelected;
    refs.removeClip.disabled = !hasSelected;
    refs.moveUp.disabled = !hasSelected || selectedIndex === 0;
    refs.moveDown.disabled = !hasSelected || selectedIndex === edit.clips.length - 1;
    refs.save.disabled = busy || stale || !edit;
    const canUndo = !!historyState.past.length && !busy && !stale;
    const canRedo = !!historyState.future.length && !busy && !stale;
    refs.undo.disabled = !canUndo;
    refs.redo.disabled = !canRedo;
    refs.dirty.hidden = !dirty;
    const canPlaySaved = !!project && !dirty && !stale && !busy;
    refs.playSaved.hidden = !canPlaySaved;
    if (canPlaySaved) refs.playSaved.href = 'video-virtual-player.html?project=' + encodeURIComponent(project.id);
    else refs.playSaved.removeAttribute('href');
    refs.deleteProject.disabled = busy || !project;
    for (const key of ['add','source','title','start','end','markStart','markEnd']) refs[key].disabled = busy || stale;
    for (const key of ['startMinusOne','startMinusTenth','startPlusTenth','startPlusOne',
      'endMinusOne','endMinusTenth','endPlusTenth','endPlusOne','setStart','setEnd']) {
      refs[key].disabled = !hasSelected;
    }
    refs.projects.disabled = busy;
    drawSources();
  }
  function chooseClip(index) {
    if (!canRead() || busy || stale || !edit || !edit.clips[index]) return;
    selectedIndex = index;
    const clip = selectedClip();
    refs.source.value = sourceFor(clip.sourceVideoId) ? clip.sourceVideoId : '';
    refs.start.value = String(clip.startSeconds);
    refs.end.value = String(clip.endSeconds);
    timelinePosition = State.clipOffsets(edit).offsets[index];
    drawClips();
    drawSources();
    if (previewMode === 'edit' && resultController) resultController.seek(timelinePosition);
    else if (previewMode === 'source') setPreview(clip.sourceVideoId, clip.startSeconds);
  }
  function setEdit(next, nextIndex = null) {
    requireAccess();
    if (busy || stale) return;
    const previousVirtualSeconds = resultController ? resultController.snapshot().virtualSeconds : timelinePosition;
    if (previewMode === 'edit') stopResultPreview();
    edit = next === null ? null : Edit.normalizeEdit(next);
    selectedIndex = nextIndex;
    historyState = State.push(historyState, edit, selectedIndex);
    updateDirty();
    drawClips();
    if (nextIndex !== null) chooseClip(nextIndex);
    status('未保存の変更があります。');
    if (previewMode === 'edit') rebuildResultPreview(previousVirtualSeconds);
  }
  function updateDirty() {
    dirty = JSON.stringify(edit) !== JSON.stringify(baselineEdit);
    refs.dirty.hidden = !dirty;
  }
  function restoreHistory(snapshot) {
    requireAccess();
    if (busy || stale) return;
    const previousVirtualSeconds = resultController ? resultController.snapshot().virtualSeconds : timelinePosition;
    if (previewMode === 'edit') stopResultPreview();
    edit = snapshot.edit ? Edit.normalizeEdit(snapshot.edit) : null;
    selectedIndex = edit && snapshot.selectedIndex !== null
      ? Math.min(snapshot.selectedIndex, edit.clips.length - 1) : null;
    updateDirty();
    drawClips();
    if (selectedIndex !== null) chooseClip(selectedIndex);
    else {
      stopPreview();
      refs.previewMeta.textContent = '編集区間がありません。';
    }
    status(dirty ? '未保存の変更があります。' : '保存済みの状態に戻しました。');
    if (previewMode === 'edit') rebuildResultPreview(previousVirtualSeconds);
  }
  function undoEdit() {
    if (!canRead() || busy || stale) return;
    const result = State.undo(historyState);
    if (result.history === historyState) return;
    historyState = result.history;
    restoreHistory(result.snapshot);
  }
  function redoEdit() {
    if (!canRead() || busy || stale) return;
    const result = State.redo(historyState);
    if (result.history === historyState) return;
    historyState = result.history;
    restoreHistory(result.snapshot);
  }
  function readRange() {
    requireAccess();
    const source = sourceFor(refs.source.value);
    if (!source) throw new Error('登録済みのMP4動画を選んでください。');
    if (refs.start.value.trim() === '' || refs.end.value.trim() === '') {
      throw new Error('開始秒と終了秒を入力してください。');
    }
    const startSeconds = Number(refs.start.value), endSeconds = Number(refs.end.value);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)
        || startSeconds < 0 || endSeconds <= startSeconds) throw new Error('開始秒・終了秒の範囲が正しくありません。');
    if (previewUrl === source.url && Number.isFinite(refs.preview.duration)
        && endSeconds > refs.preview.duration + 0.05) throw new Error('終了秒が素材の長さを超えています。');
    return { sourceVideoId: source.id, startSeconds, endSeconds };
  }
  function action(fn) {
    try {
      requireAccess();
      if (busy || stale) return;
      fn();
    } catch (error) { status(error.message || '操作できませんでした。', true); }
  }
  function addClip() {
    action(() => {
      const part = Edit.createEdit([readRange()]);
      const joined = edit ? Edit.joinEdits(edit, part) : part;
      setEdit(joined, joined.clips.length - 1);
    });
  }
  function trimClip() {
    action(() => {
      const clip = selectedClip();
      if (!clip) throw new Error('区間を選択してください。');
      const next = readRange();
      if (clip.sourceVideoId !== next.sourceVideoId) throw new Error('別素材は新しい区間として追加してください。');
      const duration = sourceFor(clip.sourceVideoId)?.durationSeconds
        ?? (previewUrl === sourceFor(clip.sourceVideoId)?.url && Number.isFinite(refs.preview.duration) ? refs.preview.duration : null);
      const withStart = Edit.setClipBoundary(edit, selectedIndex, 'start', next.startSeconds, duration);
      setEdit(Edit.setClipBoundary(withStart, selectedIndex, 'end', next.endSeconds, duration), selectedIndex);
    });
  }
  function duplicateClip() {
    action(() => {
      if (!selectedClip()) throw new Error('複製する区間を選択してください。');
      setEdit(Edit.duplicateClip(edit, selectedIndex), selectedIndex + 1);
      status('選択区間の直後に複製しました。複製した区間は独立して編集できます。');
    });
  }
  function adjustBoundary(boundary, delta) {
    action(() => {
      if (!selectedClip()) throw new Error('調整する区間を選択してください。');
      const duration = previewUrl === sourceFor(selectedClip().sourceVideoId)?.url
        && Number.isFinite(refs.preview.duration) ? refs.preview.duration : null;
      const before = selectedClip()[boundary === 'start' ? 'startSeconds' : 'endSeconds'];
      const next = Edit.adjustClipBoundary(edit, selectedIndex, boundary, delta, duration);
      const after = next.clips[selectedIndex][boundary === 'start' ? 'startSeconds' : 'endSeconds'];
      if (before === after) {
        status(boundary === 'start' ? '開始位置はこれ以上前後に調整できません。' : '終了位置はこれ以上調整できません。');
        return;
      }
      setEdit(next, selectedIndex);
      status((boundary === 'start' ? '開始' : '終了') + '位置：' + format(before) + ' → ' + format(after) + '（元動画の時刻）');
    });
  }
  function setBoundaryFromPreview(boundary) {
    action(() => {
      const clip = selectedClip();
      if (!clip || refs.source.value !== clip.sourceVideoId) throw new Error('対象区間の素材をプレビューしてください。');
      const duration = Number.isFinite(refs.preview.duration) ? refs.preview.duration : null;
      const before = clip[boundary === 'start' ? 'startSeconds' : 'endSeconds'];
      const next = Edit.setClipBoundary(edit, selectedIndex, boundary, refs.preview.currentTime, duration);
      const after = next.clips[selectedIndex][boundary === 'start' ? 'startSeconds' : 'endSeconds'];
      if (before === after) {
        status('プレビュー位置が現在の区間範囲外のため、境界を変更できません。');
        return;
      }
      setEdit(next, selectedIndex);
      status((boundary === 'start' ? '開始' : '終了') + '位置：' + format(before) + ' → ' + format(after) + '（元動画の時刻）');
    });
  }
  function splitClip() {
    action(() => {
      const clip = selectedClip();
      if (!clip || refs.source.value !== clip.sourceVideoId) throw new Error('分割する区間を選択してください。');
      setEdit(Edit.splitClip(edit, selectedIndex, refs.preview.currentTime), selectedIndex + 1);
    });
  }
  function removeClip() {
    action(() => {
      if (!selectedClip()) return;
      if (edit.clips.length === 1) {
        setEdit(null, null);
        status('全区間を削除しました。新しい区間を追加するまで保存できません。');
        return;
      }
      const nextIndex = Math.max(0, selectedIndex - 1);
      setEdit(Edit.removeClip(edit, selectedIndex), nextIndex);
    });
  }
  function moveClip(direction) {
    action(() => {
      if (!selectedClip()) return;
      const nextIndex = selectedIndex + direction;
      setEdit(Edit.moveClip(edit, selectedIndex, nextIndex), nextIndex);
    });
  }
  function changeSource() {
    if (!canRead() || busy || stale) return;
    selectedIndex = null; // prevent accidental trim against a different MP4
    refs.start.value = '0';
    refs.end.value = '';
    drawClips();
    setPreview(refs.source.value);
  }
  function mark(which) {
    action(() => {
      if (!sourceFor(refs.source.value) || !Number.isFinite(refs.preview.currentTime)) return;
      refs[which].value = String(Math.round(refs.preview.currentTime * 1000) / 1000);
    });
  }

  function pointerIndex(target) {
    const index = Number(target && target.dataset && target.dataset.clipIndex);
    return Number.isInteger(index) ? index : null;
  }
  function pointerSurface(target) {
    let node = target;
    while (node) {
      const data = node.dataset || {};
      if (data.trimBoundary || data.clipBody || data.playhead) return node;
      node = node.parentElement || node.parentNode || null;
    }
    return target;
  }
  function reorderMarkerSeconds(gesture, offsets) {
    const destination = gesture.destination;
    const destinationClip = gesture.originalEdit.clips[destination];
    return (offsets[destination] || 0)
      + (destination > gesture.index && destinationClip
        ? destinationClip.endSeconds - destinationClip.startSeconds : 0);
  }
  function pointerDown(event) {
    if (!canRead() || busy || stale || !edit || event.button > 0) return;
    const target = pointerSurface(event.target || {});
    const index = pointerIndex(target);
    const offsets = State.clipOffsets(edit);
    const gesture = { pointerId: event.pointerId, originalEdit: edit, kind: 'seek', index: null,
      initialVirtualTime: timelinePosition, latestClientX: event.clientX };
    if (target.dataset && target.dataset.trimBoundary && index !== null && edit.clips[index]) {
      gesture.kind = 'trim'; gesture.index = index; gesture.boundary = target.dataset.trimBoundary;
      gesture.startX = event.clientX; gesture.proposed = edit;
      chooseClip(index);
    } else if (target.dataset && target.dataset.clipBody && index !== null && edit.clips[index]) {
      gesture.kind = 'move'; gesture.index = index; gesture.destination = index;
      chooseClip(index);
    } else if (target.dataset && target.dataset.playhead) {
      gesture.kind = 'seek';
    }
    pointerGesture = gesture;
    if (typeof refs.timeline.setPointerCapture === 'function' && Number.isFinite(event.pointerId)) {
      try { refs.timeline.setPointerCapture(event.pointerId); } catch (_) {}
    }
    if (gesture.kind === 'seek') updateSeek(event.clientX, offsets.totalSeconds);
    if (event.preventDefault) event.preventDefault();
  }
  function updateSeek(clientX, total) {
    if (!Number.isFinite(clientX) || !edit) return;
    const rect = refs.timeline.getBoundingClientRect();
    const x = clientX - rect.left + (refs.timelineScroll.scrollLeft || 0);
    const seconds = Math.max(0, Math.min(total, x / zoom));
    timelinePosition = seconds;
    const located = Edit.locateTime(edit, seconds);
    if (located) {
      if (selectedIndex !== located.clipIndex) chooseClip(located.clipIndex);
      else setPreview(located.sourceVideoId, located.sourceSeconds);
    }
    drawClips();
  }
  function pointerMove(event) {
    const gesture = pointerGesture;
    if (!gesture || (gesture.pointerId !== undefined && event.pointerId !== gesture.pointerId)) return;
    gesture.latestClientX = event.clientX;
    if (gesture.kind === 'trim') {
      const clip = gesture.originalEdit.clips[gesture.index];
      const field = gesture.boundary === 'start' ? 'startSeconds' : 'endSeconds';
      const proposedTime = clip[field] + (event.clientX - gesture.startX) / zoom;
      const source = sourceFor(clip.sourceVideoId);
      const duration = source && (source.durationSeconds
        ?? (previewUrl === source.url && Number.isFinite(refs.preview.duration) ? refs.preview.duration : null));
      try {
        gesture.proposed = Edit.setClipBoundary(gesture.originalEdit, gesture.index, gesture.boundary, proposedTime, duration);
        drawClips();
      } catch (_) { /* Keep the last valid transient boundary. */ }
    } else if (gesture.kind === 'move') {
      const rect = refs.timeline.getBoundingClientRect();
      const x = event.clientX - rect.left + (refs.timelineScroll.scrollLeft || 0);
      const at = x / zoom;
      const offsets = State.clipOffsets(gesture.originalEdit).offsets;
      let destination = offsets.length - 1;
      for (let i = 0; i < offsets.length; i++) {
        const clip = gesture.originalEdit.clips[i];
        const midpoint = offsets[i] + (clip.endSeconds - clip.startSeconds) / 2;
        if (at < midpoint) { destination = i; break; }
      }
      gesture.destination = Math.max(0, Math.min(gesture.originalEdit.clips.length - 1, destination));
      refs.status.textContent = '移動先：' + (gesture.destination + 1) + '番目';
      const scrollRect = refs.timelineScroll.getBoundingClientRect();
      const scrollRight = Number.isFinite(scrollRect.right) ? scrollRect.right : scrollRect.left + scrollRect.width;
      if (event.clientX < scrollRect.left + 32) refs.timelineScroll.scrollLeft = Math.max(0, (refs.timelineScroll.scrollLeft || 0) - 18);
      else if (event.clientX > scrollRight - 32) refs.timelineScroll.scrollLeft = (refs.timelineScroll.scrollLeft || 0) + 18;
      if (refs.insertMarker) {
        refs.insertMarker.hidden = false;
        refs.insertMarker.style.left = reorderMarkerSeconds(gesture, State.clipOffsets(gesture.originalEdit).offsets) * zoom + 'px';
      }
    } else updateSeek(event.clientX, State.clipOffsets(edit).totalSeconds);
    if (event.preventDefault) event.preventDefault();
  }
  function pointerUp(event) {
    const gesture = pointerGesture;
    if (!gesture || (gesture.pointerId !== undefined && event.pointerId !== gesture.pointerId)) return;
    pointerGesture = null;
    if (gesture.kind === 'trim' && gesture.proposed !== gesture.originalEdit) {
      setEdit(gesture.proposed, gesture.index);
      status('端点を調整しました。');
    } else if (gesture.kind === 'move' && gesture.destination !== gesture.index) {
      setEdit(Edit.moveClip(gesture.originalEdit, gesture.index, gesture.destination), gesture.destination);
      status('タイムライン上で区間を並べ替えました。');
    } else if (gesture.kind === 'seek') updateSeek(gesture.latestClientX, State.clipOffsets(edit).totalSeconds);
    if (typeof refs.timeline.releasePointerCapture === 'function' && Number.isFinite(event.pointerId)) {
      try { refs.timeline.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    drawClips();
  }
  function pointerCancel(event) {
    if (!pointerGesture || (pointerGesture.pointerId !== undefined && event.pointerId !== pointerGesture.pointerId)) return;
    pointerGesture = null;
    drawClips();
  }
  function setZoom(next) {
    const currentSeconds = resultController ? resultController.snapshot().virtualSeconds : timelinePosition;
    zoom = State.clampZoom(next);
    drawClips();
    if (resultController) resultController.seek(currentSeconds);
  }
  function fitTimeline() {
    const total = edit ? Edit.totalDuration(edit) : 0;
    if (!total) return setZoom(State.DEFAULT_ZOOM);
    const width = refs.timelineScroll.clientWidth || refs.timelineScroll.getBoundingClientRect().width;
    if (Number.isFinite(width) && width > 0) setZoom(width / total);
  }

  async function save() {
    if (!canRead() || busy || stale || !edit) return;
    const title = refs.title.value.trim();
    if (!title || title.length > 240) return status('タイトルは1〜240文字で入力してください。', true);
    busy = true;
    const priorIds = new Set(repository.list().map((item) => item.id));
    drawClips();
    const activeGeneration = generation;
    status('保存中…');
    try {
      const result = await repository.save({
        id: project ? project.id : undefined,
        expectedRevision: project ? project.revision : undefined,
        title, edit,
      });
      if (!canRead() || generation !== activeGeneration) return;
      project = result.project;
      edit = Edit.normalizeEdit(project.edit);
      baselineEdit = edit;
      historyState = State.createHistory(edit, historyState.limit);
      updateDirty();
      const target = new URL(location.href);
      target.searchParams.delete('id');
      target.searchParams.set('project', project.id);
      history.replaceState(null, '', target);
      status(result.synced ? '保管庫へ保存しました。' : '端末に保存しました。保管庫同期は行われていません。');
    } catch (error) {
      if (!canRead() || generation !== activeGeneration) return;
      if (error.localSaved) {
        const localProjects = repository.list();
        const localProject = (project && localProjects.find((item) => item.id === project.id))
          || localProjects.find((item) => !priorIds.has(item.id)
            && item.title === title && JSON.stringify(item.edit) === JSON.stringify(edit));
        if (localProject) {
          project = localProject;
          edit = Edit.normalizeEdit(localProject.edit);
          baselineEdit = edit;
          historyState = State.createHistory(edit, historyState.limit);
          updateDirty();
          const target = new URL(location.href);
          target.searchParams.delete('id');
          target.searchParams.set('project', project.id);
          history.replaceState(null, '', target);
          const guestMode = window.TestCodeGuest && typeof window.TestCodeGuest.isActive === 'function'
            && window.TestCodeGuest.isActive();
          status(guestMode ? loadedProjectStatus()
            : '端末に保存済み・保管庫同期待ちです。編集内容はこの端末に残っています。', !guestMode);
        } else {
          status('同期に失敗しました。未保存の編集内容は画面に保持しています。', true);
        }
      } else {
        if (error.code === 'VIRTUAL_EDIT_CONFLICT') stale = true;
        status(error.message || '保存に失敗しました。', true);
      }
    } finally {
      if (canRead() && generation === activeGeneration) {
        busy = false;
        drawProjects();
        drawClips();
      }
    }
  }
  async function removeProject() {
    if (!canRead() || busy || !project) return;
    if (!confirm('この編集プロジェクトを削除しますか？ 元のMP4ファイルは削除されません。')) return;
    busy = true;
    drawClips();
    const activeGeneration = generation;
    const firstSource = project.edit.clips[0]?.sourceVideoId;
    try {
      await repository.remove(project.id, project.revision);
      if (!canRead() || generation !== activeGeneration) return;
      dirty = false;
      location.href = 'video-virtual-editor.html' + (sourceFor(firstSource) ? '?id=' + encodeURIComponent(firstSource) : '');
    } catch (error) {
      if (!canRead() || generation !== activeGeneration) return;
      if (error.localSaved || error.code === 'VIRTUAL_EDIT_CONFLICT') stale = true;
      status(error.localSaved ? '端末では削除しましたがクラウド同期に失敗しました。再読み込みして確認してください。' : error.message, true);
    } finally {
      if (canRead() && generation === activeGeneration) {
        busy = false;
        drawClips();
      }
    }
  }

  function loadProject(projectId) {
    project = projectId ? repository.get(projectId) : null;
    if (projectId && !project) throw new Error('指定された編集プロジェクトが見つかりません。');
    edit = project ? Edit.normalizeEdit(project.edit) : null;
    baselineEdit = edit;
    dirty = false;
    selectedIndex = edit ? 0 : null;
    historyState = State.createHistory(edit, 100);
    stale = project ? !repository.inspect(project.id).usable : false;
    const initialSource = sourceFor(routeSourceId);
    refs.title.value = project ? project.title : (initialSource ? initialSource.title + '（編集版）' : '');
    drawProjects();
    drawClips();
    if (edit) chooseClip(0);
    else {
      refs.source.value = initialSource ? initialSource.id : (sources[0]?.id || '');
      refs.start.value = '0';
      refs.end.value = '';
      drawSources();
      setPreview(refs.source.value);
    }
    const firstId = routeSourceId || (edit ? edit.clips[0].sourceVideoId : '');
    const back = root.querySelector('[data-back]');
    if (back && sourceFor(firstId)) back.href = 'video-player.html?id=' + encodeURIComponent(firstId);
    if (stale) status('参照元のMP4が削除・変更されています。安全のため上書き保存を停止しています。', true);
    else if (project) status(loadedProjectStatus());
    else status('新しいプロジェクトです。保存すると端末に記録されます。');
  }
  function initialize() {
    if (initialized || !canRead()) return;
    repository = Store.createRepository();
    const videos = read(Store.VIDEO_KEY, []);
    const meta = read(Store.META_KEY, {});
    if (!Array.isArray(videos) || !meta || typeof meta !== 'object' || Array.isArray(meta)) {
      throw new Error('動画データの形式が不正です。');
    }
    sources = videos.map((video) => {
      const override = meta[video.id] && typeof meta[video.id] === 'object' && !Array.isArray(meta[video.id]) ? meta[video.id] : {};
      const v = Data.normalizeVideo({ ...video, ...override, id: video.id, addedAt: video.addedAt });
      return { id: String(video.id), url: v.url, title: v.title || String(video.id),
        durationSeconds: Number.isFinite(v.durationSeconds) && v.durationSeconds > 0 ? v.durationSeconds : null };
    }).filter((source) => Edit.isMp4Url(source.url));
    const projectId = route.get('project') || '';
    if (!projectId && routeSourceId && !sourceFor(routeSourceId)) {
      throw new Error('指定された動画はMP4直リンクではないか、登録されていません。');
    }
    root.innerHTML = [
      '<div class="vveProjectBar" data-project-toolbar><div class="vveProjectFields">',
      '<label class="vveField">プロジェクト<select data-projects></select></label>',
      '<label class="vveField">プロジェクト名<input data-title type="text" maxlength="240" autocomplete="off" placeholder="タイトル"></label></div>',
      '<div class="vveProjectActions"><button class="vveAction" type="button" data-undo disabled>元に戻す</button>',
      '<button class="vveAction" type="button" data-redo disabled>やり直す</button>',
      '<span class="vveDirty" data-dirty hidden>未保存</span><span class="vveSaveStatus" data-save-status role="status" aria-live="polite">端末のプロジェクトを読み込み中</span>',
      '<button class="vveAction primary" type="button" data-save>保存</button>',
      '<a class="vveLink" href="video.html">一覧へ</a><a class="vveLink" data-back href="video.html">元動画へ</a></div></div>',
      '<div class="vveMainGrid">',
      '<section class="vvePanel vvePreviewPanel"><div class="vveSectionHeading"><div><h2 class="vvePaneTitle">プレビュー</h2>',
      '<p class="vveLead">素材を確認して区間を設定します。</p></div><div class="vveModeToggle" role="group" aria-label="プレビューモード">',
      '<button class="vveAction active" type="button" data-preview-source aria-pressed="true">素材</button>',
      '<button class="vveAction" type="button" data-preview-edit aria-pressed="false">編集結果</button></div></div>',
      '<div class="vvePreview"><video data-preview controls playsinline preload="metadata" aria-label="動画プレビュー"></video></div>',
      '<div class="vvePreviewMeta" data-preview-meta aria-live="polite"></div>',
      '<div class="vveEditPreviewControls" data-edit-controls hidden><button class="vveAction primary" type="button" data-edit-play>再生</button>',
      '<input data-edit-seek type="range" min="0" max="0" step="0.05" value="0" aria-label="編集結果の再生位置"><span data-edit-time></span></div>',
      '<div class="vveSourcePicker"><label class="vveField">MP4素材を検索<input data-source-search type="search" autocomplete="off" placeholder="タイトルまたはID"></label>',
      '<div class="vveSourceList" data-source-list role="listbox" aria-label="登録済みMP4素材"></div><input data-source type="hidden"></div>',
      '<div class="vveControls vvePrimaryControls"><button class="vveAction" type="button" data-mark-start>開始を現在位置に</button>',
      '<button class="vveAction" type="button" data-mark-end>終了を現在位置に</button>',
      '<button class="vveAction primary" type="button" data-add>区間を追加</button></div></section>',
      '<section class="vvePanel vveDetailsPanel" data-clip-details><div class="vveSectionHeading"><div><h2 class="vvePaneTitle">選択区間</h2>',
      '<p class="vveLead">時刻は元動画内の位置です。</p></div><span class="vveTotal" data-selected-duration>未選択</span></div>',
      '<div class="vveRow"><label class="vveField">開始 <span class="vveTimeHint">HH:MM:SS.mmm</span>',
      '<input data-start type="number" min="0" step="0.001" inputmode="decimal" value="0"></label>',
      '<label class="vveField">終了 <span class="vveTimeHint">HH:MM:SS.mmm</span>',
      '<input data-end type="number" min="0" step="0.001" inputmode="decimal" placeholder="動画の長さ"></label></div>',
      '<div class="vveBoundary"><strong>開始</strong><div class="vveControls">',
      '<button class="vveAction" type="button" data-start-minus-one>−1秒</button><button class="vveAction" type="button" data-start-minus-tenth>−0.1</button>',
      '<button class="vveAction" type="button" data-start-plus-tenth>＋0.1</button><button class="vveAction" type="button" data-start-plus-one>＋1秒</button>',
      '<button class="vveAction" type="button" data-set-start>再生位置</button></div></div>',
      '<div class="vveBoundary"><strong>終了</strong><div class="vveControls">',
      '<button class="vveAction" type="button" data-end-minus-one>−1秒</button><button class="vveAction" type="button" data-end-minus-tenth>−0.1</button>',
      '<button class="vveAction" type="button" data-end-plus-tenth>＋0.1</button><button class="vveAction" type="button" data-end-plus-one>＋1秒</button>',
      '<button class="vveAction" type="button" data-set-end>再生位置</button></div></div>',
      '<div class="vveControls"><button class="vveAction" type="button" data-trim>入力範囲を適用</button>',
      '<button class="vveAction" type="button" data-split>分割</button><button class="vveAction" type="button" data-duplicate>複製</button>',
      '<button class="vveAction danger" type="button" data-remove>削除</button></div>',
      '<button class="vveAction danger vveProjectDelete" type="button" data-delete-project>プロジェクトを削除</button></section>',
      '<section class="vvePanel vveTimelinePanel"><div class="vveSectionHeading"><div><h2 class="vvePaneTitle">編集タイムライン</h2>',
      '<p class="vveLead">クリップ幅は仮想再生時間に比例します。</p></div><div class="vveTimelineTools">',
      '<button class="vveAction" type="button" data-zoom-out aria-label="縮小">−</button><button class="vveAction" type="button" data-zoom-in aria-label="拡大">＋</button>',
      '<button class="vveAction" type="button" data-zoom-fit>全体表示</button><button class="vveAction" type="button" data-up>←</button>',
      '<button class="vveAction" type="button" data-down>→</button></div></div>',
      '<div class="vveTimelineScroll" data-timeline-scroll tabindex="0" aria-label="仮想再生タイムライン">',
      '<div class="vveTimelineCanvas" data-timeline><div class="vveRuler" data-ruler aria-hidden="true"></div>',
      '<div class="vveClips" data-clips role="list"></div><span class="vveInsertMarker" data-insert-marker hidden></span><button class="vvePlayhead" type="button" data-playhead aria-label="再生位置"></button></div></div>',
      '<div class="vveTimelineFooter"><span class="vveTotal" data-total>0区間</span>',
      '<a class="vveAction" data-play-saved hidden>保存済み編集版を再生</a></div>',
      '<p class="vveStatus" role="status" aria-live="polite" data-status></p></section></div>'
    ].join('');
    const $ = (selector) => root.querySelector(selector);
    refs = {
      projects: $('[data-projects]'), title: $('[data-title]'), source: $('[data-source]'),
      sources: $('[data-source-list]'), sourceSearch: $('[data-source-search]'),
      preview: $('[data-preview]'), previewMeta: $('[data-preview-meta]'),
      editControls: $('[data-edit-controls]'), editPlay: $('[data-edit-play]'), editSeek: $('[data-edit-seek]'), editTime: $('[data-edit-time]'),
      start: $('[data-start]'), end: $('[data-end]'), clips: $('[data-clips]'),
      timeline: $('[data-timeline]'), timelineScroll: $('[data-timeline-scroll]'), playhead: $('[data-playhead]'),
      ruler: $('[data-ruler]'),
      insertMarker: $('[data-insert-marker]'),
      selectedDuration: $('[data-selected-duration]'), saveStatus: $('[data-save-status]'),
      total: $('[data-total]'), add: $('[data-add]'), trim: $('[data-trim]'),
      duplicate: $('[data-duplicate]'),
      startMinusOne: $('[data-start-minus-one]'), startMinusTenth: $('[data-start-minus-tenth]'),
      startPlusTenth: $('[data-start-plus-tenth]'), startPlusOne: $('[data-start-plus-one]'),
      endMinusOne: $('[data-end-minus-one]'), endMinusTenth: $('[data-end-minus-tenth]'),
      endPlusTenth: $('[data-end-plus-tenth]'), endPlusOne: $('[data-end-plus-one]'),
      setStart: $('[data-set-start]'), setEnd: $('[data-set-end]'), dirty: $('[data-dirty]'),
      split: $('[data-split]'), removeClip: $('[data-remove]'), moveUp: $('[data-up]'),
      moveDown: $('[data-down]'), markStart: $('[data-mark-start]'), markEnd: $('[data-mark-end]'),
      save: $('[data-save]'), playSaved: $('[data-play-saved]'), deleteProject: $('[data-delete-project]'), status: $('[data-status]'),
      undo: $('[data-undo]'), redo: $('[data-redo]'), previewSource: $('[data-preview-source]'),
      previewEdit: $('[data-preview-edit]'), zoomIn: $('[data-zoom-in]'), zoomOut: $('[data-zoom-out]'), zoomFit: $('[data-zoom-fit]'),
    };
    drawSources();
    refs.projects.addEventListener('change', () => {
      if (!canRead()) return;
      if (dirty && !confirm('未保存の変更を破棄して切り替えますか？')) {
        refs.projects.value = project ? project.id : '';
        return;
      }
      dirty = false;
      const url = new URL(location.href);
      url.search = refs.projects.value ? '?project=' + encodeURIComponent(refs.projects.value)
        : (sourceFor(routeSourceId) ? '?id=' + encodeURIComponent(routeSourceId) : '');
      location.href = url.href;
    });
    refs.source.addEventListener('change', changeSource);
    refs.previewSource.addEventListener('click', () => setPreviewMode('source'));
    refs.previewEdit.addEventListener('click', () => setPreviewMode('edit'));
    refs.editPlay.addEventListener('click', () => {
      if (!resultController) return;
      if (resultController.snapshot().requestedPlay) resultController.pause();
      else resultController.play();
    });
    refs.editSeek.addEventListener('input', () => {
      if (resultController) resultController.seek(Number(refs.editSeek.value));
    });
    refs.zoomIn.addEventListener('click', () => setZoom(zoom * 1.25));
    refs.zoomOut.addEventListener('click', () => setZoom(zoom / 1.25));
    refs.zoomFit.addEventListener('click', fitTimeline);
    refs.timeline.addEventListener('pointerdown', pointerDown);
    refs.timeline.addEventListener('pointermove', pointerMove);
    refs.timeline.addEventListener('pointerup', pointerUp);
    refs.timeline.addEventListener('pointercancel', pointerCancel);
    refs.timeline.addEventListener('lostpointercapture', pointerCancel);
    refs.sourceSearch.addEventListener('input', () => {
      sourceSearchTerm = refs.sourceSearch.value;
      drawSources();
    });
    refs.add.addEventListener('click', addClip);
    refs.duplicate.addEventListener('click', duplicateClip);
    refs.trim.addEventListener('click', trimClip);
    refs.split.addEventListener('click', splitClip);
    refs.removeClip.addEventListener('click', removeClip);
    refs.moveUp.addEventListener('click', () => moveClip(-1));
    refs.moveDown.addEventListener('click', () => moveClip(1));
    refs.markStart.addEventListener('click', () => mark('start'));
    refs.markEnd.addEventListener('click', () => mark('end'));
    refs.startMinusOne.addEventListener('click', () => adjustBoundary('start', -1));
    refs.startMinusTenth.addEventListener('click', () => adjustBoundary('start', -0.1));
    refs.startPlusTenth.addEventListener('click', () => adjustBoundary('start', 0.1));
    refs.startPlusOne.addEventListener('click', () => adjustBoundary('start', 1));
    refs.endMinusOne.addEventListener('click', () => adjustBoundary('end', -1));
    refs.endMinusTenth.addEventListener('click', () => adjustBoundary('end', -0.1));
    refs.endPlusTenth.addEventListener('click', () => adjustBoundary('end', 0.1));
    refs.endPlusOne.addEventListener('click', () => adjustBoundary('end', 1));
    refs.setStart.addEventListener('click', () => setBoundaryFromPreview('start'));
    refs.setEnd.addEventListener('click', () => setBoundaryFromPreview('end'));
    refs.save.addEventListener('click', save);
    refs.deleteProject.addEventListener('click', removeProject);
    refs.undo.addEventListener('click', undoEdit);
    refs.redo.addEventListener('click', redoEdit);
    document.addEventListener('keydown', (event) => {
      if (!event || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target || {};
      const tag = String(target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || target.isContentEditable) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'z' && event.shiftKey) { event.preventDefault(); redoEdit(); }
      else if (key === 'z') { event.preventDefault(); undoEdit(); }
      else if (key === 'y' && event.ctrlKey && !event.metaKey) { event.preventDefault(); redoEdit(); }
    });
    refs.preview.addEventListener('loadedmetadata', () => {
      if (!canRead()) return;
      const duration = refs.preview.duration;
      refs.previewMeta.textContent = Number.isFinite(duration)
        ? '素材の長さ：' + format(duration) : '素材の長さが取得できません。終了秒を手入力してください。';
      if (refs.end.value === '' && Number.isFinite(duration) && duration > 0) {
        refs.end.value = String(Math.round(duration * 1000) / 1000);
      }
      if (Number.isFinite(pendingSeek)) {
        try { refs.preview.currentTime = pendingSeek; } catch (_) {}
      }
      pendingSeek = null;
    });
    refs.preview.addEventListener('error', () => {
      if (canRead()) refs.previewMeta.textContent = 'MP4を読み込めません。URLの有効期限や再生形式を確認してください。';
    });
    initialized = true;
    loadProject(projectId);
  }

  document.addEventListener('manga-reader-vpn-status', handleAccess);
  document.addEventListener('manga-vault-sync-state', (event) => {
    if (!project || dirty || !event || !event.detail) return;
    if (event.detail.state === 'success') status('端末と保管庫に保存済みです。');
    else if (event.detail.state === 'pending') status('端末に保存済み・保管庫同期待ちです。');
    else if (event.detail.state === 'error') status('端末に保存済み・保管庫同期に失敗しました。', true);
  });
  window.addEventListener('storage', (event) => {
    if (!initialized || !canRead()) return;
    if (event.key === Store.VIDEO_KEY || event.key === Store.META_KEY || event.key === null) {
      stale = true;
      stopPreview();
      drawClips();
      status('別の画面で動画・編集情報が更新されました。再読み込みして確認してください。', true);
    }
  });
  window.addEventListener('beforeunload', (event) => {
    stopResultPreview();
    if (canRead() && dirty && !busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  handleAccess();
})();
