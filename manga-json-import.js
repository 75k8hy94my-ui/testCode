(function (root) {
  'use strict';
  const FORMAT = 'testcode-manga-import';
  const MAX_ITEMS = 500;
  const MAX_BYTES = 4 * 1024 * 1024;
  function safeUrl(value, { image = false, optional = false } = {}) {
    if (optional && (value == null || value === '')) return '';
    if (typeof value !== 'string' || value.length > 4096) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.port) return null;
      if (image && !/\/1\.webp$/i.test(url.pathname)) return null;
      url.hash = '';
      return url.href;
    } catch (_) { return null; }
  }
  function field(value, max, { required = false } = {}) {
    if (value == null && !required) return '';
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length > max || (required && !text) ? null : text;
  }
  function validateItem(item, index = 0) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error((index + 1) + '件目: 作品データが不正です。');
    const title = field(item.title, 500, { required: true });
    const author = field(item.author, 300, { required: true });
    const url = safeUrl(item.url, { image: true });
    const sourceUrl = safeUrl(item.sourceUrl, { optional: true });
    const circleName = field(item.circleName, 300);
    const sourceWork = field(item.sourceWork, 300);
    const tags = item.tags == null ? [] : item.tags;
    if (title == null || author == null || !url || sourceUrl == null || circleName == null || sourceWork == null || !Array.isArray(tags) || tags.length > 200 || tags.some(t => field(t, 200, { required: true }) == null)) {
      throw new Error((index + 1) + '件目: タイトル・作者・HTTPSの /1.webp URL・その他の形式を確認してください。');
    }
    return { title, author, url, sourceUrl, circleName, sourceWork, tags: tags.map(t => t.trim()) };
  }
  function parse(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('JSONファイルが大きすぎます（上限4MB）。');
    let data;
    try { data = JSON.parse(text); } catch (_) { throw new Error('正しいJSONファイルではありません。'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.format !== FORMAT || data.version !== 1 || !Array.isArray(data.items) || !data.items.length || data.items.length > MAX_ITEMS) {
      throw new Error('testCode漫画JSON形式ではありません（1〜500件のitemsが必要です）。');
    }
    return data.items.map(validateItem);
  }
  function isDuplicate(candidate, items) {
    return items.some(item => (candidate.sourceUrl && item.sourceUrl === candidate.sourceUrl) || (candidate.url && (item.url === candidate.url || item.pages?.[0] === candidate.url || item.pageManifest?.pages?.[0] === candidate.url)));
  }
  function create({ documentRef, getState, setState, authorSync, persistItems, persistAuthorCards, render, createId, now }) {
    const dialog = documentRef.querySelector('#mangaJsonImportDialog');
    const rows = documentRef.querySelector('#mangaJsonImportRows');
    const status = documentRef.querySelector('#mangaJsonImportStatus');
    if (!dialog || !rows || !status) throw new Error('JSON import UI is unavailable');
    let preview = [];
    const node = (tag, value, className) => {
      const el = documentRef.createElement(tag);
      if (value != null) el.textContent = String(value);
      if (className) el.className = className;
      return el;
    };
    function open(items) {
      preview = items.map(item => ({ ...item, tags: [...item.tags], override: false, selected: false }));
      rows.replaceChildren(); status.textContent = '';
      preview.forEach((entry, i) => {
        const duplicate = isDuplicate(entry, getState().savedItems) || isDuplicate(entry, preview.slice(0, i));
        const wrapper = node('article', null, 'manga-import-row');
        const label = node('label', ' 登録する ');
        const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = !duplicate;
        entry.selected = checkbox.checked;
        entry.override = duplicate;
        checkbox.addEventListener('change', () => { entry.selected = checkbox.checked; });
        label.prepend(checkbox);
        const title = node('h3', entry.title);
        const author = node('p', '作者: ' + entry.author);
        const image = node('p', '保存URL: ' + entry.url, 'manga-import-source-url');
        wrapper.append(label, title, author, image);
        if (duplicate) wrapper.appendChild(node('p', '重複候補です。登録する場合はチェックしてください。', 'manga-import-warnings'));
        rows.appendChild(wrapper);
      });
      dialog.hidden = false;
      return preview.length;
    }
    function close() { dialog.hidden = true; preview = []; }
    function register() {
      const selected = preview.filter(item => item.selected);
      if (!selected.length) { status.textContent = '登録する作品を選択してください。'; return { ok: false, count: 0 }; }
      let checked;
      try { checked = selected.map(validateItem); }
      catch (error) { status.textContent = error.message; return { ok: false, count: 0 }; }
      const state = getState();
      const originalItems = state.savedItems;
      const originalAuthors = state.authorCards;
      const additions = [];
      for (let i = 0; i < checked.length; i += 1) {
        const item = checked[i];
        if (isDuplicate(item, [...originalItems, ...additions]) && !selected[i].override) continue;
        additions.push({
          id: createId(), title: item.title, author: item.author, circleName: item.circleName,
          sourceWork: item.sourceWork, isDoujin: Boolean(item.sourceWork), tags: [...item.tags],
          sourceUrl: item.sourceUrl, url: item.url, folderId: null, addedAt: now(),
          // Reader discovers subsequent pages using the existing sequential URL resolver.
        });
      }
      if (!additions.length) { status.textContent = '登録できる新規作品がありません。'; return { ok: true, count: 0 }; }
      const savedItems = [...originalItems, ...additions];
      const synced = authorSync.synchronize({ savedItems, authorCards: originalAuthors, createId, now });
      setState({ savedItems, authorCards: synced.authorCards });
      try {
        if (persistItems() === false) throw new Error('作品の保存に失敗しました。');
        if (synced.changed && persistAuthorCards() === false) throw new Error('作者の保存に失敗しました。');
      } catch (error) {
        setState({ savedItems: originalItems, authorCards: originalAuthors });
        try { persistItems(); } catch (_) {}
        try { persistAuthorCards(); } catch (_) {}
        render();
        status.textContent = error.message || '保存できませんでした。';
        return { ok: false, count: 0 };
      }
      render();
      status.textContent = additions.length + '作品を本棚に登録しました。閲覧時に2ページ目以降のURLを探索します。';
      return { ok: true, count: additions.length };
    }
    return Object.freeze({ parse, open, close, register, setStatus(value) { status.textContent = String(value || ''); }, get element() { return dialog; } });
  }
  root.MangaJsonImport = Object.freeze({ FORMAT, MAX_ITEMS, MAX_BYTES, parse, validateItem, isDuplicate, create });
})(typeof self !== 'undefined' ? self : globalThis);