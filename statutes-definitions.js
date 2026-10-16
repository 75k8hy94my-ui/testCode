(() => {
  'use strict';
  const root = document.documentElement;
  const page = document.querySelector('#routeContent.statutesMain');
  const host = document.getElementById('homeApp');
  const currentLabel = document.getElementById('statutesCurrentSection');
  const header = document.getElementById('appGlobalHeader');
  const popup = document.getElementById('statuteSelectionPopup');
  if (!root.classList.contains('statutes-page') || !page || !host || !header || !popup) return;

  const { STORAGE_KEY, enrichDefinition, loadDefinitions } = window.StatutesDefinitionStore;
  const originals = new Map();
  const spansByArticle = new Map();
  function indexEditableText() {
    originals.clear();
    spansByArticle.clear();
    page.querySelectorAll('.statuteCard').forEach(card => {
      const article = card.querySelector('.statuteNumber')?.textContent?.trim();
      if (!article) return;
      const parts = Array.from(card.querySelectorAll('.statuteSelectable'));
      spansByArticle.set(article, parts);
      parts.forEach((span, part) => {
        span.dataset.statuteArticle = article;
        span.dataset.statutePart = String(part);
        originals.set(span, span.cloneNode(true));
      });
    });
  }
  indexEditableText();

  let definitions = loadDefinitions();
  let editMode = false;
  let pending = null;
  let selectedDefinition = null;

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.id = 'statutesEditToggle';
  editButton.className = 'statutesEditToggle';
  editButton.setAttribute('aria-pressed', 'false');
  editButton.textContent = '編集 OFF';
  (currentLabel || header.querySelector('.globalShellBrand'))?.after(editButton);

  const syncButton = document.createElement('button');
  syncButton.type = 'button';
  syncButton.id = 'statutesSyncButton';
  syncButton.className = 'statutesEditToggle';
  syncButton.textContent = '同期';
  syncButton.setAttribute('aria-label', '逐条集を同期');
  const syncStatus = document.createElement('span');
  syncStatus.id = 'statutesSyncStatus';
  syncStatus.setAttribute('role', 'status');
  syncStatus.style.cssText = 'font-size:12px;opacity:.8;max-width:200px';
  editButton.after(syncButton, syncStatus);
  const guestMode = window.TestCodeGuest?.isActive() === true;
  function setSyncStatus(text) { syncStatus.textContent = text; }
  if (guestMode) {
    syncButton.disabled = true;
    setSyncStatus('ゲスト：端末保存のみ');
  } else setSyncStatus(window.MangaVault?.hasPendingLocalChanges?.() ? 'クラウド同期待ち' : 'クラウド同期可能');
  async function performSync() {
    if (guestMode || syncButton.disabled) return;
    syncButton.disabled = true;
    setSyncStatus('同期中…');
    try {
      const result = await window.MangaVault.syncStatutesLatest();
      if (result?.state === 'success') {
        setSyncStatus('同期完了');
      } else {
        setSyncStatus(result?.reason === 'local-conflict' ? '別端末の登録と競合・端末保存済み' : 'クラウド同期待ち' + (result?.reason ? '（' + result.reason + '）' : ''));
      }
    } catch (error) {
      setSyncStatus('同期失敗・端末保存済み');
    } finally {
      syncButton.disabled = false;
    }
  }
  syncButton.addEventListener('click', performSync);
  document.addEventListener('manga-vault-sync-state', event => {
    if (guestMode) return;
    const state = event.detail?.state;
    if (state === 'success') setSyncStatus('同期完了');
    else if (state === 'error' || state === 'failed') setSyncStatus('同期失敗・端末保存済み');
  });

  const side = document.createElement('aside');
  side.id = 'statutesDefinitionSide';
  side.className = 'statutesDefinitionSide';
  side.setAttribute('aria-label', '定義');
  side.setAttribute('aria-hidden', 'true');
  side.innerHTML = '<div class="statutesDefinitionHeader"><strong>定義</strong><button type="button" class="statutesDefinitionClose" aria-label="閉じる">×</button></div><div class="statutesDefinitionBody"><p class="statutesDefinitionQuote"></p><p class="statutesDefinitionSource"></p><div class="statutesDefinitionValue"></div><form class="statutesDefinitionForm" hidden><textarea aria-label="定義の内容" rows="6" required></textarea><div class="statutesDefinitionActions"><button type="submit">保存</button><button type="button" class="statutesDefinitionDelete" hidden>削除</button><button type="button" class="statutesDefinitionCancel">キャンセル</button></div><p class="statutesDefinitionStatus" role="status"></p></form></div>';
  host.appendChild(side);
  side.inert = true;
  const headerTitle = side.querySelector('.statutesDefinitionHeader strong');
  const definitionBody = side.querySelector('.statutesDefinitionBody');
  const definitionSource = side.querySelector('.statutesDefinitionSource');
  const quote = side.querySelector('.statutesDefinitionQuote');
  const value = side.querySelector('.statutesDefinitionValue');
  const form = side.querySelector('.statutesDefinitionForm');
  const textarea = form.querySelector('textarea');
  const status = form.querySelector('.statutesDefinitionStatus');
  const deleteButton = form.querySelector('.statutesDefinitionDelete');
  const closeButton = side.querySelector('.statutesDefinitionClose');

  function closePopup() {
    popup.dataset.visible = 'false';
    pending = null;
    selectedDefinition = null;
  }
  function closeSide() {
    if (!root.classList.contains('statutes-definition-open')) return;
    const originalScroll = page.scrollTop;
    const lowerReferenceOpen = root.classList.contains('statutes-split-open');
    root.classList.remove('statutes-definition-open');
    side.inert = true;
    side.setAttribute('aria-hidden', 'true');
    status.textContent = '';
    if (lowerReferenceOpen) {
      page.scrollTop = originalScroll;
    } else {
      requestAnimationFrame(() => window.scrollTo(0, originalScroll));
    }
  }
  function showSide() {
    side.setAttribute('aria-label', '定義');
    if (!root.classList.contains('statutes-definition-open')) {
      // The main document becomes its own scroll pane when the columns split.
      const lowerReferenceOpen = root.classList.contains('statutes-split-open');
      const originalScroll = lowerReferenceOpen ? page.scrollTop : window.scrollY;
      root.classList.add('statutes-definition-open');
      window.scrollTo(0, 0);
      page.scrollTop = originalScroll;
    }
    side.inert = false;
    side.setAttribute('aria-hidden', 'false');
  }
  function showPopup(rect) {
    popup.textContent = '定義';
    popup.dataset.visible = 'true';
    const width = popup.offsetWidth || 60;
    const height = popup.offsetHeight || 28;
    popup.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2)) + 'px';
    const preferredY = rect.top - height - 8;
    popup.style.top = (preferredY >= 8 ? preferredY : Math.min(window.innerHeight - height - 8, rect.bottom + 8)) + 'px';
  }

  function definitionId(target) {
    return [target.subject, target.article, target.part, target.start, target.end].join(':');
  }

  function rangeForOffsets(span, start, end) {
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
    let index = 0, first = null, last = null, node;
    while ((node = walker.nextNode())) {
      const next = index + node.length;
      if (first === null && start < next) first = { node, offset: start - index };
      if (last === null && end <= next) last = { node, offset: end - index };
      index = next;
      if (first && last) break;
    }
    if (!first || !last) return null;
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset);
    return range;
  }

  function renderHighlights() {
    originals.forEach((original, span) => {
      const replacement = original.cloneNode(true);
      span.replaceChildren(...Array.from(replacement.childNodes));
    });
    definitions.forEach(entry => {
      if (entry.subject !== subjectId) return;
      const span = spansByArticle.get(entry.article)?.[entry.part];
      if (!span) return;
      if (span.textContent.slice(entry.start, entry.end) !== entry.quote) return;
      const range = rangeForOffsets(span, entry.start, entry.end);
      if (!range) return;
      const marker = document.createElement('span');
      marker.className = 'statuteDefinitionMark';
      marker.dataset.definitionId = definitionId(entry);
      marker.setAttribute('role', 'button');
      marker.tabIndex = 0;
      marker.setAttribute('aria-label', '定義：' + entry.quote);
      marker.appendChild(range.extractContents());
      range.insertNode(marker);
    });
  }
  // Apply from right to left so the original offsets remain stable.
  function redraw() {
    definitions.sort((a, b) => {
      const keyA = a.article + ':' + String(a.part).padStart(4, '0');
      const keyB = b.article + ':' + String(b.part).padStart(4, '0');
      return keyA === keyB ? b.start - a.start : keyA.localeCompare(keyB);
    });
    renderHighlights();
  }

  function selectionCandidate() {
    if (!editMode) return null;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount !== 1) return null;
    const range = selection.getRangeAt(0);
    const elementOf = node => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const span = elementOf(range.startContainer)?.closest('.statuteSelectable');
    if (!span || span !== elementOf(range.endContainer)?.closest('.statuteSelectable')) return null;
    if (!page.contains(span) || !span.contains(range.startContainer) || !span.contains(range.endContainer)) return null;
    const article = span.dataset.statuteArticle;
    const part = Number(span.dataset.statutePart);
    if (!spansByArticle.has(article) || !Number.isSafeInteger(part)) return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(span);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    const quoteText = span.textContent.slice(start, end);
    if (!quoteText.trim()) return null;
    const overlapping = definitions.find(d => d.subject === subjectId && d.article === article && d.part === part && start < d.end && end > d.start);
    if (overlapping && (overlapping.start !== start || overlapping.end !== end)) return null;
    return {
      candidate: { subject: subjectId, article, part, start, end, quote: quoteText },
      existing: overlapping || null,
      rect: range.getBoundingClientRect()
    };
  }

  function updateSelectionPopup() {
    if (!editMode || !side.inert) return;
    const data = selectionCandidate();
    if (!data) {
      if (!selectedDefinition) closePopup();
      return;
    }
    pending = data.candidate;
    selectedDefinition = data.existing;
    showPopup(data.rect);
  }

  function openDefinition(entry, editing) {
    if (!entry) return;
    entry = enrichDefinition(entry);
    headerTitle.textContent = '定義';
    definitionBody.hidden = false;
    selectedDefinition = entry.definition ? entry : null;
    pending = {
      subject: subjectId, article: entry.article, part: entry.part,
      start: entry.start, end: entry.end, quote: entry.quote
    };
    quote.textContent = entry.quote;
    definitionSource.textContent = entry.source;
    form.hidden = !editing;
    value.hidden = editing;
    value.textContent = entry.definition || '';
    textarea.value = entry.definition || '';
    deleteButton.hidden = !entry.definition;
    status.textContent = '';
    popup.dataset.visible = 'false';
    window.getSelection()?.removeAllRanges();
    showSide();
    if (editing) textarea.focus({ preventScroll: true });
    else closeButton.focus({ preventScroll: true });
  }

  function saveDefinitions(next) {
    try {
      const normalized = next.map(enrichDefinition);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      definitions = normalized;
      redraw();
      if (!guestMode) setSyncStatus('クラウド同期待ち');
      if (!window.TestCodeGuest?.isActive()) {
        const vault = window.MangaVault;
        try {
          if (vault?.markLocalChangesPending?.()) {
            Promise.resolve(vault.saveLocalChanges()).catch(error => {
              status.textContent = '端末に保存済み・クラウド同期待ち：' + (error?.message || '接続を確認してください');
            });
          } else {
            status.textContent = '端末に保存済み・クラウド同期待ち';
          }
        } catch (error) {
          status.textContent = '端末に保存済み・クラウド同期待ち';
        }
      }
      return true;
    } catch (_) {
      status.textContent = '保存できませんでした';
      return false;
    }
  }

  function selectSavedMark(mark) {
    const id = mark.dataset.definitionId;
    const entry = definitions.find(d => definitionId(d) === id);
    if (!entry) return;
    pending = null;
    selectedDefinition = entry;
    showPopup(mark.getBoundingClientRect());
  }

  editButton.addEventListener('click', () => {
    editMode = !editMode;
    editButton.setAttribute('aria-pressed', String(editMode));
    editButton.textContent = editMode ? '編集 ON' : '編集 OFF';
    closePopup();
    closeSide();
    window.getSelection()?.removeAllRanges();
  });

  popup.addEventListener('pointerdown', e => e.preventDefault());
  popup.addEventListener('click', () => {
    const entry = selectedDefinition || pending;
    if (entry) openDefinition(entry, editMode);
  });

  document.addEventListener('click', event => {
    const mark = event.target.closest?.('.statuteDefinitionMark');
    if (!mark || (!page.contains(mark) && !document.getElementById('statutesSplitPanel')?.contains(mark)) || event.target.closest('.statuteReference')) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    selectSavedMark(mark);
  });
  document.addEventListener('keydown', event => {
    const mark = event.target.closest?.('.statuteDefinitionMark');
    if (mark && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectSavedMark(mark);
    } else if (event.key === 'Escape') {
      if (!side.inert) closeSide();
      else closePopup();
    }
  });
  document.addEventListener('selectionchange', () => requestAnimationFrame(updateSelectionPopup));
  document.addEventListener('pointerup', updateSelectionPopup);
  document.addEventListener('keyup', updateSelectionPopup);
  document.addEventListener('pointerdown', event => {
    if (!popup.contains(event.target) && !side.contains(event.target) &&
        !event.target.closest?.('.statuteDefinitionMark')) {
      closePopup();
    }
  });
  window.addEventListener('scroll', () => { popup.dataset.visible = 'false'; }, true);

  closeButton.addEventListener('click', closeSide);
  form.querySelector('.statutesDefinitionCancel').addEventListener('click', closeSide);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!editMode || !pending) return;
    const text = textarea.value.trim();
    if (!text) return;
    const entry = enrichDefinition({ ...pending, definition: text });
    const id = definitionId(entry);
    const updated = definitions.filter(d => definitionId(d) !== id);
    updated.push(entry);
    if (saveDefinitions(updated)) {
      selectedDefinition = entry;
      closeSide();
    }
  });
  deleteButton.addEventListener('click', () => {
    if (!editMode || !selectedDefinition) return;
    const id = definitionId(selectedDefinition);
    if (saveDefinitions(definitions.filter(d => definitionId(d) !== id))) closeSide();
  });

  document.addEventListener('click', event => {
    if (event.target.closest?.('.statutesLawMenuItem, .statutesLawRoot')) {
      closePopup();
      closeSide();
    }
  });
  window.addEventListener('popstate', () => {
    closePopup();
    closeSide();
  });
  // Other tabs and encrypted Vault downloads may replace the local corpus.
  function reloadAfterVaultApply() {
    definitions = loadDefinitions();
    indexEditableText();
    redraw();
    if (!side.inert) closeSide();
  }
  document.addEventListener('manga-vault-payload-applied', reloadAfterVaultApply);
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) reloadAfterVaultApply();
  });
  if (!window.TestCodeGuest?.isActive() && window.MangaVault?.loadActive?.()) {
    void performSync();
  }
  window.StatutesDefinitions = {
    refresh(section) {
      subjectId = section || 'civil-general';
      closePopup();
      closeSide();
      indexEditableText();
      redraw();
    }
  };
  redraw();
})();