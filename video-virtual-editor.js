(() => {
  'use strict';
  const root = document.getElementById('virtualVideoEditor');
  const Edit = window.MangaReaderVideoVirtualEdit;
  const Store = window.MangaReaderVideoVirtualEditStore;
  const Data = window.MangaReaderVideoData;
  const access = window.MangaReaderMediaAccess;
  if (!root || !Edit || !Store || !Data) {
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
  let selectedIndex = null;
  let dirty = false;
  let busy = false;
  let stale = false;
  let refs = {};
  let previewUrl = '';
  let pendingSeek = null;

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
  }
  function stopPreview() {
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
  function drawClips() {
    refs.clips.replaceChildren();
    if (!edit) {
      const message = document.createElement('div'); message.className = 'vveEmpty';
      message.textContent = 'まだ区間がありません。MP4素材と開始・終了秒を指定して追加してください。';
      refs.clips.append(message);
    } else edit.clips.forEach((clip, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'vveClip';
      button.dataset.clipIndex = String(index);
      button.setAttribute('aria-current', String(index === selectedIndex));
      const label = document.createElement('strong');
      const source = sourceFor(clip.sourceVideoId);
      label.textContent = (index + 1) + '. ' + (source ? source.title : '参照できない素材');
      const duration = document.createElement('small');
      duration.textContent = format(clip.startSeconds) + ' – ' + format(clip.endSeconds);
      button.append(label, duration);
      button.addEventListener('click', () => chooseClip(index));
      refs.clips.append(button);
    });
    refs.total.textContent = edit
      ? edit.clips.length + '区間・合計' + format(Edit.totalDuration(edit)) + '（仮想再生時間）'
      : '0区間';
    const hasSelected = !!selectedClip() && !busy && !stale;
    refs.trim.disabled = !hasSelected;
    refs.split.disabled = !hasSelected;
    refs.removeClip.disabled = !hasSelected;
    refs.moveUp.disabled = !hasSelected || selectedIndex === 0;
    refs.moveDown.disabled = !hasSelected || selectedIndex === edit.clips.length - 1;
    refs.save.disabled = busy || stale || !edit;
    refs.deleteProject.disabled = busy || !project;
    for (const key of ['add','source','title','start','end','markStart','markEnd']) refs[key].disabled = busy || stale;
    refs.projects.disabled = busy;
  }
  function chooseClip(index) {
    if (!canRead() || busy || stale || !edit || !edit.clips[index]) return;
    selectedIndex = index;
    const clip = selectedClip();
    refs.source.value = sourceFor(clip.sourceVideoId) ? clip.sourceVideoId : '';
    refs.start.value = String(clip.startSeconds);
    refs.end.value = String(clip.endSeconds);
    drawClips();
    setPreview(clip.sourceVideoId, clip.startSeconds);
  }
  function setEdit(next, nextIndex = null) {
    requireAccess();
    if (busy || stale) return;
    edit = Edit.normalizeEdit(next);
    dirty = true;
    selectedIndex = nextIndex;
    drawClips();
    if (nextIndex !== null) chooseClip(nextIndex);
    status('未保存の変更があります。');
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
      setEdit(Edit.trimClip(edit, selectedIndex, next.startSeconds, next.endSeconds), selectedIndex);
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
        edit = null;
        selectedIndex = null;
        dirty = true;
        drawClips();
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

  async function save() {
    if (!canRead() || busy || stale || !edit) return;
    const title = refs.title.value.trim();
    if (!title || title.length > 240) return status('タイトルは1〜240文字で入力してください。', true);
    busy = true;
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
      dirty = false;
      const target = new URL(location.href);
      target.searchParams.delete('id');
      target.searchParams.set('project', project.id);
      history.replaceState(null, '', target);
      status(result.synced ? '保管庫へ保存しました。' : '端末に保存しました。保管庫同期は行われていません。');
    } catch (error) {
      if (!canRead() || generation !== activeGeneration) return;
      if (error.localSaved) {
        stale = true;
        status('端末には保存済みですが、クラウド同期に失敗しました。再読み込みして確認してください。', true);
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
    dirty = false;
    selectedIndex = edit ? 0 : null;
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
      setPreview(refs.source.value);
    }
    if (stale) status('参照元のMP4が削除・変更されています。安全のため上書き保存を停止しています。', true);
    const firstId = routeSourceId || (edit ? edit.clips[0].sourceVideoId : '');
    const back = root.querySelector('[data-back]');
    if (back && sourceFor(firstId)) back.href = 'video-player.html?id=' + encodeURIComponent(firstId);
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
      return { id: String(video.id), url: v.url, title: v.title || String(video.id) };
    }).filter((source) => Edit.isMp4Url(source.url));
    const projectId = route.get('project') || '';
    if (!projectId && routeSourceId && !sourceFor(routeSourceId)) {
      throw new Error('指定された動画はMP4直リンクではないか、登録されていません。');
    }
    root.innerHTML = [
      '<div class="vveTop"><div><h2 class="vveTitle">MP4仮想編集</h2><p class="vveLead">元ファイルを変更せず、再生区間を組み立てます。</p></div>',
      '<div class="vveButtons"><a class="vveLink" href="video.html">動画一覧へ</a><a class="vveLink" data-back href="video.html">元の動画へ</a></div></div>',
      '<section class="vvePanel"><label class="vveField">編集プロジェクトを選択<select data-projects></select></label></section>',
      '<section class="vvePanel"><label class="vveField">編集版タイトル<input data-title type="text" maxlength="240" autocomplete="off" placeholder="タイトル"></label></section>',
      '<div class="vveGrid">',
      '<section class="vvePanel"><h3 class="vvePaneTitle">MP4素材プレビュー</h3>',
      '<label class="vveField">登録済みMP4動画<select data-source></select></label>',
      '<div class="vvePreview"><video data-preview controls playsinline preload="metadata" aria-label="MP4素材プレビュー"></video></div>',
      '<div class="vvePreviewMeta" data-preview-meta aria-live="polite"></div>',
      '<div class="vveRow"><label class="vveField">開始（秒）<input data-start type="number" min="0" step="any" inputmode="decimal" value="0"></label>',
      '<label class="vveField">終了（秒）<input data-end type="number" min="0" step="any" inputmode="decimal" placeholder="動画の長さ"></label></div>',
      '<div class="vveControls"><button class="vveAction" type="button" data-mark-start>現在位置を開始に</button>',
      '<button class="vveAction" type="button" data-mark-end>現在位置を終了に</button></div>',
      '<div class="vveControls"><button class="vveAction primary" type="button" data-add>区間を追加</button>',
      '<button class="vveAction" type="button" data-trim>選択区間を短縮</button>',
      '<button class="vveAction" type="button" data-split>再生位置で分割</button></div>',
      '<p class="vveFootnote">短縮は区間内への切り詰めです。元のMP4ファイルは変更しません。</p></section>',
      '<section class="vvePanel"><h3 class="vvePaneTitle">再生区間（上から順番）</h3>',
      '<div class="vveClips" data-clips></div><div class="vveTotal" data-total></div>',
      '<div class="vveControls"><button class="vveAction" type="button" data-up>上へ</button>',
      '<button class="vveAction" type="button" data-down>下へ</button>',
      '<button class="vveAction danger" type="button" data-remove>区間を削除</button></div>',
      '<p class="vveFootnote">今回の段階では素材を１区間ずつ確認できます。連続再生は第４段階で実装します。</p></section></div>',
      '<section class="vvePanel"><div class="vveButtons"><button class="vveAction primary" type="button" data-save>編集内容を保存</button>',
      '<button class="vveAction danger" type="button" data-delete-project>プロジェクトを削除</button></div>',
      '<p class="vveStatus" role="status" aria-live="polite" data-status></p></section>'
    ].join('');
    const $ = (selector) => root.querySelector(selector);
    refs = {
      projects: $('[data-projects]'), title: $('[data-title]'), source: $('[data-source]'),
      preview: $('[data-preview]'), previewMeta: $('[data-preview-meta]'),
      start: $('[data-start]'), end: $('[data-end]'), clips: $('[data-clips]'),
      total: $('[data-total]'), add: $('[data-add]'), trim: $('[data-trim]'),
      split: $('[data-split]'), removeClip: $('[data-remove]'), moveUp: $('[data-up]'),
      moveDown: $('[data-down]'), markStart: $('[data-mark-start]'), markEnd: $('[data-mark-end]'),
      save: $('[data-save]'), deleteProject: $('[data-delete-project]'), status: $('[data-status]'),
    };
    sources.forEach((source) => {
      const option = document.createElement('option');
      option.value = source.id;
      option.textContent = source.title;
      refs.source.append(option);
    });
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
    refs.add.addEventListener('click', addClip);
    refs.trim.addEventListener('click', trimClip);
    refs.split.addEventListener('click', splitClip);
    refs.removeClip.addEventListener('click', removeClip);
    refs.moveUp.addEventListener('click', () => moveClip(-1));
    refs.moveDown.addEventListener('click', () => moveClip(1));
    refs.markStart.addEventListener('click', () => mark('start'));
    refs.markEnd.addEventListener('click', () => mark('end'));
    refs.save.addEventListener('click', save);
    refs.deleteProject.addEventListener('click', removeProject);
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
    if (canRead() && dirty && !busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  handleAccess();
})();
