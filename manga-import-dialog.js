(function (root) {
  'use strict';
  function create({ documentRef, validator, candidateFactory }) {
    if (!documentRef || !validator || !candidateFactory) throw new TypeError('MangaImportDialog requires documentRef, validator and candidateFactory');
    let queueItems = [];
    let duplicateIds = new Set();
    const dialog = documentRef.querySelector('#mangaImportDialog');
    const rowsElement = dialog?.querySelector('#mangaImportRows');
    const statusElement = dialog?.querySelector('#mangaImportStatus');
    if (!dialog || !rowsElement || !statusElement) throw new Error('Manga import dialog markup is missing');
    function node(tag, text, className) {
      const element = documentRef.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    }
    function inputField(row, key, label, value, { tags = false } = {}) {
      const wrapper = node('label', label, 'manga-import-field');
      const input = documentRef.createElement(tags ? 'textarea' : 'input');
      input.id = `mangaImport${key[0].toUpperCase()}${key.slice(1)}-${row.queueId}`;
      if (!tags) input.type = 'text';
      input.value = tags ? (Array.isArray(value) ? value.join(', ') : '') : (typeof value === 'string' ? value : '');
      wrapper.appendChild(input); return wrapper;
    }
    function invalidPageList(candidate, errors) {
      return !candidate || !Array.isArray(candidate.pages) || !candidate.pages.length || errors.some(error => /Invalid (?:page list|page URL at|source URL|candidate schema|fallback page pattern)/i.test(error));
    }
    function open(items, currentItems, authorCards) {
      if (!Array.isArray(items) || items.length > 500) throw new Error('Invalid queue item list');
      queueItems = items.map(item => ({ queueId: item.queueId, candidate: item.candidate, addedAt: item.addedAt, warnings: Array.isArray(item.warnings) ? [...item.warnings] : [] }));
      duplicateIds = new Set(); rowsElement.replaceChildren(); statusElement.textContent = '';
      queueItems.forEach((item, index) => {
        const checked = validator.validateCandidate(item.candidate);
        const duplicate = checked.ok && candidateFactory.findDuplicate(checked.candidate, currentItems || []).duplicate;
        if (duplicate) duplicateIds.add(item.queueId);
        const row = node('article', undefined, 'manga-import-row'); row.dataset.queueId = item.queueId;
        const heading = node('h3', checked.ok ? checked.candidate.title : (item.candidate?.title || 'タイトル未取得'));
        const includeLabel = node('label', '登録対象');
        const include = documentRef.createElement('input'); include.type = 'checkbox'; include.id = `mangaImportInclude-${item.queueId}`;
        include.checked = !duplicate && checked.ok && !invalidPageList(item.candidate, checked.errors);
        include.disabled = invalidPageList(item.candidate, checked.errors);
        includeLabel.appendChild(include);
        row.append(includeLabel, heading,
          inputField(item, 'title', 'タイトル', item.candidate?.title),
          inputField(item, 'author', '作者', item.candidate?.author),
          inputField(item, 'circleName', 'サークル', item.candidate?.circleName),
          inputField(item, 'sourceWork', '元作品', item.candidate?.sourceWork),
          inputField(item, 'tags', 'タグ（カンマ区切り）', item.candidate?.tags, { tags: true }));
        const info = node('p', `${Array.isArray(item.candidate?.pages) ? item.candidate.pages.length : 0} ページ`, 'manga-import-page-count');
        const source = node('p', item.candidate?.sourceUrl || '', 'manga-import-source-url');
        row.append(info, source);
        const pages = node('ul', undefined, 'manga-import-pages'); pages.id = `mangaImportPages-${item.queueId}`;
        (Array.isArray(item.candidate?.pages) ? item.candidate.pages : []).forEach((url, pageIndex) => pages.appendChild(node('li', `${pageIndex + 1}. ${url}`)));
        row.appendChild(pages);
        const warning = node('ul', undefined, 'manga-import-warnings');
        item.warnings.forEach(value => warning.appendChild(node('li', value)));
        if (duplicate) warning.appendChild(node('li', '既に本棚に登録されています。再登録する場合はチェックしてください。'));
        if (checked.errors.length) checked.errors.forEach(error => warning.appendChild(node('li', error)));
        if (warning.children.length) row.appendChild(warning);
        rowsElement.appendChild(row);
      });
      dialog.hidden = false;
      return queueItems.length;
    }
    function getSelection() {
      const selected = [];
      const explicitDuplicateIds = [];
      queueItems.forEach(item => {
        const include = dialog.querySelector(`#mangaImportInclude-${item.queueId}`);
        if (!include || include.disabled || !include.checked) return;
        const candidate = { ...item.candidate };
        for (const key of ['title', 'author', 'circleName', 'sourceWork']) {
          const input = dialog.querySelector(`#mangaImport${key[0].toUpperCase()}${key.slice(1)}-${item.queueId}`);
          candidate[key] = input?.value ?? '';
        }
        const tags = dialog.querySelector(`#mangaImportTags-${item.queueId}`)?.value ?? '';
        candidate.tags = tags.split(',').map(value => value.trim()).filter(Boolean);
        selected.push({ ...item, candidate });
        if (duplicateIds.has(item.queueId)) explicitDuplicateIds.push(item.queueId);
      });
      return { items: selected, explicitDuplicateIds };
    }
    return Object.freeze({
      open,
      getSelection,
      setStatus(text) { statusElement.textContent = String(text ?? ''); },
      close() { dialog.hidden = true; },
      element: dialog,
    });
  }
  root.MangaImportDialog = Object.freeze({ create });
})(typeof self !== 'undefined' ? self : globalThis);
