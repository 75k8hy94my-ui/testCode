(function (root) {
  'use strict';

  const COLUMNS = Object.freeze([
    { key: 'title', label: 'タイトル', width:290, max:500, required:true },
    { key: 'author', label: '作者', width:155, max:300 },
    { key: 'circleName', label: 'サークル', width:155, max:300 },
    { key: 'series', label: 'シリーズ', width:165, max:300 },
    { key: 'tags', label: 'タグ（カンマ区切り）', width:250, type:'tags' },
    { key: 'sourceWork', label: '元ネタ・原作', width:190, max:300 },
    { key: 'url', label: '漫画URL', width:340, type:'url' },
    { key: 'sourceUrl', label: '元ページURL', width:340, type:'url' },
    { key: 'folderId', label: 'フォルダ', width:155, type:'folder' },
    { key: 'favorite', label: 'お気に入り', width:110, type:'boolean' },
    { key: 'isDoujin', label: '同人誌', width:90, type:'boolean' },
    { key: 'id', label: '作品ID（変更不可）', width:210, readOnly:true },
    { key: 'addedAt', label: '登録日時（変更不可）', width:175, readOnly:true }
  ]);
  const HEIGHT = 30;
  const LABEL_ROWS_HEIGHT = 61;
  const MAX_UNDO = 50;

  function formatValue(item, column, folders) {
    if (!item) return '';
    const value = item[column.key];
    if (column.type === 'tags') return Array.isArray(value) ? value.join(', ') : '';
    if (column.type === 'folder') {
      if (!value) return '';
      const folder = folders.find(entry => entry.id === value);
      return folder ? String(folder.name || '') : String(value);
    }
    if (column.type === 'boolean') return value === true ? 'TRUE' : 'FALSE';
    if (column.key === 'addedAt') {
      const stamp = Number(value);
      return stamp > 0 && Number.isFinite(stamp) ? new Date(stamp).toLocaleString('ja-JP') : '';
    }
    return value == null ? '' : String(value);
  }

  function parseValue(item, column, raw, folders) {
    if (!column || column.readOnly) throw new Error('この列は変更できません。');
    const text = String(raw == null ? '' : raw).trim();
    if (column.type === 'boolean') {
      if (/^(true|1|yes|y|on|はい|有|あり|○|〇|✓)$/i.test(text)) return true;
      if (/^(false|0|no|n|off|いいえ|無|なし|×|)$/i.test(text)) return false;
      throw new Error(column.label + 'には TRUE または FALSE を入力してください。');
    }
    if (column.type === 'folder') {
      if (!text) return null;
      const match = folders.find(folder => folder.id === text || folder.name === text);
      if (!match) throw new Error('フォルダ「' + text + '」がありません。既存のフォルダ名を入力してください。');
      return match.id;
    }
    if (column.type === 'tags') {
      const values = text ? text.split(/[,、，]/).map(value => value.trim()).filter(Boolean) : [];
      if (values.length > 200 || values.some(value => value.length > 200)) {
        throw new Error('タグは200件以下・各200文字以下にしてください。');
      }
      return Array.from(new Set(values));
    }
    if (column.type === 'url') {
      if (!text) {
        if (column.key === 'url' && !item.localSync && !item.encryptedAssets?.pages?.length &&
            !item.pages?.length && !item.pageManifest?.pages?.length) {
          throw new Error('この作品の漫画URLは空欄にできません。');
        }
        return '';
      }
      if (text.length > 4096) throw new Error('URLは4096文字以下にしてください。');
      try {
        const url = new URL(text);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('invalid');
        return text;
      } catch (_) { throw new Error('URLには http:// または https:// から始まる正しいアドレスを入力してください。'); }
    }
    if (column.required && !text) throw new Error(column.label + 'は空欄にできません。');
    if (text.length > (column.max || 500)) throw new Error(column.label + 'は' + (column.max || 500) + '文字以下にしてください。');
    return text;
  }

  function sameValue(a, b) {
    return Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
  }
  function cellAddress(row, col) { return String.fromCharCode(65 + col) + String(row + 2); }
  function getRange(selection) {
    return {
      r0: Math.min(selection.row, selection.anchorRow), r1: Math.max(selection.row, selection.anchorRow),
      c0: Math.min(selection.col, selection.anchorCol), c1: Math.max(selection.col, selection.anchorCol)
    };
  }
  function clipboardMatrix(text) {
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines.map(line => line.split('\t'));
  }

  function create(deps) {
    const doc = deps.documentRef;
    const toolbar = deps.mountElement.querySelector('#exportImportRow');
    if (!toolbar || !doc) throw new Error('Manga spreadsheet mount is unavailable');

    const launch = doc.createElement('button');
    launch.id = 'mangaSpreadsheetBtn';
    launch.type = 'button';
    launch.className = 'textActionBtn';
    launch.textContent = 'Excel風の表で編集';
    launch.title = '登録済み漫画を表計算ソフト風の画面で編集';
    toolbar.appendChild(launch);

    const linkId = 'testcodeMangaSpreadsheetStyles';
    if (!doc.getElementById(linkId)) {
      const link = doc.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = 'manga-spreadsheet.css?v=20261114-excel-sheet-1';
      doc.head.appendChild(link);
    }

    const overlay = doc.createElement('section');
    overlay.className = 'ms-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '漫画メタデータの表形式編集');
    overlay.innerHTML = [
      '<div class="ms-app">',
        '<header class="ms-titlebar">',
          '<div class="ms-book" aria-hidden="true">X</div>',
          '<div><strong>漫画ライブラリ</strong><div><small>testCode　/　メタデータ編集</small></div></div>',
          '<div class="ms-spacer"></div>',
          '<button type="button" data-ms="reader">選択作品を開く</button>',
          '<button type="button" data-ms="close" aria-label="表編集を閉じる">✕ 閉じる</button>',
        '</header>',
        '<div class="ms-ribbon" role="toolbar" aria-label="表の編集操作">',
          '<div class="ms-group">',
            '<button type="button" data-ms="copy" title="Ctrl/Cmd+C">コピー</button>',
            '<button type="button" data-ms="paste" title="Ctrl/Cmd+V">貼り付け</button>',
            '<button type="button" data-ms="undo" title="Ctrl/Cmd+Z">↶ 元に戻す</button>',
            '<button type="button" data-ms="redo" title="Ctrl/Cmd+Y">↷ やり直す</button>',
          '</div>',
          '<label for="msSearchInput">検索</label>',
          '<input id="msSearchInput" type="search" placeholder="全列から作品を探す" autocomplete="off">',
          '<button type="button" data-ms="resetSort">並び順を戻す</button>',
          '<span class="ms-count" data-ms="count"></span>',
        '</div>',
        '<div class="ms-formula">',
          '<input class="ms-name" data-ms="name" aria-label="選択セル" readonly>',
          '<span class="ms-fx" aria-hidden="true">fx</span>',
          '<input class="ms-value" data-ms="formula" aria-label="選択セルの値を編集" spellcheck="false">',
        '</div>',
        '<div class="ms-sheet-viewport" data-ms="viewport" role="grid" aria-label="登録済み漫画の表" tabindex="0">',
          '<table class="ms-grid" data-ms="table" aria-label="漫画ライブラリ">',
            '<colgroup data-ms="columns"></colgroup>',
            '<thead data-ms="head"></thead><tbody data-ms="body"></tbody>',
          '</table>',
        '</div>',
        '<footer class="ms-sheet-footer">',
          '<button type="button" class="ms-tab" aria-current="page">漫画</button>',
          '<span class="ms-help">Enter / F2: 編集　Tab / 矢印: 移動　Ctrl/Cmd+C・V: 範囲のコピー・貼り付け</span>',
          '<span class="ms-status" data-ms="status" role="status" aria-live="polite">セルを選択して編集できます。変更は自動保存されます。</span>',
        '</footer>',
      '</div>'
    ].join('');
    doc.body.appendChild(overlay);

    const one = (key) => overlay.querySelector('[data-ms="' + key + '"]');
    const viewport = one('viewport');
    const tbody = one('body');
    const formula = one('formula');
    const search = overlay.querySelector('#msSearchInput');
    const status = one('status');
    const count = one('count');
    const undoButton = one('undo');
    const redoButton = one('redo');

    let rows = [];
    let selection = { row:0, col:0, anchorRow:0, anchorCol:0 };
    let sort = { key:'', direction:1 };
    let editor = null;
    let history = [];
    let redoHistory = [];
    let destroyed = false;
    let currentStart = -1;
    let currentEnd = -1;

    function accessible() { return !destroyed && deps.canReadProtectedData() === true; }
    function announce(message, error) {
      status.textContent = message;
      status.classList.toggle('ms-error', !!error);
    }
    function getFolders() { return deps.getState().savedFolders || []; }
    function updateButtons() {
      undoButton.disabled = !history.length;
      redoButton.disabled = !redoHistory.length;
    }
    function computeRows() {
      if (!accessible()) { rows = []; return; }
      const q = search.value.trim().toLocaleLowerCase('ja-JP');
      rows = deps.getState().savedItems.filter(item => {
        if (!q) return true;
        return COLUMNS.some(column => formatValue(item, column, getFolders()).toLocaleLowerCase('ja-JP').includes(q));
      });
      if (sort.key) {
        const column = COLUMNS.find(entry => entry.key === sort.key);
        rows = rows.slice().sort((a, b) => {
          const valueA = formatValue(a, column, getFolders());
          const valueB = formatValue(b, column, getFolders());
          return valueA.localeCompare(valueB, 'ja-JP', { numeric:true }) * sort.direction;
        });
      }
      selection.row = Math.max(0, Math.min(selection.row, Math.max(0, rows.length - 1)));
      selection.anchorRow = Math.max(0, Math.min(selection.anchorRow, Math.max(0, rows.length - 1)));
      count.textContent = rows.length + ' 件 / 全 ' + deps.getState().savedItems.length + ' 件';
    }

    function drawHeader() {
      const cols = one('columns');
      const head = one('head');
      cols.replaceChildren();
      const numberColumn = doc.createElement('col');
      numberColumn.style.width = '49px';
      cols.appendChild(numberColumn);
      COLUMNS.forEach(column => {
        const el = doc.createElement('col');
        el.style.width = column.width + 'px';
        cols.appendChild(el);
      });
      const letters = doc.createElement('tr');
      letters.className = 'ms-letters';
      const corner = doc.createElement('th');
      corner.className = 'ms-corner ms-rownum';
      corner.textContent = '◢';
      letters.appendChild(corner);
      const labels = doc.createElement('tr');
      labels.className = 'ms-labels';
      const rownum = doc.createElement('th');
      rownum.className = 'ms-corner ms-rownum';
      rownum.textContent = '1';
      labels.appendChild(rownum);
      COLUMNS.forEach((column, index) => {
        const letter = doc.createElement('th');
        letter.textContent = String.fromCharCode(65 + index);
        letter.dataset.sortColumn = String(index);
        letters.appendChild(letter);
        const label = doc.createElement('th');
        label.textContent = column.label + (column.readOnly ? ' 🔒' : '');
        label.title = 'クリックするとこの列で並び替え';
        label.dataset.sortColumn = String(index);
        labels.appendChild(label);
      });
      head.append(letters, labels);
    }

    function spacer(height) {
      const row = doc.createElement('tr');
      row.className = 'ms-spacer-row';
      const cell = doc.createElement('td');
      cell.colSpan = COLUMNS.length + 1;
      cell.style.height = height + 'px';
      cell.style.maxHeight = 'none';
      row.appendChild(cell);
      return row;
    }
    function currentSelectedRange() { return getRange(selection); }
    function drawRows(force) {
      if (overlay.hidden) return;
      const visibleTop = Math.max(0, viewport.scrollTop - LABEL_ROWS_HEIGHT);
      const start = Math.max(0, Math.floor(visibleTop / HEIGHT) - 10);
      const end = Math.min(rows.length, start + Math.ceil((viewport.clientHeight || 550) / HEIGHT) + 24);
      // Keep existing cell nodes when only the active selection moves. This
      // preserves native double-click and text-editor interactions.
      if (!force && start === currentStart && end === currentEnd) return;
      currentStart = start; currentEnd = end;
      const fragment = doc.createDocumentFragment();
      if (start) fragment.appendChild(spacer(start * HEIGHT));
      const selected = currentSelectedRange();
      const folders = getFolders();
      for (let r = start; r < end; r += 1) {
        const item = rows[r];
        const tr = doc.createElement('tr');
        const num = doc.createElement('th');
        num.scope = 'row';
        num.className = 'ms-rownum' + (r >= selected.r0 && r <= selected.r1 ? ' ms-selected' : '');
        num.textContent = String(r + 2);
        tr.appendChild(num);
        COLUMNS.forEach((column, c) => {
          const td = doc.createElement('td');
          td.dataset.row = String(r);
          td.dataset.col = String(c);
          td.title = column.readOnly ? '読み取り専用' : column.label;
          if (column.readOnly) td.classList.add('ms-readonly');
          if (column.type === 'boolean') {
            td.classList.add('ms-boolean');
            if (item[column.key] === true) td.classList.add('ms-bool-on');
          }
          if (r >= selected.r0 && r <= selected.r1 && c >= selected.c0 && c <= selected.c1) td.classList.add('ms-selected');
          if (r === selection.row && c === selection.col) td.classList.add('ms-active');
          td.textContent = formatValue(item, column, folders);
          td.setAttribute('aria-selected', r >= selected.r0 && r <= selected.r1 && c >= selected.c0 && c <= selected.c1 ? 'true' : 'false');
          tr.appendChild(td);
        });
        fragment.appendChild(tr);
      }
      if (!rows.length) {
        const tr = doc.createElement('tr');
        const td = doc.createElement('td');
        td.colSpan = COLUMNS.length + 1;
        td.textContent = '該当する漫画がありません。';
        td.style.padding = '14px';
        tr.appendChild(td);
        fragment.appendChild(tr);
      }
      if (end < rows.length) fragment.appendChild(spacer((rows.length - end) * HEIGHT));
      tbody.replaceChildren(fragment);
      updateFormula();
    }

    function updateFormula() {
      const item = rows[selection.row];
      one('name').value = item ? cellAddress(selection.row, selection.col) : '';
      formula.value = item ? formatValue(item, COLUMNS[selection.col], getFolders()) : '';
      formula.disabled = !item || COLUMNS[selection.col].readOnly;
      if (item) viewport.setAttribute('aria-label', '登録済み漫画の表、選択セル ' + cellAddress(selection.row, selection.col));
    }
    function paintSelection() {
      const range = currentSelectedRange();
      tbody.querySelectorAll('td[data-row][data-col]').forEach(td => {
        const row = Number(td.dataset.row), col = Number(td.dataset.col);
        const inside = row >= range.r0 && row <= range.r1 && col >= range.c0 && col <= range.c1;
        td.classList.toggle('ms-selected', inside);
        td.classList.toggle('ms-active', row === selection.row && col === selection.col);
        td.setAttribute('aria-selected', inside ? 'true' : 'false');
      });
      tbody.querySelectorAll('tr').forEach(tr => {
        const number = tr.querySelector('th.ms-rownum');
        const td = tr.querySelector('td[data-row]');
        if (number && td) {
          const row = Number(td.dataset.row);
          number.classList.toggle('ms-selected', row >= range.r0 && row <= range.r1);
        }
      });
      updateFormula();
    }
    function ensureVisible() {
      if (!rows.length) return;
      const top = selection.row * HEIGHT + LABEL_ROWS_HEIGHT;
      const bottom = top + HEIGHT;
      if (top < viewport.scrollTop + LABEL_ROWS_HEIGHT) viewport.scrollTop = Math.max(0, top - LABEL_ROWS_HEIGHT);
      else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
      drawRows(false);
      paintSelection();
      const active = tbody.querySelector('td[data-row="' + selection.row + '"][data-col="' + selection.col + '"]');
      if (active) {
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        if (left < viewport.scrollLeft + 49) viewport.scrollLeft = Math.max(0, left - 49);
        else if (right > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = right - viewport.clientWidth;
      }
    }
    function selectCell(row, col, extend) {
      if (!rows.length) return;
      selection.row = Math.max(0, Math.min(rows.length - 1, row));
      selection.col = Math.max(0, Math.min(COLUMNS.length - 1, col));
      if (!extend) {
        selection.anchorRow = selection.row;
        selection.anchorCol = selection.col;
      }
      ensureVisible();
      viewport.focus({ preventScroll:true });
    }

    function applyChanges(edits, { remember = true } = {}) {
      if (!accessible()) { announce('VPN接続・保管庫の状態を確認してください。', true); return false; }
      const current = deps.getState();
      const itemsBefore = current.savedItems;
      const folders = getFolders();
      const byId = new Map(itemsBefore.map(item => [String(item.id), item]));
      const replacement = new Map();
      const patchMap = new Map();
      try {
        for (const edit of edits) {
          const id = String(edit.id);
          const source = byId.get(id);
          const column = COLUMNS.find(entry => entry.key === edit.key);
          if (!source || !column || column.readOnly) throw new Error('編集先の作品または列が見つかりません。');
          const key = id + '\u0000' + column.key;
          const next = edit.preparsed ? edit.value : parseValue(source, column, edit.value, folders);
          const old = source[column.key];
          if (sameValue(old, next)) { replacement.get(id)?.hasOwnProperty(column.key) && replacement.get(id).delete(column.key); patchMap.delete(key); continue; }
          if (!replacement.has(id)) replacement.set(id, new Map());
          replacement.get(id).set(column.key, next);
          patchMap.set(key, { id, key:column.key, before:old, after:next });
        }
      } catch (error) {
        announce(error?.message || '入力値を確認してください。', true);
        return false;
      }
      const patches = [...patchMap.values()];
      if (!patches.length) { announce('変更はありません。'); return true; }
      const savedItems = itemsBefore.map(item => {
        const changes = replacement.get(String(item.id));
        return changes?.size ? Object.assign({}, item, Object.fromEntries(changes)) : item;
      });
      const authorsBefore = current.authorCards;
      const synced = deps.authorSync.synchronize({
        savedItems, authorCards:authorsBefore,
        createId: () => 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        now:() => Date.now()
      });
      deps.setState({ savedItems, authorCards:synced.authorCards });
      try {
        if (deps.persistItems() === false) throw new Error('端末への保存に失敗しました。');
        if (synced.changed && deps.persistAuthorCards() === false) throw new Error('作者データの保存に失敗しました。');
      } catch (error) {
        deps.setState({ savedItems:itemsBefore, authorCards:authorsBefore });
        // If an author-card write failed after the item write, restore both
        // local storage and the pending cloud snapshot to their prior values.
        try { deps.persistItems(); } catch (_) {}
        if (synced.changed) { try { deps.persistAuthorCards(); } catch (_) {} }
        announce('変更を保存できず、編集を元に戻しました。' + (error?.message || ''), true);
        return false;
      }
      if (remember) {
        history.push(patches);
        if (history.length > MAX_UNDO) history.shift();
        redoHistory = [];
      }
      deps.render();
      computeRows();
      drawRows(true);
      updateButtons();
      announce(patches.length + 'セルを端末に保存しました。クラウドには通常の同期処理で反映します。');
      return true;
    }

    function changeOne(row, col, value) {
      const item = rows[row];
      if (!item) return false;
      return applyChanges([{ id:item.id, key:COLUMNS[col].key, value }]);
    }
    function moveSelection(dr, dc, extend) {
      selectCell(selection.row + dr, selection.col + dc, extend);
    }
    function stopEditing(commit, advance) {
      if (!editor) return;
      const current = editor;
      editor = null;
      const value = current.input.value;
      if (commit && !changeOne(current.row, current.col, value)) {
        // Invalid data must remain editable instead of being discarded.
        editor = current;
        current.input.focus({ preventScroll:true });
        return;
      }
      current.input.remove();
      if (advance) moveSelection(advance[0], advance[1], false);
      else { drawRows(true); viewport.focus({ preventScroll:true }); }
    }
    function startEditing(initial) {
      if (!rows.length) return;
      const column = COLUMNS[selection.col];
      if (column.readOnly) { announce('この列は読み取り専用です。', true); return; }
      if (column.type === 'boolean') {
        changeOne(selection.row, selection.col, rows[selection.row][column.key] ? 'FALSE' : 'TRUE');
        viewport.focus({ preventScroll:true });
        return;
      }
      ensureVisible();
      const td = tbody.querySelector('td[data-row="' + selection.row + '"][data-col="' + selection.col + '"]');
      if (!td) return;
      if (editor) stopEditing(true);
      const input = doc.createElement('input');
      input.className = 'ms-editor';
      input.type = 'text';
      input.setAttribute('aria-label', column.label + 'を編集');
      input.value = initial === undefined ? formatValue(rows[selection.row], column, getFolders()) : initial;
      const info = { input, row:selection.row, col:selection.col };
      editor = info;
      td.appendChild(input);
      input.focus();
      if (initial === undefined) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopEditing(false); }
        else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); stopEditing(true, [1,0]); }
        else if (event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); stopEditing(true, [0,event.shiftKey ? -1 : 1]); }
      });
      input.addEventListener('blur', () => { if (editor === info) stopEditing(true); });
    }
    function copyText() {
      if (!rows.length) return '';
      const rect = currentSelectedRange();
      const folders = getFolders();
      const lines = [];
      for (let r = rect.r0; r <= rect.r1; r += 1) {
        const item = rows[r];
        lines.push(COLUMNS.slice(rect.c0, rect.c1 + 1).map(col => formatValue(item, col, folders).replace(/[\r\n\t]/g, ' ')).join('\t'));
      }
      return lines.join('\n');
    }
    function pasteText(text) {
      if (!rows.length) return false;
      if (!text) { announce('貼り付ける文字列がありません。', true); return false; }
      const matrix = clipboardMatrix(text);
      if (matrix.length * matrix.reduce((max, row) => Math.max(max, row.length), 1) > 10000) {
        announce('一度に貼り付ける範囲は10,000セル以下にしてください。', true);
        return false;
      }
      const edits = [];
      matrix.forEach((line, r) => {
        line.forEach((value, c) => {
          const row = selection.row + r;
          const col = selection.col + c;
          if (row >= rows.length || col >= COLUMNS.length || COLUMNS[col].readOnly) return;
          edits.push({ id:rows[row].id, key:COLUMNS[col].key, value });
        });
      });
      if (!edits.length) { announce('編集可能なセルがありません。', true); return false; }
      return applyChanges(edits);
    }
    function clearRange() {
      if (!rows.length) return;
      const rect = currentSelectedRange();
      const edits = [];
      for (let r = rect.r0; r <= rect.r1; r += 1) {
        for (let c = rect.c0; c <= rect.c1; c += 1) {
          if (COLUMNS[c].readOnly) continue;
          edits.push({ id:rows[r].id, key:COLUMNS[c].key, value:COLUMNS[c].type === 'boolean' ? 'FALSE' : '' });
        }
      }
      if (edits.length) applyChanges(edits);
    }
    function timeTravel(from, to, undo) {
      if (!from.length) return;
      const patches = from[from.length - 1];
      if (applyChanges(patches.map(p => ({ id:p.id, key:p.key, value:undo ? p.before : p.after, preparsed:true })), {remember:false})) {
        from.pop();
        to.push(patches);
        updateButtons();
      }
    }
    function refresh() {
      computeRows();
      currentStart = -1;
      drawRows(true);
    }
    function open() {
      if (!accessible()) return;
      overlay.hidden = false;
      search.value = '';
      sort = { key:'', direction:1 };
      selection = { row:0, col:0, anchorRow:0, anchorCol:0 };
      viewport.scrollTop = 0; viewport.scrollLeft = 0;
      drawHeader();
      refresh();
      updateButtons();
      announce('セルをダブルクリック、または Enter / F2 で編集できます。自動保存が有効です。');
      viewport.focus({ preventScroll:true });
    }
    function close() {
      if (editor) {
        stopEditing(true);
        // Closing or revoking VPN access must not retain an unsaved editor.
        if (editor) { editor.input.remove(); editor = null; }
      }
      overlay.hidden = true;
      rows = [];
      tbody.replaceChildren();
      search.value = '';
      one('name').value = '';
      formula.value = '';
      if (!destroyed && launch.isConnected) launch.focus({ preventScroll:true });
    }
    function onGridKeydown(event) {
      if (overlay.hidden || !accessible() || editor || event.target !== viewport && event.target.closest('input,button')) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod) {
        if (event.key.toLowerCase() === 'z' && event.shiftKey || event.key.toLowerCase() === 'y') { event.preventDefault(); timeTravel(redoHistory, history, false); }
        else if (event.key.toLowerCase() === 'z') { event.preventDefault(); timeTravel(history, redoHistory, true); }
        else if (event.key.toLowerCase() === 'f') { event.preventDefault(); search.focus(); }
        else if (event.key.toLowerCase() === 'a') {
          event.preventDefault();
          if (rows.length) {
            selection.anchorRow = 0; selection.anchorCol = 0;
            selection.row = rows.length - 1; selection.col = COLUMNS.length - 1;
            paintSelection();
          }
        }
        return;
      }
      const moves = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1], Tab:[0,event.shiftKey ? -1 : 1] };
      if (moves[event.key]) {
        event.preventDefault(); moveSelection(moves[event.key][0], moves[event.key][1], event.shiftKey && event.key !== 'Tab');
      } else if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault(); startEditing();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); clearRange();
      } else if (event.key === ' ' && COLUMNS[selection.col].type === 'boolean') {
        event.preventDefault(); startEditing();
      } else if (event.key === 'Escape') {
        event.preventDefault(); close();
      } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1 && event.key !== ' ') {
        event.preventDefault(); startEditing(event.key);
      }
    }
    function onClickCell(event, extend) {
      if (event.target.closest('.ms-editor')) return;
      const cell = event.target.closest('td[data-row][data-col]');
      if (!cell || !viewport.contains(cell)) return;
      if (editor) stopEditing(true);
      selectCell(Number(cell.dataset.row), Number(cell.dataset.col), extend);
    }
    function onClickHeader(event) {
      const column = event.target.closest('th[data-sort-column]');
      if (!column) return;
      const entry = COLUMNS[Number(column.dataset.sortColumn)];
      if (!entry) return;
      if (sort.key === entry.key) sort.direction *= -1;
      else sort = { key:entry.key, direction:1 };
      selection = { row:0, col:Number(column.dataset.sortColumn), anchorRow:0, anchorCol:Number(column.dataset.sortColumn) };
      viewport.scrollTop = 0;
      refresh();
      announce(entry.label + 'で' + (sort.direction === 1 ? '昇順' : '降順') + 'に並べ替えました。');
    }
    function onVpnStatus(event) {
      if (event?.detail?.status !== 'allowed') close();
    }

    launch.addEventListener('click', open);
    one('close').addEventListener('click', close);
    one('reader').addEventListener('click', () => { if (accessible() && rows[selection.row]) deps.openReader(rows[selection.row]); });
    one('resetSort').addEventListener('click', () => { sort = { key:'', direction:1 }; refresh(); announce('元の登録順で表示しています。'); });
    one('copy').addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(copyText());
        announce('選択範囲をコピーしました。');
      } catch (_) { announce('コピーできませんでした。表を選択して Ctrl/Cmd+C を使用してください。', true); }
    });
    one('paste').addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.readText) throw new Error('Clipboard API unavailable');
        pasteText(await navigator.clipboard.readText());
      } catch (_) { announce('貼り付けできませんでした。表を選択して Ctrl/Cmd+V を使用してください。', true); }
    });
    undoButton.addEventListener('click', () => timeTravel(history, redoHistory, true));
    redoButton.addEventListener('click', () => timeTravel(redoHistory, history, false));
    search.addEventListener('input', () => { viewport.scrollTop = 0; selection = { row:0, col:0, anchorRow:0, anchorCol:0 }; refresh(); });
    formula.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); changeOne(selection.row, selection.col, formula.value); viewport.focus({ preventScroll:true }); }
      if (event.key === 'Escape') { event.preventDefault(); updateFormula(); viewport.focus({ preventScroll:true }); }
    });
    formula.addEventListener('change', () => { if (rows.length && !formula.disabled) changeOne(selection.row, selection.col, formula.value); });
    viewport.addEventListener('scroll', () => drawRows(false), { passive:true });
    viewport.addEventListener('keydown', onGridKeydown);
    tbody.addEventListener('click', event => onClickCell(event, event.shiftKey));
    tbody.addEventListener('dblclick', event => { onClickCell(event, false); startEditing(); });
    one('head').addEventListener('click', onClickHeader);
    viewport.addEventListener('copy', event => {
      if (editor || !rows.length) return;
      event.clipboardData?.setData('text/plain', copyText());
      event.preventDefault();
      announce('選択範囲をコピーしました。');
    });
    viewport.addEventListener('paste', event => {
      if (editor || !accessible()) return;
      event.preventDefault();
      pasteText(event.clipboardData?.getData('text/plain') || '');
    });
    doc.addEventListener('manga-reader-vpn-status', onVpnStatus);
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor) { event.preventDefault(); close(); } });

    return Object.freeze({
      open, close, refresh,
      destroy() {
        if (destroyed) return;
        close();
        destroyed = true;
        doc.removeEventListener('manga-reader-vpn-status', onVpnStatus);
        overlay.remove();
        launch.remove();
        rows = [];
        history = []; redoHistory = [];
      }
    });
  }

  root.MangaSpreadsheetModel = Object.freeze({ COLUMNS, formatValue, parseValue, clipboardMatrix, cellAddress });
  root.MangaSpreadsheet = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : globalThis);
