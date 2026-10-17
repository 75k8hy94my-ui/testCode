(() => {
  'use strict';
  const page = document.getElementById('routeContent');
  if (!page || !document.documentElement.classList.contains('statutes-page')) return;
  const KEY = 'testCode.statutes.articleNotes.v1';
  const HISTORY_KEY = 'testCode.statutes.articleNoteHistory.v1';
  const root = document.documentElement;
  let section = new URLSearchParams(location.search).get('section') || 'civil-general';
  let notes = read();
  let history = readHistory();
  let activeCard = null;
  let activeSelection = null;
  let selectionBeforeRightClick = null;
  page.addEventListener('pointerdown', event => {
    if (event.button === 2) selectionBeforeRightClick = window.StatutesDefinitions?.selectionForContext?.() || null;
  }, true);
  const style = document.createElement('style');
  style.textContent = `
    .statuteNoteMenu{position:fixed;z-index:12000;min-width:140px;padding:5px;border:1px solid var(--border, #aaa);border-radius:9px;background:var(--bg,#fff);color:var(--text,#222);box-shadow:0 8px 24px #0003}
    .statuteNoteMenu[hidden]{display:none}
    .statuteNoteMenu button{display:block;width:100%;padding:9px 12px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer}
    .statuteNoteMenu button[hidden]{display:none}
    .statuteNoteMenu button:hover{background:rgba(128,128,128,.17)}
    .statuteNoteHistory{display:block;width:100%;margin-top:8px;font:inherit;font-size:12px;padding:5px;color:inherit;background:transparent}
    .statuteArticleNote textarea{box-sizing:border-box;width:100%;min-height:110px;padding:8px;resize:vertical;font:inherit;color:inherit;background:transparent;border:1px solid #8888;border-radius:5px}
    .statuteNoteButtons{display:flex;justify-content:flex-end;gap:6px;margin-top:8px;flex-wrap:wrap}
    .statuteNoteButtons button{padding:5px 9px;cursor:pointer}
    .statuteArticleNote{box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px 10px;border-left:2px solid #8b96a8;font-size:13px;line-height:1.65;color:var(--text,#222);opacity:.86}
    @media(min-width:1100px){.statuteCard:has(>.statuteArticleNote){position:relative}.statuteCard>.statuteArticleNote{position:absolute;left:calc(100% + 16px);top:0;width:min(270px,calc((100vw - 100%) / 2 - 26px))}}
    @media(max-width:1099px){.statuteArticleNote{margin-top:8px}}
  `;
  document.head.append(style);
  const menu = document.createElement('div');
  menu.className = 'statuteNoteMenu';
  menu.hidden = true;
  menu.innerHTML = '<button type="button" data-action="note">メモを編集</button><button type="button" data-action="definition">定義</button>';
  document.body.append(menu);
  function read() {
    try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  }
  function readHistory() {
    try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  }
  function article(card) { return card?.querySelector('.statuteNumber')?.textContent?.trim() || ''; }
  function identity(card) { return section + ':' + article(card); }
  function hideMenu() { menu.hidden = true; }
  function render() {
    page.querySelectorAll('.statuteCard').forEach(card => {
      card.querySelector(':scope > .statuteArticleNote')?.remove();
      const value = notes[identity(card)];
      if (typeof value !== 'string' || !value.trim()) return;
      const el = document.createElement('aside');
      el.className = 'statuteArticleNote';
      el.textContent = value;
      card.append(el);
    });
  }
  function edit() {
    if (!activeCard) return;
    hideMenu();
    const card = activeCard;
    const key = identity(card);
    const initial = notes[key] || '';
    const el = card.querySelector(':scope > .statuteArticleNote') || document.createElement('aside');
    el.className = 'statuteArticleNote';
    el.replaceChildren();
    if (!el.isConnected) card.append(el);
    const form = document.createElement('form');
    const textarea = document.createElement('textarea');
    textarea.setAttribute('aria-label', article(card) + 'のメモ');
    textarea.value = initial;
    const actions = document.createElement('div');
    actions.className = 'statuteNoteButtons';
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = '保存';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'キャンセル';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = '削除';
    deleteButton.hidden = !initial;
    actions.append(deleteButton, cancelButton, saveButton);
    const versions = Object.entries(history).filter(([, v]) => v.key === key)
      .sort((a,b) => b[1].at-a[1].at).slice(0,50);
    if (versions.length) {
      const selector = document.createElement('select');
      selector.className = 'statuteNoteHistory';
      selector.setAttribute('aria-label','編集履歴');
      selector.add(new Option('編集履歴から復元',''));
      versions.forEach(([id, item]) => {
        selector.add(new Option(new Date(item.at).toLocaleString('ja-JP') + (item.after ? '　編集' : '　削除'),id));
      });
      selector.addEventListener('change', () => {
        if (!selector.value) return;
        textarea.value = history[selector.value]?.before || '';
        selector.value = '';
        textarea.focus();
      });
      form.append(selector);
    }
    form.append(textarea, actions);
    el.append(form);
    function cancel() {
      if (initial) el.textContent = initial;
      else el.remove();
    }
    function save(value) {
      const next = {...notes};
      if (value.trim()) next[key] = value.trim();
      else delete next[key];
      try {
        if ((notes[key] || '') === (next[key] || '')) { cancel(); return; }
        const id = Date.now() + '-' + Math.random().toString(36).slice(2);
        const updatedHistory = {...history, [id]: {key, before: notes[key] || '', after: next[key] || '', at: Date.now()}};
        const trimmed = Object.fromEntries(Object.entries(updatedHistory).sort((a,b) => b[1].at-a[1].at).slice(0,50));
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        localStorage.setItem(KEY, JSON.stringify(next));
        history = trimmed;
        notes = next;
        if (!window.TestCodeGuest?.isActive()) {
          const vault = window.MangaVault;
          if (vault?.markLocalChangesPending?.()) Promise.resolve(vault.saveLocalChanges?.()).catch(() => {});
        }
        if (value.trim()) el.textContent = value.trim();
        else el.remove();
      } catch (_) {
        textarea.setCustomValidity('保存できませんでした');
        textarea.reportValidity();
        textarea.setCustomValidity('');
      }
    }
    form.addEventListener('submit', event => { event.preventDefault(); save(textarea.value); });
    cancelButton.addEventListener('click', cancel);
    deleteButton.addEventListener('click', () => save(''));
    textarea.focus({preventScroll:true});
  }
  page.addEventListener('contextmenu', event => {
    const card = event.target.closest?.('.statuteCard');
    if (!card || !page.contains(card) || !article(card)) return;
    event.preventDefault();
    activeCard = card;
    const currentSelection = window.StatutesDefinitions?.selectionForContext?.() || null;
    const savedSelection = selectionBeforeRightClick;
    activeSelection = currentSelection || (savedSelection?.candidate?.article === article(card) ? savedSelection : null);
    selectionBeforeRightClick = null;
    menu.querySelector('[data-action="note"]').textContent = article(card) + 'のメモ';
    menu.querySelector('[data-action="note"]').hidden = false;
    menu.querySelector('[data-action="definition"]').hidden = !activeSelection;
    menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - menu.offsetHeight - 8)) + 'px';
  });
  menu.querySelector('[data-action="note"]').addEventListener('click', edit);
  menu.querySelector('[data-action="definition"]').addEventListener('click', () => {
    hideMenu();
    window.StatutesDefinitions?.openContextDefinition?.(activeSelection);
  });
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) hideMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideMenu();
  });
  const originalRefresh = window.StatutesDefinitions?.refresh;
  if (originalRefresh) {
    window.StatutesDefinitions.refresh = function(nextSection) {
      section = nextSection || 'civil-general';
      originalRefresh.call(this, nextSection);
      activeCard = null;
      hideMenu();
      render();
    };
  }
  window.addEventListener('storage', event => { if (event.key === KEY || event.key === HISTORY_KEY) {notes = read(); history = readHistory(); render();} });
  document.addEventListener('manga-vault-payload-applied', () => {notes = read();history = readHistory();render();});
  render();
})();