(() => {
  'use strict';
  const page = document.getElementById('videoEditPage');
  const access = window.MangaReaderMediaAccess;
  const Data = window.MangaReaderVideoData;
  const VIDEO_KEY = 'mangaReaderVideos';
  const FOLDER_KEY = 'mangaReaderVideoFolders';
  const META_KEY = 'mangaReaderVideoMeta';
  const PropertyStore = window.MangaReaderVideoCustomPropertyStore;
  const CustomProperties = window.MangaReaderVideoCustomProperties;
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
  function writeVideoRecordsAtomically(videos, metadata, propertyValues = null) {
    const previousVideos = localStorage.getItem(VIDEO_KEY);
    const previousMetadata = localStorage.getItem(META_KEY);
    const propertyValuesKey = 'mangaReaderVideoPropertyValues';
    const previousPropertyValues = propertyValues == null ? null : localStorage.getItem(propertyValuesKey);
    try {
      localStorage.setItem(VIDEO_KEY, JSON.stringify(videos));
      localStorage.setItem(META_KEY, JSON.stringify(metadata));
      if (propertyValues != null) localStorage.setItem(propertyValuesKey, JSON.stringify(propertyValues));
    } catch (error) {
      try { if (previousVideos == null) localStorage.removeItem(VIDEO_KEY); else localStorage.setItem(VIDEO_KEY, previousVideos); } catch (_) {}
      try { if (previousMetadata == null) localStorage.removeItem(META_KEY); else localStorage.setItem(META_KEY, previousMetadata); } catch (_) {}
      if (propertyValues != null) { try { if (previousPropertyValues == null) localStorage.removeItem(propertyValuesKey); else localStorage.setItem(propertyValuesKey, previousPropertyValues); } catch (_) {} }
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
      <div class="videoEditField"><label for="videoEditFolder">フォルダ</label><select id="videoEditFolder" name="folder"></select><div class="videoEditUrlRow" style="margin-top:9px"><input id="videoEditNewFolder" type="text" maxlength="100" placeholder="新しいフォルダ名" autocomplete="off"><button class="videoEditButton" type="button" data-create-folder>新規作成</button></div><p class="videoEditHelp" data-folder-feedback role="status" aria-live="polite"></p></div>
      <div class="videoEditField"><label for="videoEditAlternates">サブURL（１行につき１つ）</label><textarea id="videoEditAlternates" name="alternateUrls" placeholder="サブURLを入力"></textarea><div class="videoEditUrlRow"><select id="videoEditAlternateChoice" aria-label="切替先のサブURL"></select><button type="button" class="videoEditButton" data-promote-alternate>サブをメインに切替</button></div><p class="videoEditHelp">切替後に「保存」を押すと、選んだURLを通常再生に使用します。</p></div>
       <div class="videoEditField"><label for="videoEditStatus">状態</label><select id="videoEditStatus" name="status"><option value="">未設定</option><option value="later">あとで見る</option><option value="watching">視聴中</option><option value="watched">視聴済み</option></select></div>
      <div class="videoEditField"><label for="videoEditTags">タグ（カンマ区切り）</label><input id="videoEditTags" name="tags" type="text" autocomplete="off"></div>
      <div class="videoEditField"><label for="videoEditMemo">メモ</label><textarea id="videoEditMemo" name="memo"></textarea></div>
      <label class="videoEditCheck"><input name="favorite" type="checkbox"> お気に入り</label>
      <label class="videoEditCheck"><input name="hidden" type="checkbox"> 動画を非表示</label>
      <div class="videoEditField"><label for="videoEditRotate">再生時の回転</label><select id="videoEditRotate" name="rotate"><option value="none">回転なし</option><option value="left">常に左90°回転</option><option value="right">常に右90°回転</option></select></div>
      <details class="videoEditField"><summary>再生情報・サムネイル</summary><div class="videoEditField"><label for="videoEditService">サービス名</label><input id="videoEditService" name="service" type="text" autocomplete="off"></div><div class="videoEditField"><label for="videoEditLegacyId">動画ID</label><input id="videoEditLegacyId" name="legacyId" type="text" autocomplete="off"></div><div class="videoEditField"><label for="videoEditThumbnail">サムネイルURL（任意）</label><input id="videoEditThumbnail" name="thumbnail" type="url" autocomplete="off"></div><div class="videoEditField"><label for="videoEditThumbnailTime">サムネイル時刻（mm:ss）</label><input id="videoEditThumbnailTime" name="thumbnailTime" type="text" inputmode="numeric" placeholder="0:00" autocomplete="off"></div></details>
      <p class="videoEditError" role="status" aria-live="polite"></p><div class="videoEditActions"><button class="videoEditButton danger" type="button" data-delete>動画を削除</button><a class="videoEditButton" data-cancel>キャンセル</a><button class="videoEditButton save" type="submit">保存</button></div>`;
    const elements = form.elements;
    const customValueInputs = new Map();
    if (PropertyStore && CustomProperties) {
      const customState = PropertyStore.read();
      const customSection = document.createElement('section'); customSection.className = 'videoEditCustomProperties';
      const customHeading = document.createElement('h3'); customHeading.textContent = 'カスタムプロパティ'; customSection.append(customHeading);
      const savedValues = customState.values[String(videoId)] || {};
      Object.values(customState.definitions.properties).filter((property) => property && property.deleted !== true && property.hidden !== true).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)).forEach((property) => {
        const wrapper = document.createElement('div'); wrapper.className = 'videoEditField';
        const label = document.createElement('div'); label.className = 'videoEditCustomPropertyName'; label.textContent = property.name; wrapper.append(label);
        const previous = Object.prototype.hasOwnProperty.call(savedValues, property.id) ? savedValues[property.id] : undefined;
        let control;
        if (property.type === 'long_text') { control = document.createElement('textarea'); control.value = typeof previous === 'string' ? previous : ''; }
        else if (property.type === 'checkbox') { control = document.createElement('input'); control.type = 'checkbox'; control.checked = previous === true; }
        else if (property.type === 'single_select' || property.type === 'multi_select') {
          const options = Object.values(property.options || {}).filter((option) => option && option.deleted !== true).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
          if (property.type === 'single_select' && options.length >= 2 && options.length <= 4) {
            control = document.createElement('div'); control.className = 'videoEditChoiceGroup'; control.setAttribute('role', 'group'); control.setAttribute('aria-label', property.name);
            const unset = document.createElement('button'); unset.type = 'button'; unset.textContent = '未設定'; unset.dataset.optionId = ''; unset.setAttribute('aria-pressed', previous == null ? 'true' : 'false'); control.append(unset);
            options.forEach((option) => { const choice = document.createElement('button'); choice.type = 'button'; choice.textContent = option.name; choice.dataset.optionId = option.id; choice.setAttribute('aria-pressed', previous === option.id ? 'true' : 'false'); control.append(choice); });
            const archived = property.options && property.options[previous];
            if (typeof previous === 'string' && archived && archived.deleted === true) { const choice = document.createElement('button'); choice.type = 'button'; choice.disabled = true; choice.textContent = archived.name + '（削除済み）'; choice.dataset.optionId = previous; choice.setAttribute('aria-pressed', 'true'); control.append(choice); }
            control.addEventListener('click', (event) => { const choice = event.target.closest('button[data-option-id]'); if (!choice) return; control.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', item === choice ? 'true' : 'false')); });
          } else {
            control = document.createElement(property.type === 'single_select' ? 'select' : 'div');
            if (property.type === 'single_select') { const empty = document.createElement('option'); empty.value = ''; empty.textContent = '未設定'; control.append(empty); }
            options.forEach((option) => { const input = property.type === 'single_select' ? document.createElement('option') : document.createElement('label'); if (property.type === 'single_select') { input.value = option.id; input.textContent = option.name; control.append(input); } else { const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = option.id; checkbox.checked = Array.isArray(previous) && previous.includes(option.id); input.append(checkbox, document.createTextNode(option.name)); input.className = 'videoEditCheck'; control.append(input); } });
            if (property.type === 'single_select' && typeof previous === 'string' && !options.some((option) => option.id === previous)) { const old = property.options && property.options[previous]; const stale = document.createElement('option'); stale.value = previous; stale.textContent = (old && old.name || '削除済みの選択肢') + '（削除済み）'; stale.disabled = true; control.append(stale); }
            if (property.type === 'multi_select' && Array.isArray(previous)) previous.filter((optionId) => !options.some((option) => option.id === optionId)).forEach((optionId) => { const old = property.options && property.options[optionId]; const archived = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.disabled = true; checkbox.value = optionId; archived.className = 'videoEditCheck'; archived.append(checkbox, document.createTextNode((old && old.name || '削除済みの選択肢') + '（削除済み）')); control.append(archived); });
            if (property.type === 'single_select') control.value = typeof previous === 'string' ? previous : '';
          }
        } else {
          control = document.createElement('input');
          control.type = property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text';
          if (property.type === 'number') control.step = 'any';
          control.value = previous == null ? '' : String(previous);
        }
        control.setAttribute('aria-label', property.name);
        if (property.type === 'checkbox') control.className = 'videoEditCustomCheckbox';
        wrapper.append(control); customSection.append(wrapper);
        customValueInputs.set(property.id, { property, control, previous });
      });
      if (!customValueInputs.size) { const hint = document.createElement('p'); hint.textContent = '動画プロパティ設定から項目を追加できます。'; const settings = document.createElement('a'); settings.href = 'video-properties.html'; settings.textContent = 'プロパティ設定'; hint.append(' ', settings); customSection.append(hint); }
      const anchor = form.querySelector('.videoEditError'); form.insertBefore(customSection, anchor);
    }
    elements.url.value = current.url;
    elements.title.value = current.title;
    elements.alternateUrls.value = (current.alternateUrls || []).join('\n');
    const updateAlternateChoices = () => {
      const choice = form.querySelector('#videoEditAlternateChoice');
      const previous = choice.value;
      choice.replaceChildren();
      elements.alternateUrls.value.split(/\r?\n/).map(v => v.trim()).filter(v => v && v !== elements.url.value.trim()).forEach(url => {
        const option = document.createElement('option'); option.value = url; option.textContent = url; choice.append(option);
      });
      if ([...choice.options].some(o => o.value === previous)) choice.value = previous;
    };
    elements.alternateUrls.addEventListener('input', updateAlternateChoices);
    form.querySelector('[data-promote-alternate]').addEventListener('click', () => {
      const selected = form.querySelector('#videoEditAlternateChoice').value;
      if (!selected) return;
      const oldMain = elements.url.value.trim();
      const variants = elements.alternateUrls.value.split(/\r?\n/).map(v => v.trim()).filter(v => v && v !== selected);
      if (oldMain && !variants.includes(oldMain)) variants.unshift(oldMain);
      elements.url.value = selected;
      elements.alternateUrls.value = variants.join('\n');
      updateAlternateChoices();
      elements.url.dispatchEvent(new Event('change'));
    });
    updateAlternateChoices();

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
    form.querySelector('[data-create-folder]').addEventListener('click', async () => {
      const input = form.querySelector('#videoEditNewFolder');
      const feedback = form.querySelector('[data-folder-feedback]');
      const button = form.querySelector('[data-create-folder]');
      feedback.textContent = '';
      if (!canReadProtectedData()) { feedback.textContent = '保管庫を開いてから作成してください。'; return; }
      const name = input.value.trim();
      if (!name) { feedback.textContent = 'フォルダ名を入力してください。'; return; }
      const latest = Data.normalizeFolders(read(FOLDER_KEY, []));
      if (latest.some(folder => folder.name.toLocaleLowerCase('ja') === name.toLocaleLowerCase('ja'))) {
        feedback.textContent = '同じ名前のフォルダが存在します。'; return;
      }
      button.disabled = true;
      try {
        if (!window.TestCodeGuest?.isActive()) {
          if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function' || !window.MangaVault.markLocalChangesPending()) {
            throw new Error('未同期状態を記録できません。フォルダは作成していません。');
          }
        }
        const newFolder = { id: 'vf-' + (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now()), name, createdAt: Date.now() };
        localStorage.setItem(FOLDER_KEY, JSON.stringify([...latest, newFolder]));
        const option = document.createElement('option'); option.value = newFolder.id; option.textContent = newFolder.name;
        elements.folder.append(option);
        elements.folder.value = newFolder.id;
        input.value = '';
        feedback.textContent = 'フォルダを作成しました。動画への割当ては「保存」で確定します。';
        if (!window.TestCodeGuest?.isActive()) {
          try { await window.MangaVault.saveLocalChanges(); }
          catch (_) { feedback.textContent += ' クラウドには未同期として保持しています。'; }
        }
      } catch (error) {
        feedback.textContent = error.message || 'フォルダの作成に失敗しました。';
      } finally { button.disabled = false; }
    });
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
        const updatedVideos = savedVideos.map(v => ({ ...v }));
        const newVideos = [];
        const newMeta = {};
        const now = Date.now();
        let promoted = 0;
        urls.forEach((url) => {
          const identity = Data.videoUrlIdentity(url);
          const found = updatedVideos.find(v => [v.url, ...(v.alternateUrls || [])].some(x => Data.videoUrlIdentity(x) === identity));
          if (found) {
            if (found.url !== url) { Object.assign(found, Data.promoteVideoUrl(found, url)); promoted++; }
            return;
          }
          const fields = Data.storageFieldsForVideoUrl(url);
          const videoId = 'v-' + (window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + now) + '-import-' + newVideos.length;
          const added = Data.normalizeVideo({ id: videoId, title: '', url, ...fields, addedAt: now, updatedAt: now });
          newVideos.push(added);
          updatedVideos.push(added);
          newMeta[videoId] = { title: '', folderId: null, watchStatus: '', tags: [], memo: '', favorite: false, hidden: false, rotate90: false, rotate90Direction: 'none', thumbnailUrl: '', thumbnailTimeSeconds: null, updatedAt: now };
        });
        if (!newVideos.length && !promoted) {
          error.textContent = '追加・切り替えできるURLがありません。';
          event.target.value = '';
          return;
        }
        const currentMeta = read(META_KEY, {});
        const nextMeta = currentMeta && typeof currentMeta === 'object' && !Array.isArray(currentMeta) ? { ...currentMeta, ...newMeta } : newMeta;
        if (!window.TestCodeGuest?.isActive()) {
          if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function') {
            error.textContent = '未同期状態を管理できません。動画は変更していません。保管庫を開いて再試行してください。';
            event.target.value = '';
            return;
          }
          if (!window.MangaVault.markLocalChangesPending()) {
            error.textContent = '未同期状態を記録できませんでした。動画は変更していません。保存領域を確認してください。';
            event.target.value = '';
            return;
          }
        }
        try {
          writeVideoRecordsAtomically([...newVideos, ...updatedVideos.filter(v => !newVideos.some(n => n.id === v.id))], nextMeta);
        } catch (_) {
          error.textContent = '端末に保存できませんでした。ブラウザの保存容量を確認してください。';
          event.target.value = '';
          return;
        }
        let syncMessage = '端末に保存しました。';
        if (!window.TestCodeGuest?.isActive()) {
          if (canReadProtectedData()) {
            try { await window.MangaVault.saveLocalChanges(); syncMessage = 'クラウド同期も完了しました。'; }
            catch (syncError) { syncMessage = '未同期として保持し、後で再試行します。 ' + (syncError?.message || ''); }
          } else syncMessage = 'VPN未許可のため未同期として保持しました。';
        } else syncMessage = 'ゲスト端末内に保存しました。';
        error.textContent = newVideos.length + '件追加、' + promoted + '件をメインURLに変更しました。' + syncMessage;
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
      const identity = Data.videoUrlIdentity(url);
      const matching = savedVideos.find(item => (isAddMode || String(item.id) !== videoId) &&
        [item.url, ...(item.alternateUrls || [])].some(candidate => Data.videoUrlIdentity(candidate) === identity));
      const variants = [...new Set([...elements.alternateUrls.value.split(/\r?\n/).map(v => v.trim()), ...(!isAddMode && current.url !== url ? [current.url] : [])])].filter(v => v && v !== url);
      if (variants.some(v => Data.classifyVideoUrl(v).kind === 'invalid')) { error.textContent = 'サブURLを確認してください。'; return; }
      if (variants.some(v => savedVideos.some(item => String(item.id) !== videoId && String(item.id) !== String(matching?.id || '') && [item.url, ...(item.alternateUrls || [])].some(other => other === v)))) { error.textContent = '別の動画に登録されているURLをサブにできません。'; return; }
      if (matching && !isAddMode) { error.textContent = '別の登録済み動画と同じURLです。'; return; }
      const fields = Data.storageFieldsForVideoUrl(url);
      const timestamp = elements.thumbnailTime.value.trim();
      const parsedTime = timestamp ? Data.parseMediaTime(timestamp) : null;
      if (Data.isDirectVideoUrl(url) && timestamp && parsedTime == null) {
        error.textContent = 'サムネイル時刻は mm:ss 形式で入力してください。'; return;
      }
      const a = isAddMode ? fields.a : (elements.service.value.trim() || classified.a || fields.a);
      const b = isAddMode ? fields.b : (elements.legacyId.value.trim() || classified.b || fields.b);
      const now = Date.now();
      const savedId = matching ? String(matching.id) : isAddMode ? 'v-' + (window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID() : Math.random().toString(36).slice(2) + now) : videoId;
      const nextBase = matching
        ? Data.promoteVideoUrl(matching, url)
        : isAddMode
          ? Data.normalizeVideo({ id: savedId, title: elements.title.value.trim(), url, alternateUrls: variants, a, b, addedAt: now, updatedAt: now })
          : { ...base, title: elements.title.value.trim(), url, alternateUrls: variants, a, b, updatedAt: now };
      if (matching) nextBase.alternateUrls = [...new Set([...(nextBase.alternateUrls || []), ...variants])].filter(v => v !== url);
      const storedMeta = read(META_KEY, {});
      const nextMeta = storedMeta && typeof storedMeta === 'object' && !Array.isArray(storedMeta) ? storedMeta : {};
      if (!matching) nextMeta[savedId] = { ...(nextMeta[savedId] || {}), title: matching ? (nextMeta[savedId]?.title || '') : elements.title.value.trim(), folderId: matching ? (nextMeta[savedId]?.folderId || null) : elements.folder.value || null, watchStatus: elements.status.value, tags: Data.parseTags(elements.tags.value), memo: elements.memo.value.trim(), favorite: elements.favorite.checked, hidden: elements.hidden.checked, rotate90: elements.rotate.value !== 'none', rotate90Direction: elements.rotate.value, thumbnailUrl: elements.thumbnail.value.trim(), thumbnailTimeSeconds: Data.isDirectVideoUrl(url) ? parsedTime : current.thumbnailTimeSeconds, updatedAt: Date.now() };
      const nextVideos = matching ? savedVideos.map(item => String(item.id) === savedId ? nextBase : item) : isAddMode ? [nextBase, ...savedVideos] : savedVideos.map((item) => String(item.id) === videoId ? nextBase : item);
      const propertyUpdates = [];
      if (customValueInputs.size) {
        const latestPropertyState = PropertyStore.read();
        for (const [propertyId, entry] of customValueInputs) {
          const { property, control, previous } = entry;
          let value;
          if (property.type === 'checkbox') value = control.checked;
          else if (property.type === 'single_select') value = control.matches('select') ? (control.value || null) : (control.querySelector('button[aria-pressed="true"]')?.dataset.optionId || null);
          else if (property.type === 'multi_select') {
            const activeOptionIds = new Set(Object.values(property.options || {}).filter((option) => option && option.deleted !== true).map((option) => option.id));
            const retained = Array.isArray(previous) ? previous.filter((optionId) => !activeOptionIds.has(optionId)) : [];
            value = [...new Set([...retained, ...[...control.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')].map((input) => input.value)])];
          }
          else if (property.type === 'number') value = control.value.trim() === '' ? null : Number(control.value);
          else value = control.value;
          const options = property.options || {};
          let valid = CustomProperties.validateValue(property, value, latestPropertyState.definitions);
          if (property.type === 'single_select' && value === previous && value != null && options[value]?.deleted === true) valid = true;
          if (property.type === 'multi_select' && Array.isArray(value)) valid = value.length === new Set(value).size && value.every((optionId) => typeof optionId === 'string' && (!!options[optionId] && options[optionId].deleted !== true || Array.isArray(previous) && previous.includes(optionId)));
          if (!valid) { error.textContent = `「${property.name}」の値を確認してください。`; return; }
          propertyUpdates.push({ propertyId, property, previous, value });
        }
      }
      if (saving) return;
      saving = true;
      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      try {
        if (!window.TestCodeGuest?.isActive()) {
          if (!window.MangaVault || typeof window.MangaVault.markLocalChangesPending !== 'function') {
            error.textContent = '未同期状態を管理できません。動画は変更していません。保管庫を開いて再試行してください。';
            return;
          }
          if (!window.MangaVault.markLocalChangesPending()) {
            error.textContent = '未同期状態を記録できませんでした。動画は変更していません。保存領域を確認してください。';
            return;
          }
        }
        try {
          if (customValueInputs.size && PropertyStore) {
            await PropertyStore.mutate({
              storage: localStorage,
              guest: !!window.TestCodeGuest?.isActive(),
              vault: window.MangaVault,
              pendingAlreadyMarked: !window.TestCodeGuest?.isActive(),
              sync: false,
              recipe: (latest) => {
                const values = { ...latest.values };
                const videoValues = { ...(values[String(savedId)] || {}) };
                for (const update of propertyUpdates) {
                  const latestProperty = latest.definitions.properties[update.propertyId];
                  if (!latestProperty || latestProperty.deleted === true) continue;
                  if (JSON.stringify(update.previous) === JSON.stringify(update.value)) continue;
                  videoValues[update.propertyId] = update.value;
                }
                values[String(savedId)] = videoValues;
                return { ...latest, values };
              },
              commit: () => writeVideoRecordsAtomically(nextVideos, nextMeta),
            });
          } else writeVideoRecordsAtomically(nextVideos, nextMeta);
        } catch (_) {
          error.textContent = '端末に保存できませんでした。ブラウザの保存容量を確認してください。';
          return;
        }
        if (window.TestCodeGuest?.isActive()) {
          location.href = returnTarget(returnKind, savedId);
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
      const remove = async () => {
        const latestVideos = read(VIDEO_KEY, []);
        const latestMeta = read(META_KEY, {});
        if (!Array.isArray(latestVideos)) throw new Error('動画一覧を読み込めませんでした。');
        const remaining = latestVideos.filter((item) => String(item.id) !== videoId);
        if (remaining.length === latestVideos.length) throw new Error('動画が見つかりません。');
        const remainingMeta = latestMeta && typeof latestMeta === 'object' && !Array.isArray(latestMeta) ? { ...latestMeta } : {};
        delete remainingMeta[videoId];
        try { writeVideoRecordsAtomically(remaining, remainingMeta); }
        catch (_) { throw new Error('端末に削除を保存できませんでした。ブラウザの保存容量を確認してください。'); }
        const propertyStore = window.MangaReaderVideoCustomPropertyStore;
        if (propertyStore && typeof propertyStore.removeVideoValues === 'function') {
          await propertyStore.removeVideoValues({ storage: localStorage, videoId, guest: true, alreadyJournaled: true });
        }
      };
      if (window.TestCodeGuest?.isActive()) {
        try { await remove(); } catch (failure) { error.textContent = failure.message; return; }
        location.href = 'video.html';
        return;
      }
      const vault = window.MangaVault;
      const pointerPath = window.MangaVaultPayload && window.MangaVaultPayload.pointerPath;
      if (!vault || typeof vault.recordSyncDeletion !== 'function' || typeof pointerPath !== 'function') {
        error.textContent = '保管庫を開いてから削除してください。'; return;
      }
      try { await vault.recordSyncDeletion([pointerPath('videos', videoId), pointerPath('videoMeta', videoId), pointerPath('videoPropertyValues', videoId)], remove); }
      catch (failure) { error.textContent = failure && failure.message ? failure.message : '削除を保全できませんでした。'; return; }
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
