(()=>{
'use strict';

const Statute = window.StatuteData;
const Notes = window.StatuteNotes;
const Vault = window.MangaVault;
const VaultPayload = window.MangaVaultPayload;

const $ = (id) => document.getElementById(id);
const ui = {
  lawSelect: $('lawSelect'),
  articleNumInput: $('articleNumInput'),
  jumpBtn: $('jumpBtn'),
  keywordInput: $('keywordInput'),
  noteOnlyFilter: $('noteOnlyFilter'),
  clearFiltersBtn: $('clearFiltersBtn'),
  statuteList: $('statuteList'),
  statuteCount: $('statuteCount'),
  statusMsg: $('statusMsg')
};

let currentLawId = 'kenpo';
let notesMap = {};
let searchTimer = null;
let autoSaveTimers = new Map();

function setTheme() {
  try {
    const theme = localStorage.getItem('mangaReaderTheme');
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
}

function setStatus(msg, tone = '') {
  if (!ui.statusMsg) return;
  ui.statusMsg.textContent = msg || '';
  if (tone) ui.statusMsg.dataset.tone = tone;
  else delete ui.statusMsg.dataset.tone;
}

function initLaws() {
  ui.lawSelect.replaceChildren();
  Statute.LAWS.forEach((law) => {
    const opt = document.createElement('option');
    opt.value = law.id;
    opt.textContent = `${law.name} (${law.shortName})`;
    ui.lawSelect.append(opt);
  });
  ui.lawSelect.value = currentLawId;
}

function formatTagsHtml(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return tags.map((t) => `<span class="tagChip">#${escapeHtml(t)}</span>`).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function createParagraphNode(para) {
  const p = document.createElement('p');
  p.className = 'articleParagraph';
  if (para.num > 1) {
    const numSpan = document.createElement('span');
    numSpan.className = 'paragraphNum';
    numSpan.textContent = `${para.num} `;
    p.append(numSpan);
  }
  p.append(document.createTextNode(para.text));
  return p;
}

function buildArticleCard(article) {
  const key = Statute.statuteKey(article.lawId, article.num, article.subNum);
  const note = notesMap[key] || null;
  const hasNote = Boolean(note && String(note.text || '').trim());

  const card = document.createElement('article');
  card.className = 'statuteCard';
  card.id = `art-${article.lawId}-${article.num}${article.subNum ? `_${article.subNum}` : ''}`;
  card.dataset.key = key;

  // Header
  const head = document.createElement('div');
  head.className = 'statuteHead';

  const left = document.createElement('div');
  left.className = 'headLeft';

  const numBadge = document.createElement('span');
  numBadge.className = 'articleNumBadge';
  numBadge.textContent = article.displayNum;

  const titleSpan = document.createElement('h2');
  titleSpan.className = 'articleTitle';
  titleSpan.textContent = article.title ? `【${article.title}】` : '';

  left.append(numBadge, titleSpan);

  const right = document.createElement('div');
  right.className = 'headRight';

  if (article.chapter) {
    const chSpan = document.createElement('span');
    chSpan.className = 'chapterBadge';
    chSpan.textContent = article.chapter;
    right.append(chSpan);
  }

  head.append(left, right);
  card.append(head);

  // Body paragraphs
  const body = document.createElement('div');
  body.className = 'statuteBody';
  article.paragraphs.forEach((para) => {
    body.append(createParagraphNode(para));
  });
  card.append(body);

  // Note Section
  const noteSection = document.createElement('div');
  noteSection.className = 'statuteNoteSection';

  const notePreview = document.createElement('div');
  notePreview.className = 'notePreview';
  notePreview.hidden = !hasNote;

  const noteHeader = document.createElement('div');
  noteHeader.className = 'noteHeader';
  noteHeader.innerHTML = `<strong>📝 メモ</strong><div class="noteTags">${formatTagsHtml(note ? note.tags : [])}</div>`;

  const noteContent = document.createElement('div');
  noteContent.className = 'noteContent';
  noteContent.textContent = note ? note.text : '';

  notePreview.append(noteHeader, noteContent);
  noteSection.append(notePreview);

  // Note editor toggle button
  const editToggleBtn = document.createElement('button');
  editToggleBtn.className = 'glassBtn noteToggleBtn';
  editToggleBtn.type = 'button';
  editToggleBtn.textContent = hasNote ? 'メモを編集' : '＋ メモを追加';

  // Note editor panel (hidden by default)
  const editorPanel = document.createElement('div');
  editorPanel.className = 'noteEditorPanel';
  editorPanel.hidden = true;

  const textarea = document.createElement('textarea');
  textarea.className = 'noteTextarea';
  textarea.placeholder = 'この条文の趣旨、要件・効果、重要判例、学習メモを記入...';
  textarea.value = note ? note.text : '';

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'tagInput';
  tagInput.placeholder = 'タグ（カンマ区切り、例: 要件効果, 重要判例）';
  tagInput.value = note && Array.isArray(note.tags) ? note.tags.join(', ') : '';

  const editorActions = document.createElement('div');
  editorActions.className = 'editorActions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'glassBtn primary smallBtn';
  saveBtn.textContent = '保存';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'glassBtn danger smallBtn';
  delBtn.textContent = 'メモを削除';
  delBtn.hidden = !hasNote;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'glassBtn smallBtn';
  closeBtn.textContent = '閉じる';

  const saveStatus = document.createElement('span');
  saveStatus.className = 'saveStatusText';

  editorActions.append(saveBtn, delBtn, closeBtn, saveStatus);
  editorPanel.append(textarea, tagInput, editorActions);

  // Event handlers for note editing
  function saveCurrentNote(notify = true) {
    const textVal = textarea.value.trim();
    const tagVal = tagInput.value;
    notesMap = Notes.setNote(key, textVal ? { text: textVal, tags: tagVal } : null);
    Notes.scheduleSync(Vault, VaultPayload);

    if (textVal) {
      noteContent.textContent = textVal;
      noteHeader.querySelector('.noteTags').innerHTML = formatTagsHtml(Notes.sanitizeTags(tagVal));
      notePreview.hidden = false;
      delBtn.hidden = false;
      editToggleBtn.textContent = 'メモを編集';
    } else {
      noteContent.textContent = '';
      notePreview.hidden = true;
      delBtn.hidden = true;
      editToggleBtn.textContent = '＋ メモを追加';
    }

    if (notify) {
      saveStatus.textContent = '保存しました';
      setTimeout(() => { saveStatus.textContent = ''; }, 2000);
    }
  }

  saveBtn.addEventListener('click', () => saveCurrentNote(true));

  delBtn.addEventListener('click', () => {
    if (!confirm('この条文のメモを削除しますか？')) return;
    textarea.value = '';
    tagInput.value = '';
    saveCurrentNote(true);
    editorPanel.hidden = true;
  });

  closeBtn.addEventListener('click', () => {
    saveCurrentNote(false);
    editorPanel.hidden = true;
  });

  editToggleBtn.addEventListener('click', () => {
    editorPanel.hidden = !editorPanel.hidden;
    if (!editorPanel.hidden) {
      textarea.focus();
    }
  });

  // Debounced autosave
  textarea.addEventListener('input', () => {
    clearTimeout(autoSaveTimers.get(key));
    autoSaveTimers.set(key, setTimeout(() => {
      saveCurrentNote(false);
      saveStatus.textContent = '自動保存済';
      setTimeout(() => { saveStatus.textContent = ''; }, 1500);
    }, 1500));
  });

  noteSection.append(editToggleBtn, editorPanel);
  card.append(noteSection);

  return card;
}

function renderArticles() {
  const articles = Statute.getArticlesForLaw(currentLawId);
  const options = {
    articleNum: ui.articleNumInput.value.trim(),
    query: ui.keywordInput.value.trim(),
    hasNoteOnly: ui.noteOnlyFilter.checked,
    notesMap
  };

  const filtered = Statute.filterArticles(articles, options);
  ui.statuteList.replaceChildren();

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'emptyCard';
    empty.innerHTML = '<strong>該当する条文がありません</strong><span>検索条件を変更するか、法令を切り替えてください。</span>';
    ui.statuteList.append(empty);
    ui.statuteCount.textContent = '0件';
    return;
  }

  filtered.forEach((art) => {
    ui.statuteList.append(buildArticleCard(art));
  });

  ui.statuteCount.textContent = `${filtered.length}件`;
}

function jumpToArticle() {
  const rawNum = ui.articleNumInput.value.trim();
  if (!rawNum) return;
  const num = Number(rawNum);
  if (!num) return;

  renderArticles();

  const targetId = `art-${currentLawId}-${num}`;
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlightPulse');
    setTimeout(() => el.classList.remove('highlightPulse'), 2000);
  } else {
    setStatus(`第${num}条は見つかりませんでした`, 'warn');
    setTimeout(() => setStatus(''), 3000);
  }
}

function bindEvents() {
  ui.lawSelect.addEventListener('change', () => {
    currentLawId = ui.lawSelect.value;
    ui.articleNumInput.value = '';
    renderArticles();
  });

  ui.jumpBtn.addEventListener('click', jumpToArticle);
  ui.articleNumInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      jumpToArticle();
    }
  });

  ui.keywordInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderArticles, 120);
  });

  ui.noteOnlyFilter.addEventListener('change', renderArticles);

  ui.clearFiltersBtn.addEventListener('click', () => {
    ui.articleNumInput.value = '';
    ui.keywordInput.value = '';
    ui.noteOnlyFilter.checked = false;
    renderArticles();
  });
}

function boot() {
  setTheme();
  const session = Vault && Vault.loadSession();
  if (!session || !session.user || !session.user.id) {
    window.location.replace('index.html');
    return;
  }
  const activeVault = Vault.loadActive();
  if (!activeVault || !activeVault.rawKey) {
    window.location.replace('sync.html');
    return;
  }

  notesMap = Notes.loadNotes();
  initLaws();
  bindEvents();
  renderArticles();
  document.documentElement.classList.remove('auth-pending');
}

window.StatutePage = {
  renderArticles,
  jumpToArticle,
  getNotes: () => notesMap
};

boot();
})();
