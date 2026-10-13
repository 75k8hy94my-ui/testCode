// Premiere-inspired, timeline-first interface for the existing non-destructive MP4 editor.
// The editor model, Vault repository, validation and playback remain the authority.
(() => {
  'use strict';
  const root = document.getElementById('virtualVideoEditor');
  if (!root) return;
  let pendingToken = 0;

  const $ = (selector) => root.querySelector(selector);
  const video = () => $('[data-preview]');
  const editable = (target) => {
    const tag = String((target && target.tagName) || '').toLowerCase();
    return ['input', 'textarea', 'select', 'button'].includes(tag) || !!(target && target.isContentEditable);
  };
  const safeDuration = (media) => media && Number.isFinite(media.duration) && media.duration > 0
    ? Math.round(media.duration * 1000) / 1000 : null;

  function notify(message, failure = false) {
    const messageNode = $('[data-status]');
    if (!messageNode) return;
    messageNode.textContent = message;
    messageNode.dataset.error = failure ? '1' : '0';
  }

  function chosenSource() {
    return $('[data-source]') && $('[data-source]').value;
  }

  function selectSource(sourceId) {
    const current = chosenSource();
    if (current === sourceId) return true;
    const button = [...root.querySelectorAll('[data-source-id]')].find((node) => node.dataset.sourceId === sourceId);
    if (!button) return false;
    button.click();
    return chosenSource() === sourceId;
  }

  function syncTransform() {
    const select = $('[data-rotation]');
    const bar = $('[data-rotation-toolbar]');
    if (!select || !bar) return;
    bar.querySelectorAll('[data-rotate]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.rotate === select.value));
      button.disabled = select.disabled;
    });
  }

  function syncClock() {
    const position = $('[data-premiere-clock]');
    if (!position) return;
    const playhead = $('[data-playhead]');
    const clips = $('[data-clips]');
    const total = $('[data-total]');
    if (playhead && clips) {
      const left = Number.parseFloat(playhead.style.left) || 0;
      const ruler = $('[data-ruler]');
      const ticks = ruler && ruler.children;
      const scale = ticks && ticks.length > 1
        ? (Number.parseFloat(ticks[1].style.left) || 0) / (toSeconds(ticks[1].textContent) || 1)
        : null;
      if (scale && Number.isFinite(scale)) position.textContent = secondsLabel(left / scale);
      else position.textContent = (total && total.textContent) || '00:00';
    }
  }
  function toSeconds(value) {
    const parts = String(value || '').split(':').map(Number);
    if (!parts.length || !parts.every(Number.isFinite)) return 0;
    return parts.reduce((acc, num) => acc * 60 + num, 0);
  }
  function secondsLabel(value) {
    const v = Math.max(0, value);
    const h = Math.floor(v / 3600);
    const m = Math.floor(v / 60) % 60;
    const s = Math.floor(v % 60);
    return (h ? String(h).padStart(2,'0') + ':' : '') +
      String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function enterProgram() {
    const mode = $('[data-preview-edit]');
    if (mode && !$('[data-edit-controls]').hidden) return;
    if (mode) mode.click();
  }

  function addFullSource(sourceId = chosenSource()) {
    if (!sourceId) return notify('先に左側のMP4素材を選択してください。', true);
    const token = ++pendingToken;
    const srcMode = $('[data-preview-source]');
    if (srcMode) srcMode.click();
    if (!selectSource(sourceId)) return notify('登録済みのMP4素材が見つかりません。', true);
    const media = video();
    if (!media) return;

    const add = () => {
      if (token !== pendingToken || chosenSource() !== sourceId) return;
      const duration = safeDuration(media);
      if (!duration) return notify('このMP4から再生時間を取得できません。動画URLと配信元を確認してください。', true);
      const start = $('[data-start]'), end = $('[data-end]'), addButton = $('[data-add]');
      if (!start || !end || !addButton || addButton.disabled) return;
      start.value = '0';
      end.value = String(duration);
      const count = root.querySelectorAll('.vveClip').length;
      addButton.click();
      if (root.querySelectorAll('.vveClip').length > count) {
        $('[data-preview-edit]').click();
        notify('動画全体をタイムライン末尾に追加しました。分割位置へ再生ヘッドを移動し、S キーで分割できます。');
      }
    };
    const duration = safeDuration(media);
    if (duration && media.readyState >= 1) return add();

    const onReady = () => {
      media.removeEventListener('error', onError);
      add();
    };
    const onError = () => {
      media.removeEventListener('loadedmetadata', onReady);
      if (token === pendingToken) notify('MP4の読み込みに失敗しました。URLの有効期限などを確認してください。', true);
    };
    media.addEventListener('loadedmetadata', onReady, { once: true });
    media.addEventListener('error', onError, { once: true });
    notify('MP4を読み込み中です。メタデータを取得したら自動で配置します。');
  }

  function removeSelected() {
    const remove = $('[data-remove]');
    if (remove && !remove.disabled) remove.click();
  }

  function playPause() {
    const program = $('[data-preview-edit]');
    const currentMode = program && program.getAttribute('aria-pressed') === 'true';
    if (currentMode) {
      const control = $('[data-edit-play]');
      if (control && !control.disabled) control.click();
    } else {
      const media = video();
      if (!media) return;
      if (media.paused) {
        const attempt = media.play();
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
      } else media.pause();
    }
  }

  function install() {
    const projectBar = $('.vveProjectBar');
    const main = $('.vveMainGrid');
    if (!projectBar || !main || projectBar.dataset.premiereInstalled === '1') return;
    projectBar.dataset.premiereInstalled = '1';
    const bin = $('.vveSourcePicker');
    const preview = $('.vvePreviewPanel');
    const inspector = $('.vveDetailsPanel');
    const timeline = $('.vveTimelinePanel');
    if (!bin || !preview || !inspector || !timeline) return;
    bin.classList.add('vveMediaBin', 'vvePanel');
    bin.insertAdjacentHTML('afterbegin',
      '<div class="vveBinTitle"><strong>プロジェクト素材</strong><small>PROJECT</small></div>' +
      '<p class="vveBinHelp">素材をタイムラインにドラッグして配置できます。</p>');
    main.prepend(bin);

    const title = document.getElementById('shellTitle');
    if (title) title.textContent = 'VIDEO STUDIO';
    const modeSource = $('[data-preview-source]'), modeEdit = $('[data-preview-edit]');
    if (modeSource) modeSource.textContent = 'ソース';
    if (modeEdit) modeEdit.textContent = 'プログラム';
    const previewTitle = preview.querySelector('.vvePaneTitle');
    if (previewTitle) previewTitle.textContent = 'モニター';
    const previewHelp = preview.querySelector('.vveLead');
    if (previewHelp) previewHelp.textContent = 'Space 再生・一時停止 / I・O で範囲選択';
    const markIn = $('[data-mark-start]'), markOut = $('[data-mark-end]'), add = $('[data-add]');
    if (markIn) markIn.textContent = 'IN  I';
    if (markOut) markOut.textContent = 'OUT  O';
    if (add) add.textContent = 'IN–OUT を挿入';
    const primary = $('.vvePrimaryControls');
    if (primary) {
      const full = document.createElement('button');
      full.type = 'button'; full.className = 'vveAction primary';
      full.dataset.addFull = '1'; full.textContent = '＋ 動画全体を追加';
      full.addEventListener('click', () => addFullSource());
      primary.append(full);
    }

    const detailsTitle = inspector.querySelector('.vvePaneTitle');
    if (detailsTitle) detailsTitle.textContent = 'エフェクトコントロール';
    const detailsHelp = inspector.querySelector('.vveLead');
    if (detailsHelp) detailsHelp.textContent = 'V1で選択したクリップに適用';
    const numeric = document.createElement('details');
    numeric.className = 'vveAdvanced';
    numeric.innerHTML = '<summary>数値で微調整（任意）</summary>';
    const range = inspector.querySelector('.vveRow');
    if (range) numeric.append(range);
    inspector.querySelectorAll('.vveBoundary').forEach((item) => numeric.append(item));
    inspector.append(numeric);
    const originalRotation = $('[data-rotation]');
    if (originalRotation) {
      originalRotation.closest('label').classList.add('vveOriginalRotation');
      const bar = document.createElement('div');
      bar.className = 'vveTransform';
      bar.innerHTML = '<strong>ROTATION / 回転</strong><div class="vveRotateBar" data-rotation-toolbar role="group" aria-label="選択区間を回転">' +
        '<button type="button" data-rotate="0" aria-pressed="true">0°</button>' +
        '<button type="button" data-rotate="-90" aria-pressed="false">↶90°</button>' +
        '<button type="button" data-rotate="90" aria-pressed="false">↷90°</button>' +
        '<button type="button" data-rotate="180" aria-pressed="false">180°</button></div>' +
        '<p>回転は選択クリップにだけ適用されます。</p>';
      originalRotation.closest('label').after(bar);
      bar.addEventListener('click', (event) => {
        const choice = event.target.closest('[data-rotate]');
        if (!choice || choice.disabled) return;
        originalRotation.value = choice.dataset.rotate;
        originalRotation.dispatchEvent(new Event('change', { bubbles: true }));
        syncTransform();
      });
      originalRotation.addEventListener('change', syncTransform);
    }

    const tools = $('.vveTimelineTools');
    if (tools) {
      const split = document.createElement('button');
      split.type = 'button'; split.className = 'vveAction vveRazor';
      split.textContent = '✂ 分割 S';
      split.title = '再生ヘッドで分割 (S)';
      split.addEventListener('click', () => $('[data-split]').click());
      tools.prepend(split);
      const clock = document.createElement('span');
      clock.dataset.premiereClock = '1'; clock.className = 'vvePosition';
      clock.textContent = '00:00';
      tools.insertBefore(clock, tools.children[1] || null);
    }
    const timelineHeading = timeline.querySelector('.vvePaneTitle');
    if (timelineHeading) timelineHeading.textContent = 'シーケンス / タイムライン';
    const timelineHelp = timeline.querySelector('.vveLead');
    if (timelineHelp) timelineHelp.textContent = '再生ヘッドを目盛りで移動・Sで分割・端をドラッグして長さを変更';
    const scroll = $('[data-timeline-scroll]');
    if (scroll) {
      scroll.insertAdjacentHTML('beforebegin',
        '<div class="vveTrackCaption"><strong>V1</strong><span>VIDEO TRACK</span><span>スナップ対応</span></div>');
      scroll.addEventListener('dragover', (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        scroll.classList.add('vveDropTarget');
      });
      scroll.addEventListener('dragleave', () => scroll.classList.remove('vveDropTarget'));
      scroll.addEventListener('drop', (event) => {
        event.preventDefault();
        scroll.classList.remove('vveDropTarget');
        const id = event.dataTransfer && event.dataTransfer.getData('text/plain');
        if (id && root.querySelector('[data-source-id]')) addFullSource(id);
      });
    }
    bin.addEventListener('dragstart', (event) => {
      const target = event.target.closest('[data-source-id]');
      if (!target || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', target.dataset.sourceId);
    });
    bin.addEventListener('pointerdown', (event) => {
      const target = event.target.closest('[data-source-id]');
      if (target) target.draggable = true;
    });
    bin.addEventListener('click', () => { ++pendingToken; });
    const clips = $('[data-clips]');
    if (clips) {
      const observer = new MutationObserver(() => { syncTransform(); syncClock(); });
      observer.observe(clips, { childList: true });
      clips.addEventListener('click', () => queueMicrotask(syncTransform));
    }
    syncTransform();
    syncClock();
  }

  const observer = new MutationObserver(() => install());
  observer.observe(root, { childList: true });
  install();

  document.addEventListener('keydown', (event) => {
    if (!root.querySelector('.vveProjectBar') || event.metaKey || event.ctrlKey || event.altKey ||
        editable(event.target)) return;
    const key = String(event.key || '').toLowerCase();
    const actions = {
      ' ': playPause,
      's': () => { const split = $('[data-split]'); if (split && !split.disabled) split.click(); },
      'i': () => { const button = $('[data-mark-start]'); if (button) button.click(); },
      'o': () => { const button = $('[data-mark-end]'); if (button) button.click(); },
      'delete': removeSelected,
      'backspace': removeSelected,
      '+': () => { const b = $('[data-zoom-in]'); if (b) b.click(); },
      '=': () => { const b = $('[data-zoom-in]'); if (b) b.click(); },
      '-': () => { const b = $('[data-zoom-out]'); if (b) b.click(); }
    };
    if (!actions[key]) return;
    event.preventDefault();
    actions[key]();
  });
})();