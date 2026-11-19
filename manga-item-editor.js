(function (root) {
  'use strict';
  const MAX_URLS = 40;
  const FIELDS = [
    ['title', 'タイトル', true], ['author', '作者'], ['circleName', 'サークル'],
    ['series', 'シリーズ'], ['sourceWork', '元ネタ・原作'],
    ['sourceUrl', '元ページURL']
  ];

  function safeUrl(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.length > 4096) throw new Error('URLは4096文字以下にしてください。');
    try {
      const parsed = new URL(text);
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error('invalid');
      return text;
    } catch (_) { throw new Error('URLには http:// または https:// から始まる正しいアドレスを入力してください。'); }
  }
  function urls(item) {
    return Array.isArray(item?.sourceUrls) && item.sourceUrls.length
      ? item.sourceUrls.slice() : item?.url ? [item.url] : [];
  }
  function parseRange(startValue, endValue) {
    const parse = (value, label) => {
      if (value == null || String(value).trim() === '') return null;
      const text = String(value).trim();
      const number = Number(text);
      if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(number) || number < 1 || number > 2000)
        throw new Error(label + 'は1～2000の整数で入力してください。');
      return number;
    };
    const start = parse(startValue, '開始ページ') ?? 1;
    const end = parse(endValue, '終了ページ');
    if (end != null && end < start) throw new Error('終了ページは開始ページ以上にしてください。');
    return { start, end };
  }
  function supportsRange(url) {
    try {
      const parsed = new URL(url);
      return String(url).endsWith('#1') || (typeof root.MangaSourceType?.isHitomiGalleryUrl === 'function' && root.MangaSourceType.isHitomiGalleryUrl(url)) ||
        /\/[^/]*\d+[^/]*\.(?:jpe?g|png|webp|avif|gif)$/i.test(parsed.pathname);
    } catch (_) { return false; }
  }
  function normalize(source, input, folders) {
    const result = { ...source };
    for (const [key, label, required] of FIELDS) {
      const text = String(input[key] ?? '').trim();
      if (required && !text) throw new Error(label + 'は空欄にできません。');
      if (key !== 'sourceUrl' && text.length > (key === 'title' ? 500 : 300)) throw new Error(label + 'が長すぎます。');
      result[key] = key === 'sourceUrl' ? safeUrl(text) : text;
    }
    const tags = String(input.tags || '').split(/[,、，]/).map(value => value.trim()).filter(Boolean);
    result.tags = [...new Set(tags)];
    if (result.tags.length > 200 || result.tags.some(value => value.length > 200)) throw new Error('タグは200件以下・各200文字以下にしてください。');
    result.favorite = !!input.favorite;
    result.isDoujin = !!input.isDoujin;
    const folder = String(input.folderId || '');
    if (folder && !folders.some(entry => String(entry.id) === folder)) throw new Error('フォルダが見つかりません。');
    result.folderId = folder || null;
    const values = Array.isArray(input.sourceUrls) ? input.sourceUrls : [];
    if (values.length > MAX_URLS) throw new Error('漫画URLは40件以下にしてください。');
    result.sourceUrls = [...new Set(values.map(safeUrl).filter(Boolean))];
    if (!result.sourceUrls.length && !source.localSync && !source.encryptedAssets?.pages?.length &&
        !source.pages?.length && !source.pageManifest?.pages?.length) {
      throw new Error('この作品の漫画URLは空欄にできません。');
    }
    result.url = result.sourceUrls[0] || '';
    const range = parseRange(input.pageRangeStart, input.pageRangeEnd);
    if ((range.start !== 1 || range.end != null) && !result.sourceUrls.some(supportsRange))
      throw new Error('ページ範囲は #1・連番画像・対応する外部漫画URLに指定してください。');
    delete result.pageRangeStart;
    delete result.pageRangeEnd;
    if (range.start !== 1) result.pageRangeStart = range.start;
    if (range.end != null) result.pageRangeEnd = range.end;
    return result;
  }

  function create({ documentRef: doc, windowRef: win, getState, setState, persistItems,
                    persistAuthorCards, authorSync, render, canReadProtectedData }) {
    if (!doc || !getState || !setState || !persistItems || !authorSync || !canReadProtectedData) {
      throw new Error('漫画個別編集を初期化できません。');
    }
    if (!doc.getElementById('mangaItemEditorStyles')) {
      const link = doc.createElement('link');
      link.id = 'mangaItemEditorStyles';
      link.rel = 'stylesheet';
      link.href = 'manga-item-editor.css?v=20261115-page-range';
      doc.head.appendChild(link);
    }
    const overlay = doc.createElement('section');
    overlay.className = 'manga-item-edit-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '漫画1冊を編集');
    const panel = doc.createElement('div');
    panel.className = 'manga-item-edit-panel';
    const head = doc.createElement('header');
    const heading = doc.createElement('h2');
    heading.textContent = '漫画の個別編集';
    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '閉じる';
    head.append(heading, closeButton);
    const form = doc.createElement('form');
    form.noValidate = true;
    const body = doc.createElement('div');
    body.className = 'manga-item-edit-body';
    const controls = {};
    const makeLabel = (label, control) => {
      const wrapper = doc.createElement('label');
      wrapper.className = 'manga-item-edit-field';
      const caption = doc.createElement('span');
      caption.textContent = label;
      wrapper.append(caption, control);
      return wrapper;
    };
    const grid = doc.createElement('div');
    grid.className = 'manga-item-edit-grid';
    for (const [key, label] of FIELDS) {
      const input = doc.createElement('input');
      input.name = key;
      input.type = key === 'sourceUrl' ? 'url' : 'text';
      input.autocomplete = 'off';
      controls[key] = input;
      grid.appendChild(makeLabel(label, input));
    }
    const tags = doc.createElement('input');
    tags.name = 'tags'; tags.type = 'text';
    tags.placeholder = 'カンマ区切り';
    controls.tags = tags;
    grid.appendChild(makeLabel('タグ', tags));

    const folder = doc.createElement('select');
    folder.name = 'folderId'; controls.folderId = folder;
    grid.appendChild(makeLabel('フォルダ', folder));
    for (const [key, label] of [['favorite', 'お気に入り'], ['isDoujin', '同人誌']]) {
      const box = doc.createElement('input');
      box.type = 'checkbox'; box.name = key; controls[key] = box;
      const wrapper = makeLabel(label, box);
      wrapper.classList.add('manga-item-edit-check');
      grid.appendChild(wrapper);
    }
    const urlSection = doc.createElement('section');
    urlSection.className = 'manga-item-edit-urls';
    const urlHeading = doc.createElement('h3');
    urlHeading.textContent = '漫画URL（1件につき1欄）';
    const urlList = doc.createElement('div');
    urlList.className = 'manga-item-edit-url-list';
    const addUrl = doc.createElement('button');
    addUrl.type = 'button'; addUrl.textContent = '＋ URLを追加';
    urlSection.append(urlHeading, urlList, addUrl);
    const range = doc.createElement('section');
    range.className = 'manga-item-edit-range';
    const rangeHeading = doc.createElement('h3');
    rangeHeading.textContent = '連番ページの範囲（任意）';
    const rangeInputs = doc.createElement('div');
    rangeInputs.className = 'manga-item-edit-grid';
    for (const [key, label, placeholder] of [
      ['pageRangeStart', '開始ページ', '1'],
      ['pageRangeEnd', '終了ページ', '例：19']
    ]) {
      const input = doc.createElement('input');
      input.type = 'number'; input.min = '1'; input.max = '2000'; input.step = '1';
      input.inputMode = 'numeric'; input.name = key; input.placeholder = placeholder;
      controls[key] = input;
      rangeInputs.appendChild(makeLabel(label, input));
    }
    const rangeHelp = doc.createElement('p');
    rangeHelp.textContent = '未指定なら1ページ目から自動取得。開始2・終了19なら #2～#19、2.webp～19.webp だけを読み込みます。すべての候補URLに共通です。';
    range.append(rangeHeading, rangeInputs, rangeHelp);
    const notice = doc.createElement('p');
    notice.className = 'manga-item-edit-notice';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    const foot = doc.createElement('footer');
    const cancel = doc.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'キャンセル';
    const save = doc.createElement('button');
    save.type = 'submit'; save.textContent = '変更を保存';
    save.className = 'manga-item-edit-save';
    foot.append(cancel, save);
    body.append(grid, urlSection, range, notice);
    form.append(body, foot);
    panel.append(head, form);
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    let activeId = '';
    let previousFocus = null;

    function displayUrls(values) {
      urlList.replaceChildren();
      const entries = values.length ? values : [''];
      entries.forEach(value => {
        const row = doc.createElement('div');
        row.className = 'manga-item-edit-url-row';
        const input = doc.createElement('input');
        input.type = 'url'; input.value = value || '';
        input.placeholder = 'https://';
        input.setAttribute('aria-label', '漫画URL ' + (urlList.children.length + 1));
        input.autocomplete = 'off';
        const remove = doc.createElement('button');
        remove.type = 'button'; remove.textContent = '削除';
        remove.setAttribute('aria-label', 'この漫画URLを削除');
        remove.addEventListener('click', () => {
          row.remove();
          if (!urlList.children.length) displayUrls(['']);
          renumber();
        });
        row.append(input, remove);
        urlList.appendChild(row);
      });
      renumber();
      addUrl.disabled = urlList.children.length >= MAX_URLS;
    }
    function renumber() {
      [...urlList.querySelectorAll('input')].forEach((input, index) => {
        input.setAttribute('aria-label', '漫画URL ' + (index + 1));
      });
      addUrl.disabled = urlList.children.length >= MAX_URLS;
    }
    function close() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      activeId = '';
      notice.textContent = '';
      previousFocus?.focus?.({ preventScroll: true });
    }
    function open(itemOrId) {
      if (!canReadProtectedData()) return false;
      const id = String(itemOrId?.id || itemOrId || '');
      const item = getState().savedItems.find(candidate => String(candidate.id) === id);
      if (!item) return false;
      activeId = id;
      previousFocus = doc.activeElement;
      for (const [key] of FIELDS) controls[key].value = item[key] || '';
      controls.tags.value = Array.isArray(item.tags) ? item.tags.join(', ') : '';
      controls.favorite.checked = item.favorite === true;
      controls.isDoujin.checked = item.isDoujin === true;
      folder.replaceChildren();
      const empty = doc.createElement('option');
      empty.value = ''; empty.textContent = '指定なし';
      folder.appendChild(empty);
      (getState().savedFolders || []).forEach(entry => {
        const option = doc.createElement('option');
        option.value = String(entry.id); option.textContent = entry.name || entry.id;
        folder.appendChild(option);
      });
      folder.value = item.folderId || '';
      displayUrls(urls(item));
      controls.pageRangeStart.value = item.pageRangeStart ?? '';
      controls.pageRangeEnd.value = item.pageRangeEnd ?? '';
      notice.textContent = '';
      overlay.hidden = false;
      controls.title.focus({ preventScroll: true });
      return true;
    }
    addUrl.addEventListener('click', () => {
      if (urlList.children.length >= MAX_URLS) return;
      const prior = [...urlList.querySelectorAll('input')].map(input => input.value);
      displayUrls([...prior, '']);
      urlList.lastElementChild?.querySelector('input')?.focus();
    });
    function saveChanges(event) {
      event.preventDefault();
      if (!canReadProtectedData()) { notice.textContent = 'VPN接続・保管庫の状態を確認してください。'; return; }
      const original = getState();
      const before = original.savedItems.find(item => String(item.id) === activeId);
      if (!before) { notice.textContent = '対象の漫画が見つかりません。'; return; }
      let updated;
      try {
        const values = Object.fromEntries(FIELDS.map(([key]) => [key, controls[key].value]));
        values.tags = controls.tags.value;
        values.favorite = controls.favorite.checked;
        values.isDoujin = controls.isDoujin.checked;
        values.folderId = folder.value;
        values.sourceUrls = [...urlList.querySelectorAll('input')].map(input => input.value);
        values.pageRangeStart = controls.pageRangeStart.value;
        values.pageRangeEnd = controls.pageRangeEnd.value;
        updated = normalize(before, values, original.savedFolders || []);
      } catch (error) { notice.textContent = error.message || '入力内容を確認してください。'; return; }
      const savedItems = original.savedItems.map(item => String(item.id) === activeId ? updated : item);
      const synchronized = authorSync.synchronize({
        savedItems, authorCards: original.authorCards,
        createId: () => 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        now: () => Date.now()
      });
      setState({ savedItems, authorCards: synchronized.authorCards });
      try {
        if (persistItems() === false) throw new Error('漫画の端末保存に失敗しました。');
        if (synchronized.changed && persistAuthorCards() === false) throw new Error('作者情報の保存に失敗しました。');
      } catch (error) {
        setState({ savedItems: original.savedItems, authorCards: original.authorCards });
        try { persistItems(); } catch (_) {}
        if (synchronized.changed) { try { persistAuthorCards(); } catch (_) {} }
        notice.textContent = '保存に失敗したため変更を戻しました。' + (error.message || '');
        return;
      }
      render();
      close();
    }
    form.addEventListener('submit', saveChanges);
    closeButton.addEventListener('click', close);
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    function escape(event) { if (!overlay.hidden && event.key === 'Escape') { event.preventDefault(); close(); } }
    function vpnChanged() { if (!canReadProtectedData()) close(); }
    doc.addEventListener('keydown', escape);
    doc.addEventListener('manga-reader-vpn-status', vpnChanged);

    return Object.freeze({
      open, close,
      destroy() {
        close();
        doc.removeEventListener('keydown', escape);
        doc.removeEventListener('manga-reader-vpn-status', vpnChanged);
        overlay.remove();
      }
    });
  }
  root.MangaItemEditor = Object.freeze({ create, normalize, urls, safeUrl, parseRange, MAX_URLS });
})(typeof self !== 'undefined' ? self : globalThis);
