(() => {
  'use strict';
  const page = document.getElementById('routeContent');
  if (!page || !document.documentElement.classList.contains('statutes-page')) return;
  const KEY = 'testCode.statutes.articleNotes.v1';
  const root = document.documentElement;
  let section = new URLSearchParams(location.search).get('section') || 'civil-general';
  let notes = read();
  let activeCard = null;
  const style = document.createElement('style');
  style.textContent = `
    .statuteNoteMenu{position:fixed;z-index:12000;min-width:140px;padding:5px;border:1px solid var(--border, #aaa);border-radius:9px;background:var(--bg,#fff);color:var(--text,#222);box-shadow:0 8px 24px #0003}
    .statuteNoteMenu[hidden]{display:none}
    .statuteNoteMenu button{display:block;width:100%;padding:9px 12px;border:0;border-radius:5px;background:transparent;color:inherit;text-align:left;cursor:pointer}
    .statuteNoteMenu button:hover{background:rgba(128,128,128,.17)}
    .statuteNoteEditor{position:fixed;z-index:12001;inset:0;display:grid;place-items:center;background:#0006}
    .statuteNoteEditor[hidden]{display:none}
    .statuteNoteDialog{box-sizing:border-box;width:min(440px,calc(100vw - 32px));padding:16px;border-radius:12px;background:var(--bg,#fff);color:var(--text,#222);box-shadow:0 12px 32px #0004}
    .statuteNoteDialog textarea{box-sizing:border-box;width:100%;min-height:140px;resize:vertical;padding:10px;font:inherit;background:transparent;color:inherit;border:1px solid #8888;border-radius:6px}
    .statuteNoteButtons{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
    .statuteNoteButtons button{padding:7px 14px;cursor:pointer}
    .statuteArticleNote{box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px 10px;border-left:2px solid #8b96a8;font-size:13px;line-height:1.65;color:var(--text,#222);opacity:.86}
    @media(min-width:1100px){.statuteCard:has(>.statuteArticleNote){position:relative}.statuteCard>.statuteArticleNote{position:absolute;left:calc(100% + 16px);top:0;width:min(270px,calc((100vw - 100%) / 2 - 26px))}}
    @media(max-width:1099px){.statuteArticleNote{margin-top:8px}}
  `;
  document.head.append(style);
  const menu = document.createElement('div');
  menu.className = 'statuteNoteMenu';
  menu.hidden = true;
  menu.innerHTML = '<button type="button">メモを編集</button>';
  document.body.append(menu);
  const overlay = document.createElement('div');
  overlay.className = 'statuteNoteEditor';
  overlay.hidden = true;
  overlay.innerHTML = '<form class="statuteNoteDialog"><strong class="statuteNoteTitle"></strong><textarea aria-label="条文メモ"></textarea><div class="statuteNoteButtons"><button type="button" data-action="delete">削除</button><button type="button" data-action="cancel">キャンセル</button><button type="submit">保存</button></div></form>';
  document.body.append(overlay);
  const form = overlay.querySelector('form');
  const textarea = overlay.querySelector('textarea');
  function read() {
    try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
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
    overlay.querySelector('.statuteNoteTitle').textContent = article(activeCard);
    textarea.value = notes[identity(activeCard)] || '';
    overlay.querySelector('[data-action="delete"]').hidden = !textarea.value;
    overlay.hidden = false;
    textarea.focus();
  }
  function save(value) {
    if (!activeCard) return;
    const next = {...notes};
    if (value.trim()) next[identity(activeCard)] = value.trim();
    else delete next[identity(activeCard)];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      notes = next;
      overlay.hidden = true;
      render();
    } catch (_) { textarea.setCustomValidity('保存できませんでした'); textarea.reportValidity(); textarea.setCustomValidity(''); }
  }
  page.addEventListener('contextmenu', event => {
    const card = event.target.closest?.('.statuteCard');
    if (!card || !page.contains(card) || !article(card)) return;
    event.preventDefault();
    activeCard = card;
    menu.hidden = false;
    menu.style.left = Math.max(8, Math.min(event.clientX, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(event.clientY, innerHeight - menu.offsetHeight - 8)) + 'px';
  });
  menu.querySelector('button').addEventListener('click', edit);
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target)) hideMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hideMenu(); overlay.hidden = true; }
  });
  form.addEventListener('submit', event => { event.preventDefault(); save(textarea.value); });
  form.querySelector('[data-action="cancel"]').addEventListener('click', () => { overlay.hidden = true; });
  form.querySelector('[data-action="delete"]').addEventListener('click', () => save(''));
  overlay.addEventListener('pointerdown', event => { if (event.target === overlay) overlay.hidden = true; });
  const originalRefresh = window.StatutesDefinitions?.refresh;
  if (originalRefresh) {
    window.StatutesDefinitions.refresh = function(nextSection) {
      section = nextSection || 'civil-general';
      originalRefresh.call(this, nextSection);
      activeCard = null;
      hideMenu();
      overlay.hidden = true;
      render();
    };
  }
  window.addEventListener('storage', event => { if (event.key === KEY) {notes = read();render();} });
  document.addEventListener('manga-vault-payload-applied', () => {notes = read();render();});
  render();
})();