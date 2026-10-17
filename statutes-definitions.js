(() => {
  'use strict';
  const root = document.documentElement;
  const page = document.querySelector('#routeContent.statutesMain');
  const host = document.getElementById('homeApp');
  const currentLabel = document.getElementById('statutesCurrentSection');
  const header = document.getElementById('appGlobalHeader');
  const popup = document.getElementById('statuteSelectionPopup');
  if (!root.classList.contains('statutes-page') || !page || !host || !header || !popup) return;

  const { STORAGE_KEY, enrichDefinition, definitionFromArticle, loadDefinitions } = window.StatutesDefinitionStore;
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

  let subjectId = new URLSearchParams(location.search).get('section') || 'civil-general';
  let definitions = loadDefinitions();
  let editMode = false;
  root.dataset.statutesEditMode = 'off';
  let pending = null;
  let inlineDefinition = null;
  const editSwitch = document.createElement('button');
  editSwitch.type = 'button';
  editSwitch.className = 'statutesModeSwitch';
  editSwitch.setAttribute('role','switch');
  editSwitch.setAttribute('aria-checked','false');
  editSwitch.setAttribute('aria-label','編集モード');
  editSwitch.innerHTML = '<span>編集</span><i aria-hidden="true"></i>';
  const modeStyle = document.createElement('style');
  modeStyle.textContent = '.statutesModeSwitch{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}.statutesModeSwitch i{position:relative;display:block;width:41px;height:25px;border-radius:15px;background:#9da3aa;transition:background .18s}.statutesModeSwitch i:after{content:"";position:absolute;top:2px;left:2px;width:21px;height:21px;background:#fff;border-radius:50%;box-shadow:0 1px 3px #0003;transition:transform .18s}.statutesModeSwitch[aria-checked="true"] i{background:#34c759}.statutesModeSwitch[aria-checked="true"] i:after{transform:translateX(16px)}.statuteInlineDefinition{margin:9px 0 4px;padding:10px 12px;border-left:2px solid var(--accent,#1769aa);background:rgba(128,128,128,.07);white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.65}.statuteInlineDefinition[hidden]{display:none}.statuteInlineDefinition strong{display:block;font-size:12px;margin-bottom:5px}';
  modeStyle.textContent += '.statutes-page[data-statutes-edit-mode="off"] .statuteCard,.statutes-page[data-statutes-edit-mode="off"] .statuteCard *{user-select:none!important;-webkit-user-select:none!important}.statutes-page[data-statutes-edit-mode="on"] .statuteSelectable{user-select:text!important;-webkit-user-select:text!important}';
  document.head.append(modeStyle);
  let selectedDefinition = null;


  const syncStatus = document.createElement('span');
  syncStatus.id = 'statutesSyncStatus';
  syncStatus.setAttribute('role', 'status');
  syncStatus.style.cssText = 'font-size:12px;max-width:min(48vw,340px);white-space:normal;overflow-wrap:anywhere';
  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.textContent = '再試行';
  retryButton.title = '逐条集のクラウド同期を再試行';
  retryButton.style.cssText = 'font:inherit;font-size:12px;color:inherit;background:transparent;border:1px solid currentColor;border-radius:5px;padding:3px 5px;cursor:pointer';
  retryButton.hidden = true;
  (currentLabel || header.querySelector('.globalShellBrand'))?.after(editSwitch, syncStatus, retryButton);
  const guestMode = window.TestCodeGuest?.isActive() === true;
  let syncTimer = null;
  let syncInFlight = null;
  let retryCount = 0;
  function setSyncStatus(text, detail = '') {
    syncStatus.textContent = text;
    syncStatus.title = detail || text;
  }
  function scheduleRetry() {
    if (guestMode || syncTimer !== null || document.visibilityState === 'hidden') return;
    const delay = Math.min(300000, 10000 * Math.pow(2, Math.min(retryCount++, 5)));
    syncTimer = setTimeout(() => { syncTimer = null; void performSync(); }, delay);
  }
  function clearRetry() {
    if (syncTimer !== null) clearTimeout(syncTimer);
    syncTimer = null;
  }
  function describeFailure(error) {
    const message = String(error?.message || '原因を取得できませんでした').replace(/\s+/g, ' ').slice(0, 180);
    const status = Number(error?.status);
    if (navigator.onLine === false) return 'オフライン';
    if (status === 401 || status === 403) return '認証エラー：' + message;
    if (status === 409) return '競合：' + message;
    return message;
  }
  function describeDeferred(reason) {
    return ({
      offline:'オフライン', locked:'保管庫がロックされています',
      unauthenticated:'認証が必要です', 'local-conflict':'端末とクラウドの内容が競合しています（自動上書きしません）',
      guest:'ゲストモード'
    })[reason] || (reason || '同期保留');
  }
  if (guestMode) {
    setSyncStatus('ゲスト：端末保存のみ');
  } else {
    setSyncStatus(window.MangaVault?.hasPendingLocalChanges?.() ? '端末保存済み・クラウド同期待ち' : 'クラウド同期未確認');
  }
  function performSync() {
    if (guestMode) return Promise.resolve();
    if (syncInFlight) return syncInFlight;
    clearRetry();
    retryButton.hidden = true;
    setSyncStatus('クラウド同期中…');
    syncInFlight = (async () => {
      try {
        const result = await window.MangaVault.syncStatutesLatest();
        if (result?.state === 'success') {
          retryCount = 0;
          setSyncStatus('クラウド同期完了');
        } else {
          const reason = describeDeferred(result?.reason);
          const conflict = result?.reason === 'local-conflict';
          setSyncStatus((conflict ? '同期競合' : 'クラウド同期待ち') + '（' + reason + '）');
          retryButton.hidden = false;
          // Conflicts and locked/unauthenticated states require intervention.
          if (!conflict && !['locked','unauthenticated','guest'].includes(result?.reason)) scheduleRetry();
        }
      } catch (error) {
        const reason = describeFailure(error);
        setSyncStatus('クラウド同期失敗・端末保存済み（' + reason + '）', reason);
        retryButton.hidden = false;
        if (![401,403].includes(Number(error?.status)) && !/認証情報が更新|revisionを検証|保管庫が見つかりません/.test(reason)) scheduleRetry();
      }
    })().finally(() => { syncInFlight = null; });
    return syncInFlight;
  }
  retryButton.addEventListener('click', () => { retryCount = 0; void performSync(); });
  document.addEventListener('manga-vault-sync-state', event => {
    if (guestMode || syncInFlight) return;
    const state = event.detail?.state;
    if (state === 'error' || state === 'failed') {
      const reason = String(event.detail?.message || '原因不明').slice(0, 180);
      setSyncStatus('クラウド同期失敗・端末保存済み（' + reason + '）', reason);
      retryButton.hidden = false;
      scheduleRetry();
    }
  });
  window.addEventListener('online', () => { if (!guestMode) {retryCount = 0; void performSync();} });
  document.addEventListener('visibilitychange', () => {
    if (!guestMode && document.visibilityState === 'visible' && !syncInFlight) {
      retryCount = 0;
      void performSync();
    } else if (document.visibilityState === 'hidden') clearRetry();
  });

  const side = document.createElement('aside');
  side.id = 'statutesDefinitionSide';
  side.className = 'statutesDefinitionSide';
  side.setAttribute('aria-label', '定義');
  side.setAttribute('aria-hidden', 'true');
  side.innerHTML = '<div class="statutesDefinitionHeader"><strong>定義</strong><button type="button" class="statutesDefinitionClose" aria-label="閉じる">×</button></div><div class="statutesDefinitionBody"><p class="statutesDefinitionQuote"></p><p class="statutesDefinitionSource"></p><div class="statutesDefinitionValue"></div><form class="statutesDefinitionForm" hidden><label class="statutesDefinitionStatuteMode"><input class="statutesDefinitionStatuteToggle" type="checkbox">条文から明らか（本文を定義に使う）</label><p class="statutesDefinitionStatutePreview" hidden></p><textarea aria-label="定義の内容" rows="6" required></textarea><div class="statutesDefinitionActions"><button type="submit">保存</button><button type="button" class="statutesDefinitionDelete" hidden>削除</button><button type="button" class="statutesDefinitionCancel">キャンセル</button><button type="button" class="statutesDefinitionSyncToggle">同期ブロック</button></div><div class="statutesDefinitionSyncPicker" hidden><input type="search" aria-label="定義を検索" placeholder="定義を検索"><div class="statutesDefinitionSyncResults"></div></div><p class="statutesDefinitionStatus" role="status"></p></form></div>';
  host.appendChild(side);
  side.inert = true;
  const headerTitle = side.querySelector('.statutesDefinitionHeader strong');
  const definitionBody = side.querySelector('.statutesDefinitionBody');
  const definitionSource = side.querySelector('.statutesDefinitionSource');
  const quote = side.querySelector('.statutesDefinitionQuote');
  const value = side.querySelector('.statutesDefinitionValue');
  const form = side.querySelector('.statutesDefinitionForm');
  const textarea = form.querySelector('textarea');
  const statutoryToggle = form.querySelector('.statutesDefinitionStatuteToggle');
  const statutoryPreview = form.querySelector('.statutesDefinitionStatutePreview');
  const status = form.querySelector('.statutesDefinitionStatus');
  const deleteButton = form.querySelector('.statutesDefinitionDelete');
  const closeButton = side.querySelector('.statutesDefinitionClose');
  const syncToggle = form.querySelector('.statutesDefinitionSyncToggle');
  const syncPicker = form.querySelector('.statutesDefinitionSyncPicker');
  const syncSearch = syncPicker.querySelector('input');
  const syncResults = syncPicker.querySelector('.statutesDefinitionSyncResults');
  const syncStyle = document.createElement('style');
  syncStyle.textContent = '.statutesDefinitionSyncPicker{margin-top:12px}.statutesDefinitionSyncPicker[hidden]{display:none}.statutesDefinitionSyncPicker input{box-sizing:border-box;width:100%;padding:8px;border:1px solid #8888;border-radius:6px;background:transparent;color:inherit;font:inherit}.statutesDefinitionSyncResults{max-height:35vh;overflow:auto;margin-top:8px}.statutesDefinitionSyncResults button{display:block;box-sizing:border-box;width:100%;padding:8px;text-align:left;border:0;border-bottom:1px solid #8884;background:transparent;color:inherit;cursor:pointer}.statutesDefinitionSyncResults button:hover{background:#8882}.statutesDefinitionSyncResults small{display:block;opacity:.75;white-space:normal;overflow-wrap:anywhere}';
  syncStyle.textContent += '.statutesDefinitionStatuteMode{display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;cursor:pointer}.statutesDefinitionStatuteMode input{width:16px;height:16px;margin:0;accent-color:var(--accent,#1769aa)}.statutesDefinitionStatutePreview{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px 12px;line-height:1.65;font-size:13px;background:rgba(128,128,128,.08);border-radius:6px}.statutesDefinitionStatutePreview[hidden],.statutesDefinitionForm textarea[hidden]{display:none!important}';
  document.head.appendChild(syncStyle);
  function resolveDefinition(entry, visited = new Set()) {
    const id = definitionId(entry);
    if (visited.has(id)) return entry.definition || '';
    visited.add(id);
    if (!entry.syncSourceId) return entry.definition || '';
    const source = definitions.find(d => definitionId(d) === entry.syncSourceId);
    return source ? resolveDefinition(source, visited) : (entry.definition || '');
  }
  function scoreMatch(a, b) {
    const normalize = s => String(s || '').replace(/\s/g, '').toLocaleLowerCase('ja');
    a = normalize(a); b = normalize(b);
    if (a === b) return 100;
    if (!a || !b) return 0;
    if (a.includes(b) || b.includes(a)) return 70 + Math.floor(20 * Math.min(a.length,b.length) / Math.max(a.length,b.length));
    const grams = s => [...s].flatMap((ch,i,arr) => i < arr.length - 1 ? [ch + arr[i+1]] : []);
    const aa = grams(a), bb = grams(b), remaining = new Map();
    bb.forEach(v => remaining.set(v,(remaining.get(v)||0)+1));
    let common = 0;
    aa.forEach(v => { if (remaining.get(v)>0) {common++;remaining.set(v,remaining.get(v)-1);} });
    return Math.round(70 * 2 * common / Math.max(1,aa.length+bb.length));
  }
  function renderSyncCandidates() {
    const target = pending;
    if (!target) return;
    const query = syncSearch.value.trim().toLocaleLowerCase('ja');
    const targetId = definitionId(target);
    syncResults.replaceChildren();
    const items = definitions.filter(d => definitionId(d) !== targetId && resolveDefinition(d).trim())
      .filter(d => !query || [d.quote,d.source,resolveDefinition(d)].some(v => String(v||'').toLocaleLowerCase('ja').includes(query)))
      .map(d => ({entry:d,score:scoreMatch(target.quote,d.quote)}))
      .sort((a,b) => b.score-a.score || a.entry.quote.localeCompare(b.entry.quote,'ja'));
    items.forEach(({entry}) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.quote;
      const detail = document.createElement('small');
      detail.textContent = (entry.source || '') + '　' + resolveDefinition(entry);
      button.append(detail);
      button.addEventListener('click', () => {
        const sourceId = definitionId(entry);
        const targetId = definitionId(target);
        const updated = definitions.filter(d => definitionId(d) !== targetId);
        // Link to the selected entry, preserving its current value for offline fallback.
        const linked = enrichDefinition({...target,definition:resolveDefinition(entry),syncSourceId:sourceId});
        updated.push(linked);
        if (saveDefinitions(updated)) {
          selectedDefinition = linked;
          closeSide();
        }
      });
      syncResults.append(button);
    });
  }
  syncToggle.addEventListener('click', () => {
    syncPicker.hidden = !syncPicker.hidden;
    if (!syncPicker.hidden) {syncSearch.value = '';renderSyncCandidates();syncSearch.focus();}
  });
  syncSearch.addEventListener('input',renderSyncCandidates);

  function articleDefinitionText(entry) {
    if (!entry || entry.subject !== subjectId) return '';
    const card = Array.from(page.querySelectorAll('.statuteCard'))
      .find(c => c.querySelector('.statuteNumber')?.textContent?.trim() === entry.article);
    return card?.querySelector('.statuteText')?.textContent?.trim() || '';
  }
  function updateStatutoryMode() {
    const usesArticle = statutoryToggle.checked;
    textarea.hidden = usesArticle;
    textarea.required = !usesArticle;
    statutoryPreview.hidden = !usesArticle;
    if (usesArticle) statutoryPreview.textContent = articleDefinitionText(pending) || 'この条文の本文を取得できません。';
  }
  statutoryToggle.addEventListener('change', updateStatutoryMode);

  function closePopup() {
    popup.dataset.visible = 'false';
    pending = null;
    selectedDefinition = null;
  }
  function closeInline() { if (inlineDefinition) { inlineDefinition.remove(); inlineDefinition = null; } }
  editSwitch.addEventListener('click', () => {
    editMode = !editMode;
    editSwitch.setAttribute('aria-checked', String(editMode));
    root.dataset.statutesEditMode = editMode ? 'on' : 'off';
    window.getSelection()?.removeAllRanges();
    closePopup();
    closeInline();
    closeSide();
  });
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
    if (!side.inert) return;
    const data = selectionCandidate();
    if (!data) {
      if (!selectedDefinition) closePopup();
      return;
    }
    pending = data.candidate;
    selectedDefinition = data.existing;
    showPopup(data.rect);
  }

  // Native text selection changes do not fire a click event; expose the edit action
  // after mouse, keyboard and touch selection without requiring a context menu.
  document.addEventListener('selectionchange', updateSelectionPopup);
  page.addEventListener('pointerup', updateSelectionPopup);
  page.addEventListener('keyup', updateSelectionPopup);

  function openDefinition(entry, editing) {
    if (!entry) return;
    if (!editMode) {
      closeSide();
      const card = Array.from(page.querySelectorAll('.statuteCard')).find(c => c.querySelector('.statuteNumber')?.textContent?.trim() === entry.article);
      if (!card) return;
      if (inlineDefinition && inlineDefinition.parentElement === card && inlineDefinition.dataset.definitionId === definitionId(entry)) { closeInline(); return; }
      closeInline();
      const panel = document.createElement('div');
      panel.className = 'statuteInlineDefinition';
      panel.dataset.definitionId = definitionId(entry);
      const heading = document.createElement('strong');
      heading.textContent = entry.quote + (entry.definitionKind === 'statute' ? '（条文による定義）' : '');
      const body = document.createElement('div');
      body.textContent = resolveDefinition(entry);
      panel.append(heading, body);
      card.append(panel);
      inlineDefinition = panel;
      return;
    }
    entry = enrichDefinition(entry);
    headerTitle.textContent = '定義';
    definitionBody.hidden = false;
    selectedDefinition = entry.definition ? entry : null;
    pending = {
      subject: subjectId, article: entry.article, part: entry.part,
      start: entry.start, end: entry.end, quote: entry.quote
    };
    quote.textContent = entry.quote;
    definitionSource.textContent = entry.source + (entry.definitionKind === 'statute' ? ' ・ 条文による定義' : '');
    form.hidden = !editing;
    value.hidden = editing;
    value.textContent = resolveDefinition(entry);
    textarea.value = resolveDefinition(entry);
    statutoryToggle.checked = entry.definitionKind === 'statute';
    updateStatutoryMode();
    syncPicker.hidden = true;
    syncToggle.hidden = !editing;
    deleteButton.hidden = !entry.definition;
    status.textContent = '';
    popup.dataset.visible = 'false';
    window.getSelection()?.removeAllRanges();
    showSide();
    if (editing) (statutoryToggle.checked ? statutoryToggle : textarea).focus({ preventScroll: true });
    else closeButton.focus({ preventScroll: true });
  }

  function saveDefinitions(next) {
    try {
      const normalized = next.map(enrichDefinition);
      const byId = new Map(normalized.map(d => [definitionId(d),d]));
      const effective = (entry, seen=new Set()) => {
        const id=definitionId(entry);
        if (seen.has(id)) return entry.definition || '';
        seen.add(id);
        const src=entry.syncSourceId && byId.get(entry.syncSourceId);
        return src ? effective(src,seen) : (entry.definition || '');
      };
      normalized.forEach(d => {
        if (d.syncSourceId) {
          const source=byId.get(d.syncSourceId);
          if (source) d.definition=effective(source);
          else delete d.syncSourceId;
        }
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      if (pending?.article) document.dispatchEvent(new CustomEvent('statutes-last-edit',{detail:{section:subjectId,article:pending.article}}));
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
    openDefinition(entry, editMode);
  }

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
    if (!pending) return;
    const text = statutoryToggle.checked ? articleDefinitionText(pending) : textarea.value.trim();
    if (!text) { status.textContent = '条文本文または定義文を取得できませんでした'; return; }
    const entry = statutoryToggle.checked
      ? definitionFromArticle(pending, text)
      : enrichDefinition({ ...pending, definition: text });
    const id = definitionId(entry);
    const updated = definitions.filter(d => definitionId(d) !== id);
    updated.push(entry);
    if (saveDefinitions(updated)) {
      selectedDefinition = entry;
      closeSide();
    }
  });
  deleteButton.addEventListener('click', () => {
    if (!selectedDefinition) return;
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
    closeInline();
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
    selectionForContext() {
      return selectionCandidate();
    },
    openContextDefinition(data) {
      if (!data) return;
      if (!editMode && !data.existing) return;
      openDefinition(data.existing || data.candidate, editMode);
    },
    refresh(section) {
      subjectId = section || 'civil-general';
      closePopup();
      closeSide();
      closeInline();
      indexEditableText();
      redraw();
    }
  };
  redraw();
})();