// Publish virtual edits to ordinary video-library cards without re-encoding MP4s.
(() => {
  'use strict';
  const root = document.getElementById('virtualVideoEditor');
  const Publish = window.MangaReaderVideoVirtualPublish;
  const Editor = window.MangaReaderVideoVirtualEditorDraft;
  if (!root || !Publish || !Editor) return;

  let running = false;
  let installed = false;
  let refs = {};
  const getEditor = () => Editor.snapshot();
  const titleFor = (draft) => draft.title || '編集済み動画';

  function show(message, isError = false) {
    if (!refs.status) return;
    refs.status.textContent = message;
    refs.status.dataset.error = isError ? '1' : '0';
  }
  function targets() {
    try {
      return Publish.createPublisher().listOverwriteTargets();
    } catch (_) { return []; }
  }
  function setBusy(value) {
    running = value;
    [refs.asNew, refs.asClips, refs.overwrite, refs.target].forEach((control) => {
      if (control) control.disabled = value;
    });
  }
  function refreshTargets() {
    if (!refs.target || running) return;
    const before = refs.target.value;
    const items = targets();
    const route = new URLSearchParams(location.search);
    const preferred = route.get('published') || route.get('id') || '';
    refs.target.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '上書き可能な元MP4がありません';
      refs.target.append(empty);
      refs.overwrite.disabled = true;
      return;
    }
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title;
      refs.target.append(option);
    });
    const available = new Set(items.map((item) => item.id));
    refs.target.value = available.has(before) ? before : available.has(preferred) ? preferred : items[0].id;
    refs.overwrite.disabled = false;
  }

  async function publish(mode) {
    if (running) return;
    const draft = getEditor();
    if (!draft) return show('先にタイムラインへ動画を追加し、編集状態を確認してください。', true);
    if (mode === 'split' && draft.edit.clips.length < 2) {
      return show('分割して複数登録するには、再生ヘッドで２つ以上のクリップに分割してください。', true);
    }
    const targetId = mode === 'overwrite' ? refs.target.value : '';
    if (mode === 'overwrite') {
      if (!targetId) return show('上書きする元動画を選択してください。', true);
      if (!confirm('選択した既存動画の再生内容を編集版に変更しますか？\n元のMP4は残り、あとから「元動画に戻す」で復元できます。')) return;
    }
    if (mode === 'split' && !confirm(draft.edit.clips.length + '個の区間を、それぞれ独立した動画として一覧に追加しますか？')) return;
    setBusy(true);
    refs.result.replaceChildren();
    show('一覧に登録しています…');
    try {
      const answer = await Publish.createPublisher().publish({
        mode, edit: draft.edit, title: titleFor(draft), targetId,
      });
      const label = mode === 'overwrite' ? '既存動画を編集版に変更しました'
        : answer.count + '本の動画を一覧へ追加しました';
      show(label + (answer.synced ? '。保管庫への同期も完了しました。' : '。端末保存済み・保管庫同期待ちです。'), !answer.synced);
      const open = document.createElement('a');
      open.className = 'vveAction primary';
      open.href = 'video-player.html?id=' + encodeURIComponent(answer.ids[0]);
      open.textContent = '登録した動画を開く';
      const library = document.createElement('a');
      library.className = 'vveAction';
      library.href = 'video.html';
      library.textContent = '動画一覧へ';
      refs.result.append(open, library);
    } catch (error) {
      show(error && error.message ? error.message : '一覧への登録に失敗しました。', true);
    } finally {
      setBusy(false);
      refreshTargets();
    }
  }

  function mount() {
    if (installed || !root.querySelector('.vveMainGrid')) return;
    const main = root.querySelector('.vveMainGrid');
    installed = true;
    const section = document.createElement('section');
    section.className = 'vvePanel vvePublishPanel';
    section.dataset.publishPanel = '1';
    section.innerHTML = [
      '<div class="vvePublishHeading"><div><h2 class="vvePaneTitle">完成した動画を一覧に保存</h2>',
      '<p class="vveLead">MP4を生成・ダウンロードせずに、編集区間と回転情報から１本の動画として再生します。</p></div></div>',
      '<div class="vvePublishGrid">',
      '<div class="vvePublishChoice"><strong>１本として新規追加</strong><p>編集したタイムライン全体を、新しい動画カード１枚として登録します。</p>',
      '<button class="vveAction primary" type="button" data-publish-new>１本の動画として追加</button></div>',
      '<div class="vvePublishChoice"><strong>分割ごとに新規追加</strong><p>V1の各クリップをそれぞれ独立した動画として登録。回転設定も引き継ぎます。</p>',
      '<button class="vveAction" type="button" data-publish-clips>すべての分割を別動画として追加</button></div>',
      '<div class="vvePublishChoice"><strong>既存動画の編集版として上書き</strong>',
      '<p>元のMP4は保存したまま、通常の再生だけを編集版に変更。再生画面から元に戻せます。</p>',
      '<label class="vveField">上書き先の動画<select data-publish-target aria-label="上書きする動画"></select></label>',
      '<button class="vveAction" type="button" data-publish-overwrite>選択動画を編集版に変更</button></div>',
      '</div><p class="vvePublishStatus" data-publish-status role="status" aria-live="polite"></p>',
      '<div class="vvePublishResult" data-publish-result></div>',
    ].join('');
    main.append(section);
    refs = {
      status: section.querySelector('[data-publish-status]'),
      result: section.querySelector('[data-publish-result]'),
      asNew: section.querySelector('[data-publish-new]'),
      asClips: section.querySelector('[data-publish-clips]'),
      overwrite: section.querySelector('[data-publish-overwrite]'),
      target: section.querySelector('[data-publish-target]'),
    };
    refs.asNew.addEventListener('click', () => publish('new'));
    refs.asClips.addEventListener('click', () => publish('split'));
    refs.overwrite.addEventListener('click', () => publish('overwrite'));
    refreshTargets();
  }
  const observer = new MutationObserver(() => {
    if (installed && !root.querySelector('[data-publish-panel]')) installed = false;
    mount();
  });
  observer.observe(root, { childList: true });
  mount();
})();