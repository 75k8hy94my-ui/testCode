(()=>{
'use strict';

const MAX_IMPORT_CONCURRENCY = 4;
const SEARCH_DEBOUNCE_MS = 120;
const SETTINGS_SYNC_DELAY_MS = 900;
const INITIAL_RESULT_LIMIT = 100;
const RESULT_LIMIT_STEP = 100;

const Schema = window.LegalIndexSchema;
const Search = window.LegalIndexSearch;
const ChunkCrypto = window.EncryptedChunkCrypto;
const ChunkCache = window.EncryptedChunkCache;
const ChunkSync = window.EncryptedChunkSync;
const VaultPayload = window.MangaVaultPayload;
const Vault = window.MangaVault;

const $ = (id) => document.getElementById(id);
const ui = {
  query: $('indexQuery'), kindTabs: $('kindTabs'), subjectFilters: $('subjectFilters'), bookFilters: $('bookFilters'),
  subjectFilterCount: $('subjectFilterCount'), bookFilterCount: $('bookFilterCount'), results: $('searchResults'), status: $('indexStatus'),
  importPanel: $('importPanel'), settingsPanel: $('settingsPanel'), booksPanel: $('booksPanel'),
  openImport: $('openImportBtn'), openSettings: $('openSettingsBtn'), openBooks: $('openBooksBtn'), files: $('indexFiles'),
  importPreview: $('importPreview'), commitImport: $('commitImportBtn'), bookManager: $('bookManagerList'),
  matchExact: $('matchExact'), matchPartial: $('matchPartial'), matchAnd: $('matchAnd'), matchFuzzy: $('matchFuzzy')
};

let cache = null;
let session = null;
let activeVault = null;
let settings = null;
let importedBooks = [];
let booksById = new Map();
let cacheRecords = new Map();
let searchIndex = Search.buildIndex([]);
let importRows = [];
let searchTimer = null;
let settingsSyncTimer = null;
let cloudSyncRunning = false;
let resultLimit = INITIAL_RESULT_LIMIT;
let lastSearchSignature = '';

function node(tag, className, textValue) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (textValue != null) element.textContent = String(textValue);
  return element;
}

function setStatus(message, tone = '') {
  ui.status.textContent = message || '';
  if (tone) ui.status.dataset.tone = tone;
  else delete ui.status.dataset.tone;
}

function parseJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function loadSettings() {
  return VaultPayload.normalizeIndexSearchSettings(parseJsonStorage(VaultPayload.DATA_KEYS.indexSearchSettings, {}));
}

function persistSettingsLocal() {
  localStorage.setItem(VaultPayload.DATA_KEYS.indexSearchSettings, JSON.stringify(settings));
}

async function saveSettingsToVault() {
  clearTimeout(settingsSyncTimer);
  settingsSyncTimer = null;
  if (!navigator.onLine) return;
  try {
    await Vault.savePayload(VaultPayload.buildFromLocalStorage());
  } catch (error) {
    setStatus(`検索設定は端末に保存済みです。クラウド同期: ${error && error.message ? error.message : '失敗'}`, 'warn');
  }
}

function scheduleSettingsSync() {
  persistSettingsLocal();
  clearTimeout(settingsSyncTimer);
  settingsSyncTimer = setTimeout(saveSettingsToVault, SETTINGS_SYNC_DELAY_MS);
}

function setTheme() {
  try {
    document.documentElement.dataset.theme = localStorage.getItem('mangaReaderTheme') === 'light' ? 'light' : 'dark';
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
}

function showPanel(panel) {
  for (const candidate of [ui.importPanel, ui.settingsPanel, ui.booksPanel]) candidate.hidden = candidate !== panel || !candidate.hidden;
  if (panel && !panel.hidden) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function closePanels() {
  ui.importPanel.hidden = true;
  ui.settingsPanel.hidden = true;
  ui.booksPanel.hidden = true;
}

function subjectsFromText(value) {
  const seen = new Set();
  return String(value || '').split(/[、,;；\n]+/).map((item) => item.trim()).filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function countsForBook(book) {
  return {
    matter: Array.isArray(book.matterEntries) ? book.matterEntries.length : 0,
    case: Array.isArray(book.caseEntries) ? book.caseEntries.length : 0,
    statute: Array.isArray(book.statuteEntries) ? book.statuteEntries.length : 0
  };
}

function bookCacheRecord(book) {
  return cacheRecords.get(book.chunkId) || null;
}

async function loadBooksFromCache({ preserveStatus = false } = {}) {
  const rows = await cache.list();
  cacheRecords = new Map(rows.map((row) => [row.chunkId, row]));
  const books = [];
  const failures = [];
  for (const record of rows) {
    if (record.deletedAt || record.pendingAction === 'delete') continue;
    try {
      const value = await ChunkCrypto.decryptChunk(activeVault.rawKey, record.chunkId, record.payload);
      if (!value || value.type !== 'index-book' || value.chunkId !== record.chunkId || !value.bookId) throw new Error('索引データの識別情報が一致しません。');
      books.push(value);
    } catch (error) {
      failures.push({ chunkId: record.chunkId, error });
    }
  }
  importedBooks = books;
  booksById = new Map(books.map((book) => [book.bookId, book]));
  searchIndex = Search.buildIndex(books);
  renderFilters();
  renderBookManager();
  renderSearch();
  if (failures.length && !preserveStatus) setStatus(`${failures.length}冊の暗号化索引を復号できませんでした。暗号文は削除していません。`, 'error');
  return { books, failures };
}

function existingSubjects() {
  return [...new Set(importedBooks.flatMap((book) => Array.isArray(book.book && book.book.subjects) ? book.book.subjects : []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function toggleInArray(source, value, checked) {
  const set = new Set(Array.isArray(source) ? source : []);
  if (checked) set.add(value); else set.delete(value);
  return [...set];
}

function renderFilterChecks(container, values, selected, onChange) {
  container.replaceChildren();
  if (!values.length) {
    container.append(node('div', 'checkRow', '登録済みデータがありません'));
    return;
  }
  values.forEach((value) => {
    const label = node('label', 'checkRow');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = selected.includes(value.id);
    input.addEventListener('change', () => onChange(value.id, input.checked));
    const title = node('span', '', value.label);
    label.append(input, title);
    container.append(label);
  });
}

function renderFilters() {
  const subjects = existingSubjects();
  renderFilterChecks(ui.subjectFilters, subjects.map((subject) => ({ id: subject, label: subject })), settings.selectedSubjects, (subject, checked) => {
    settings.selectedSubjects = toggleInArray(settings.selectedSubjects, subject, checked);
    scheduleSettingsSync();
    ui.subjectFilterCount.textContent = settings.selectedSubjects.length ? `(${settings.selectedSubjects.length})` : '';
    resultLimit = INITIAL_RESULT_LIMIT;
    renderSearch();
  });
  renderFilterChecks(ui.bookFilters, importedBooks.slice().sort((a, b) => a.book.title.localeCompare(b.book.title, 'ja')).map((book) => ({ id: book.bookId, label: book.book.title })), settings.selectedBookIds, (bookId, checked) => {
    settings.selectedBookIds = toggleInArray(settings.selectedBookIds, bookId, checked);
    scheduleSettingsSync();
    ui.bookFilterCount.textContent = settings.selectedBookIds.length ? `(${settings.selectedBookIds.length})` : '';
    resultLimit = INITIAL_RESULT_LIMIT;
    renderSearch();
  });
  const existingSubjectSet = new Set(subjects);
  const existingBookSet = new Set(importedBooks.map((book) => book.bookId));
  const visibleSubjects = settings.selectedSubjects.filter((value) => existingSubjectSet.has(value));
  const visibleBooks = settings.selectedBookIds.filter((value) => existingBookSet.has(value));
  ui.subjectFilterCount.textContent = visibleSubjects.length ? `(${visibleSubjects.length})` : '';
  ui.bookFilterCount.textContent = visibleBooks.length ? `(${visibleBooks.length})` : '';
}

function effectiveFilters() {
  const subjects = new Set(existingSubjects());
  const bookIds = new Set(importedBooks.map((book) => book.bookId));
  return {
    subjectIds: settings.selectedSubjects.filter((value) => subjects.has(value)),
    bookIds: settings.selectedBookIds.filter((value) => bookIds.has(value))
  };
}

function matchLabel(matchClass) {
  return ({ exact: '完全一致', partial: '部分一致', and: 'AND一致', fuzzy: 'あいまい' })[matchClass] || matchClass;
}

function kindLabel(kind) {
  return ({ matter: '事項', case: '判例', statute: '条文' })[kind] || kind;
}

function renderEmpty(title, detail) {
  const box = node('div', 'emptyCard');
  box.append(node('strong', '', title), node('span', '', detail));
  ui.results.append(box);
}

function renderResultCard(result) {
  const card = node('article', 'resultCard');
  const head = node('div', 'resultHead');
  head.append(node('div', 'resultTitle', result.display), node('span', 'matchBadge', `${kindLabel(result.kind)} · ${matchLabel(result.matchClass)}`));
  const sources = node('div', 'sourceList');
  result.sources.forEach((source) => {
    const row = node('div', 'sourceRow');
    const left = node('div');
    left.append(node('div', 'sourceBook', source.bookTitle));
    if (source.subjects.length) left.append(node('div', 'bookMeta', source.subjects.join('・')));
    row.append(left, node('div', 'sourcePages', `p. ${source.pages.join(', ')}`));
    sources.append(row);
  });
  card.append(head, sources);
  return card;
}

function renderSearch() {
  if (!ui.results) return;
  ui.results.replaceChildren();
  const query = ui.query.value.trim();
  if (!query) {
    renderEmpty(importedBooks.length ? '検索語を入力してください' : '索引がまだ登録されていません', importedBooks.length ? `${importedBooks.length}冊の索引を検索できます。` : '「JSONを読み込む」から、AIで変換した索引JSONを登録してください。');
    return;
  }
  const filters = effectiveFilters();
  const results = Search.search(searchIndex, query, {
    kind: settings.activeKind,
    subjectIds: filters.subjectIds,
    bookIds: filters.bookIds,
    matchModes: settings.matchModes
  });
  const signature = [query, settings.activeKind, filters.subjectIds.join('|'), filters.bookIds.join('|'), JSON.stringify(settings.matchModes)].join('::');
  if (signature !== lastSearchSignature) {
    lastSearchSignature = signature;
    resultLimit = INITIAL_RESULT_LIMIT;
  }
  if (!results.length) {
    renderEmpty('一致する索引がありません', '検索方式や科目・書籍フィルタを変更すると見つかる場合があります。');
    return;
  }
  results.slice(0, resultLimit).forEach((result) => ui.results.append(renderResultCard(result)));
  if (results.length > resultLimit) {
    const more = node('button', 'glassBtn', `さらに表示（残り${results.length - resultLimit}件）`);
    more.type = 'button';
    more.addEventListener('click', () => { resultLimit += RESULT_LIMIT_STEP; renderSearch(); });
    ui.results.append(more);
  }
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderSearch, 120);
}

function syncSettingsControls() {
  ui.matchExact.checked = settings.matchModes.exact;
  ui.matchPartial.checked = settings.matchModes.partial;
  ui.matchAnd.checked = settings.matchModes.and;
  ui.matchFuzzy.checked = settings.matchModes.fuzzy;
  ui.kindTabs.querySelectorAll('[data-kind]').forEach((button) => {
    const active = button.dataset.kind === settings.activeKind;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function renderBookManager() {
  ui.bookManager.replaceChildren();
  if (!importedBooks.length) {
    ui.bookManager.append(node('div', 'emptyCard', '登録済みの書籍はありません。'));
    return;
  }
  importedBooks.slice().sort((a, b) => a.book.title.localeCompare(b.book.title, 'ja')).forEach((book) => {
    const row = node('div', 'bookRow');
    const main = node('div');
    const counts = countsForBook(book);
    const record = bookCacheRecord(book);
    main.append(node('div', 'bookTitle', book.book.title));
    const syncState = record && record.pendingAction ? ' · 同期待ち' : '';
    main.append(node('div', 'bookMeta', `${(book.book.subjects || []).join('・') || '科目未設定'} · 事項${counts.matter} / 判例${counts.case} / 条文${counts.statute}${syncState}`));
    const actions = node('div', 'bookActions');
    const remove = node('button', 'smallBtn danger', '削除');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteBook(book));
    actions.append(remove);
    row.append(main, actions);
    ui.bookManager.append(row);
  });
}

async function deleteBook(book) {
  if (!confirm(`「${book.book.title}」を削除しますか？\n他の端末にも削除が同期されます。`)) return;
  const record = bookCacheRecord(book);
  if (!record) {
    setStatus('この書籍の暗号化キャッシュが見つかりません。', 'error');
    return;
  }
  await cache.put({ ...record, pendingAction: 'delete' });
  await loadBooksFromCache({ preserveStatus: true });
  setStatus(`「${book.book.title}」を削除しました。${navigator.onLine ? '同期しています…' : 'オンライン時に同期します。'}`, 'ok');
  if (navigator.onLine) syncCloud();
}

function renderImportPreview() {
  ui.importPreview.replaceChildren();
  let eligible = 0;
  importRows.forEach((item, index) => {
    const box = node('div', 'previewRow');
    box.dataset.invalid = item.ok ? 'false' : 'true';
    box.append(node('div', 'previewTitle', item.ok ? item.book.book.title : item.fileName));
    if (!item.ok) {
      box.append(node('div', 'previewMeta', item.error));
      ui.importPreview.append(box);
      return;
    }
    eligible += 1;
    const counts = countsForBook(item.book);
    box.append(node('div', 'previewMeta', `${item.fileName} · 事項${counts.matter} / 判例${counts.case} / 条文${counts.statute}`));
    const controls = node('div', 'previewControls');
    const subjects = document.createElement('input');
    subjects.type = 'text';
    subjects.value = item.subjectText;
    subjects.placeholder = '科目（例：民法、民事訴訟法）';
    subjects.setAttribute('aria-label', `${item.book.book.title}の科目`);
    subjects.addEventListener('input', () => { importRows[index].subjectText = subjects.value; });

    const action = document.createElement('select');
    const addOption = document.createElement('option');
    addOption.value = 'new-book'; addOption.textContent = '新規追加';
    const replaceOption = document.createElement('option');
    replaceOption.value = 'replace-book'; replaceOption.textContent = '既存書籍を置換';
    action.append(addOption, replaceOption);
    action.value = item.action;
    action.addEventListener('change', () => {
      importRows[index].action = action.value;
      renderImportPreview();
    });
    controls.append(subjects, action);

    if (item.action === 'replace-book') {
      const replace = document.createElement('select');
      replace.className = 'replaceSelect';
      replace.dataset.field = 'existingBookId';
      const placeholder = document.createElement('option');
      placeholder.value = ''; placeholder.textContent = '置換する書籍を選択';
      replace.append(placeholder);
      importedBooks.slice().sort((a, b) => a.book.title.localeCompare(b.book.title, 'ja')).forEach((book) => {
        const option = document.createElement('option');
        option.value = book.bookId; option.textContent = book.book.title;
        replace.append(option);
      });
      replace.value = item.existingBookId || '';
      replace.disabled = !importedBooks.length;
      replace.addEventListener('change', () => { importRows[index].existingBookId = replace.value; });
      controls.append(replace);
    }
    box.append(controls);
    ui.importPreview.append(box);
  });
  ui.commitImport.disabled = eligible === 0;
}

async function handleFiles(files) {
  const selected = [...files];
  importRows = await Promise.all(selected.map(async (file) => {
    try {
      const raw = JSON.parse(await file.text());
      const validated = Schema.validateBookFile(raw, { fileName: file.name });
      if (!validated.ok) return { fileName: file.name, ok: false, error: validated.error };
      return {
        fileName: file.name,
        ok: true,
        book: validated.book,
        subjectText: validated.book.book.subjects.join('、'),
        action: 'new-book',
        existingBookId: ''
      };
    } catch (error) {
      return { fileName: file.name, ok: false, error: `${file.name}: JSONを解析できません (${error && error.message ? error.message : '形式エラー'})` };
    }
  }));
  renderImportPreview();
}

async function mapWithConcurrency(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAX_IMPORT_CONCURRENCY, Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try { output[index] = { ok: true, value: await worker(items[index], index) }; }
      catch (error) { output[index] = { ok: false, error }; }
    }
  });
  await Promise.all(workers);
  return output;
}

async function stageImport(item) {
  const normalized = JSON.parse(JSON.stringify(item.book));
  normalized.book.subjects = subjectsFromText(item.subjectText);
  let bookId;
  let chunkId;
  let revision = 0;
  let updatedAt = null;

  if (item.action === 'replace-book') {
    const existing = booksById.get(item.existingBookId);
    if (!existing) throw new Error('置換対象の書籍を選択してください。');
    const record = cacheRecords.get(existing.chunkId);
    if (!record || record.deletedAt || record.pendingAction === 'delete') throw new Error('置換対象の同期状態を確認できません。');
    bookId = existing.bookId;
    chunkId = existing.chunkId;
    revision = record.revision;
    updatedAt = record.updatedAt;
  } else {
    bookId = crypto.randomUUID();
    chunkId = crypto.randomUUID();
  }

  const chunk = Schema.createIndexBookChunk(normalized, { bookId, chunkId });
  const payload = await ChunkCrypto.encryptChunk(activeVault.rawKey, chunkId, chunk);
  await cache.put({ chunkId, revision, updatedAt, deletedAt: null, payload, pendingAction: 'upsert' });
  return chunk;
}

async function commitImport() {
  const valid = importRows.filter((row) => row.ok);
  if (!valid.length) return;
  const replaceTargets = new Set();
  for (const item of valid) {
    if (item.action !== 'replace-book') continue;
    if (!item.existingBookId) {
      setStatus(`${item.book.book.title}: 置換対象の書籍を選択してください。`, 'error');
      return;
    }
    if (replaceTargets.has(item.existingBookId)) {
      setStatus('同じ既存書籍を1回の一括処理で複数回置換することはできません。', 'error');
      return;
    }
    replaceTargets.add(item.existingBookId);
  }

  ui.commitImport.disabled = true;
  setStatus(`${valid.length}冊を暗号化して登録しています…`);
  const outcomes = await mapWithConcurrency(valid, stageImport);
  const failures = outcomes.map((outcome, index) => ({ outcome, item: valid[index] })).filter(({ outcome }) => !outcome.ok);
  await loadBooksFromCache({ preserveStatus: true });
  if (failures.length) {
    setStatus(`${valid.length - failures.length}冊を登録、${failures.length}冊でエラー: ${failures[0].outcome.error.message || failures[0].outcome.error}`, 'warn');
  } else {
    setStatus(`${valid.length}冊を端末へ暗号化保存しました。${navigator.onLine ? 'クラウドへ同期しています…' : 'オンライン時に同期します。'}`, 'ok');
    importRows = [];
    ui.files.value = '';
    renderImportPreview();
  }
  ui.commitImport.disabled = importRows.filter((row) => row.ok).length === 0;
  if (navigator.onLine) await syncCloud();
}

async function syncCloud() {
  if (cloudSyncRunning || !cache || !navigator.onLine) return;
  cloudSyncRunning = true;
  setStatus('索引を同期しています…');
  try {
    const result = await ChunkSync.syncCache({ vault: Vault, cache });
    await loadBooksFromCache({ preserveStatus: true });
    if (result.conflicts.length) {
      const names = result.conflicts.map((item) => {
        const book = importedBooks.find((candidate) => candidate.chunkId === item.chunkId);
        return book ? book.book.title : item.chunkId;
      });
      setStatus(`同期競合があります: ${names.slice(0, 3).join('、')}。ローカル変更は保持しています。`, 'warn');
    } else if (result.errors.length) {
      setStatus(`索引は端末で利用できます。クラウド同期で${result.errors.length}件のエラーがありました。`, 'warn');
    } else {
      setStatus(`同期済み · ${importedBooks.length}冊`, 'ok');
    }
  } catch (error) {
    setStatus(`索引は端末で利用できます。クラウド同期: ${error && error.message ? error.message : '失敗'}`, 'warn');
  } finally {
    cloudSyncRunning = false;
  }
}

function bindControls() {
  ui.query.addEventListener('input', scheduleSearch);
  ui.kindTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-kind]');
    if (!button) return;
    settings.activeKind = button.dataset.kind;
    syncSettingsControls();
    scheduleSettingsSync();
    resultLimit = INITIAL_RESULT_LIMIT;
    renderSearch();
  });
  const modeBindings = [
    [ui.matchExact, 'exact'], [ui.matchPartial, 'partial'], [ui.matchAnd, 'and'], [ui.matchFuzzy, 'fuzzy']
  ];
  modeBindings.forEach(([input, key]) => input.addEventListener('change', () => {
    settings.matchModes[key] = input.checked;
    scheduleSettingsSync();
    resultLimit = INITIAL_RESULT_LIMIT;
    renderSearch();
  }));
  ui.openImport.addEventListener('click', () => showPanel(ui.importPanel));
  ui.openSettings.addEventListener('click', () => showPanel(ui.settingsPanel));
  ui.openBooks.addEventListener('click', () => { renderBookManager(); showPanel(ui.booksPanel); });
  document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
  ui.files.addEventListener('change', () => handleFiles(ui.files.files));
  ui.commitImport.addEventListener('click', commitImport);
  window.addEventListener('online', () => { saveSettingsToVault(); syncCloud(); });
  window.addEventListener('offline', () => setStatus(`オフライン · ${importedBooks.length}冊を端末内で検索できます`, 'warn'));
}

async function boot() {
  setTheme();
  session = Vault && Vault.loadSession();
  if (!session || !session.user || !session.user.id) {
    window.location.replace('index.html');
    return;
  }
  activeVault = Vault.loadActive();
  if (!activeVault || !activeVault.rawKey) {
    window.location.replace('sync.html');
    return;
  }
  settings = loadSettings();
  syncSettingsControls();
  bindControls();
  try {
    cache = await ChunkCache.createCache({ dbName: `${ChunkCache.DB_NAME}:${session.user.id}` });
    await loadBooksFromCache();
    document.documentElement.classList.remove('auth-pending');
    if (navigator.onLine) syncCloud();
    else setStatus(`オフライン · ${importedBooks.length}冊を端末内で検索できます`, 'warn');
  } catch (error) {
    document.documentElement.classList.remove('auth-pending');
    setStatus(`索引キャッシュを開けませんでした: ${error && error.message ? error.message : '不明なエラー'}`, 'error');
  }
}

window.IndexSearchPage = {
  getBooks: () => importedBooks.slice(),
  reload: () => loadBooksFromCache(),
  sync: syncCloud,
  cacheDbNameForUser: (userId) => `${ChunkCache.DB_NAME}:${userId}`
};

boot();
})();
