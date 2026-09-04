(()=>{
'use strict';

const MAX_IMPORT_CONCURRENCY = 4;
const SEARCH_DEBOUNCE_MS = 120;
const SETTINGS_SYNC_DELAY_MS = 900;
const INITIAL_RESULT_LIMIT = 100;
const RESULT_LIMIT_STEP = 100;
const CLEANUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const Schema = window.LegalIndexSchema;
const Search = window.LegalIndexSearch;
const ChunkCrypto = window.EncryptedChunkCrypto;
const ChunkCache = window.EncryptedChunkCache;
const ChunkSync = window.EncryptedChunkSync;
const ConflictOps = window.IndexSearchConflicts;
const SyncStatus = window.IndexSearchSyncStatus;
const IndexConversionPrompt = window.IndexConversionPrompt;
const IndexSearchWorkerClient = window.IndexSearchWorkerClient;
const VaultPayload = window.MangaVaultPayload;
const Vault = window.MangaVault;

const $ = (id) => document.getElementById(id);
const ui = {
  query: $('indexQuery'), kindTabs: $('kindTabs'), subjectFilters: $('subjectFilters'), bookFilters: $('bookFilters'),
  subjectFilterCount: $('subjectFilterCount'), bookFilterCount: $('bookFilterCount'), results: $('searchResults'), status: $('indexStatus'),
  syncNowBtn: $('syncNowBtn'), syncSummary: $('syncSummary'), copyConversionPromptBtn: $('copyConversionPromptBtn'),
  conversionPromptPanel: $('conversionPromptPanel'), conversionPromptText: $('conversionPromptText'), conflictPanel: $('conflictPanel'), conflictList: $('conflictList'),
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
let searchExecutor = null;
let retryController = null;
let conflictMap = new Map();
let errorMap = new Map();
let syncingIds = new Set();
let importRows = [];
let searchTimer = null;
let settingsSyncTimer = null;
let resultLimit = INITIAL_RESULT_LIMIT;
let lastSearchSignature = '';
let searchRenderToken = 0;

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

function setSummary(message, tone = '') {
  ui.syncSummary.textContent = message || '';
  if (tone) ui.syncSummary.dataset.tone = tone;
  else delete ui.syncSummary.dataset.tone;
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

function panelCandidates() {
  return [ui.importPanel, ui.settingsPanel, ui.booksPanel, ui.conversionPromptPanel, ui.conflictPanel];
}

function showPanel(panel) {
  for (const candidate of panelCandidates()) candidate.hidden = candidate !== panel || !candidate.hidden;
  if (panel && !panel.hidden) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function closePanels() {
  for (const candidate of panelCandidates()) candidate.hidden = true;
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

function statusLabel(state) {
  return ({ synced: '同期済み', pending: '同期待ち', syncing: '同期中', conflict: '競合', error: 'エラー', deleted: '削除済み' })[state] || state;
}

function statusForRecord(record) {
  return SyncStatus.deriveChunkStatus({ record, syncingIds, conflicts: conflictMap, errors: errorMap });
}

function renderSyncSummary() {
  if (!ui.syncSummary) return;
  const records = [...cacheRecords.values()];
  const statuses = records.map(statusForRecord);
  const aggregate = SyncStatus.aggregateStatus(statuses);
  if (conflictMap.size) {
    setSummary(`競合 ${conflictMap.size}件 · 解決が必要です`, 'error');
    return;
  }
  if (aggregate.counts.error || errorMap.has('__global__')) {
    setSummary(`同期エラー ${aggregate.counts.error + (errorMap.has('__global__') ? 1 : 0)}件 · 自動再試行します`, 'warn');
    return;
  }
  if (aggregate.counts.syncing) {
    setSummary(`同期中 · ${aggregate.counts.syncing}件`, 'warn');
    return;
  }
  if (aggregate.counts.pending) {
    setSummary(`同期待ち · ${aggregate.counts.pending}件`, 'warn');
    return;
  }
  setSummary(`同期済み · ${importedBooks.length}冊`, 'ok');
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
  if (searchExecutor) await searchExecutor.build(books);
  else searchIndex = Search.buildIndex(books);
  renderFilters();
  renderBookManager();
  renderSyncSummary();
  await renderSearch();
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
    label.append(input, node('span', '', value.label));
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

async function renderSearch() {
  if (!ui.results) return;
  const token = ++searchRenderToken;
  ui.results.replaceChildren();
  const query = ui.query.value.trim();
  if (!query) {
    renderEmpty(importedBooks.length ? '検索語を入力してください' : '索引がまだ登録されていません', importedBooks.length ? `${importedBooks.length}冊の索引を検索できます。` : '「JSONを読み込む」から、AIで変換した索引JSONを登録してください。');
    return;
  }
  const filters = effectiveFilters();
  const options = { kind: settings.activeKind, subjectIds: filters.subjectIds, bookIds: filters.bookIds, matchModes: settings.matchModes };
  const signature = [query, settings.activeKind, filters.subjectIds.join('|'), filters.bookIds.join('|'), JSON.stringify(settings.matchModes)].join('::');
  if (signature !== lastSearchSignature) {
    lastSearchSignature = signature;
    resultLimit = INITIAL_RESULT_LIMIT;
  }
  let response;
  try {
    response = searchExecutor ? await searchExecutor.search(query, options) : { stale: false, results: Search.search(searchIndex, query, options) };
  } catch (error) {
    if (token !== searchRenderToken) return;
    renderEmpty('検索処理でエラーが発生しました', error && error.message ? error.message : '再入力してください。');
    return;
  }
  if (token !== searchRenderToken || response.stale) return;
  const results = response.results;
  ui.results.replaceChildren();
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
  searchTimer = setTimeout(renderSearch, SEARCH_DEBOUNCE_MS);
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
    const state = record ? statusForRecord(record) : 'error';
    main.append(node('div', 'bookTitle', book.book.title));
    main.append(node('div', 'bookMeta', `${(book.book.subjects || []).join('・') || '科目未設定'} · 事項${counts.matter} / 判例${counts.case} / 条文${counts.statute}`));
    const actions = node('div', 'bookActions');
    const badge = node('span', 'syncBadge', statusLabel(state));
    badge.dataset.state = state;
    const remove = node('button', 'smallBtn danger', '削除');
    remove.type = 'button';
    remove.addEventListener('click', () => deleteBook(book));
    actions.append(badge, remove);
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
    action.addEventListener('change', () => { importRows[index].action = action.value; renderImportPreview(); });
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
      return { fileName: file.name, ok: true, book: validated.book, subjectText: validated.book.book.subjects.join('、'), action: 'new-book', existingBookId: '' };
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
      const index = cursor++;
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

async function maybeCleanupTombstones() {
  if (!navigator.onLine || !session || !session.user) return;
  const key = `mangaReaderIndexCleanupAt:${session.user.id}`;
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < CLEANUP_INTERVAL_MS) return;
  try {
    await ChunkSync.cleanupRemoteTombstones(Vault, 90);
    localStorage.setItem(key, String(Date.now()));
  } catch (error) {
    console.warn('Index tombstone cleanup failed', error);
  }
}

function conflictTitle(conflict) {
  const book = importedBooks.find((candidate) => candidate.chunkId === conflict.chunkId);
  return book ? book.book.title : `索引データ ${String(conflict.chunkId).slice(0, 8)}`;
}

function comparisonSide(title, data) {
  const box = node('div', 'comparisonSide');
  box.append(node('div', 'conflictTitle', title));
  box.append(node('div', 'conflictMeta', `${data.title || '書名不明'} · ${(data.subjects || []).join('・') || '科目未設定'}`));
  box.append(node('div', 'conflictMeta', `事項${data.counts.matter} / 判例${data.counts.case} / 条文${data.counts.statute}`));
  return box;
}

async function resolveConflictAction(action, conflict, context) {
  try {
    if (action === 'cloud') {
      if (!context.remoteRow) throw new Error('クラウド側のデータは既に物理削除されています。');
      await ConflictOps.useCloudVersion({ cache, syncApi: ChunkSync, remoteRow: context.remoteRow });
    } else if (action === 'separate') {
      await ConflictOps.saveLocalAsSeparate({
        cache, cryptoApi: ChunkCrypto, masterKey: activeVault.rawKey,
        localBook: context.localBook, originalRemoteRow: context.remoteRow,
        randomUUID: crypto.randomUUID.bind(crypto)
      });
    } else if (action === 'discard') {
      await ConflictOps.discardMissingRemoteLocal({ cache, chunkId: conflict.chunkId });
    }
    conflictMap.delete(conflict.chunkId);
    errorMap.delete(conflict.chunkId);
    await loadBooksFromCache({ preserveStatus: true });
    renderConflicts();
    setStatus('競合を解決しました。同期を再開します。', 'ok');
    if (navigator.onLine) retryController?.requestNow();
  } catch (error) {
    setStatus(`競合を解決できませんでした: ${error && error.message ? error.message : '不明なエラー'}`, 'error');
  }
}

async function openConflictDetails(conflict, row, detailButton) {
  detailButton.disabled = true;
  detailButton.textContent = '確認中…';
  try {
    const localRecord = await cache.get(conflict.chunkId);
    if (!localRecord) throw new Error('ローカル暗号化データが見つかりません。');
    const localBook = await ChunkCrypto.decryptChunk(activeVault.rawKey, conflict.chunkId, localRecord.payload);
    const remoteRow = await ChunkSync.fetchRemoteChunk(Vault, conflict.chunkId);
    let remoteBook = null;
    if (remoteRow && !remoteRow.deletedAt) remoteBook = await ChunkCrypto.decryptChunk(activeVault.rawKey, conflict.chunkId, remoteRow.payload);
    const context = { localBook, remoteRow, remoteBook };
    row.querySelectorAll('[data-conflict-detail]').forEach((element) => element.remove());
    const detail = node('div');
    detail.dataset.conflictDetail = 'true';
    if (remoteRow && remoteRow.deletedAt) {
      detail.append(node('div', 'conflictMeta', 'クラウド側ではこの書籍が削除されています。ローカル変更を新しい書籍として救出できます。'));
    } else if (!remoteRow) {
      detail.append(node('div', 'conflictMeta', 'クラウド側の削除記録は保持期間を過ぎて物理削除されています。自動復活はしません。'));
    } else {
      const comparison = ConflictOps.compareBooks(localBook, remoteBook, Search, 100);
      const grid = node('div', 'comparisonGrid');
      grid.append(comparisonSide('ローカル版', comparison.local), comparisonSide('クラウド版', comparison.remote));
      detail.append(grid);
      detail.append(node('div', 'conflictMeta', `差分 ${comparison.totalChanged}件${comparison.totalChanged > comparison.changes.length ? `（先頭${comparison.changes.length}件を表示）` : ''}`));
      const changes = node('div', 'comparisonChanges');
      comparison.changes.forEach((change) => changes.append(node('div', 'comparisonChange', `${change.side === 'local' ? 'ローカルのみ' : 'クラウドのみ'} · ${kindLabel(change.kind)} · ${change.label} · p.${(change.pages || []).join(', ')}`)));
      detail.append(changes);
    }
    const actions = node('div', 'conflictActions');
    if (remoteRow) {
      const cloud = node('button', 'smallBtn', remoteRow.deletedAt ? 'クラウドの削除を採用' : 'クラウド版を採用');
      cloud.type = 'button';
      cloud.addEventListener('click', () => resolveConflictAction('cloud', conflict, context));
      actions.append(cloud);
    }
    const separate = node('button', 'smallBtn primary', 'ローカル版を別書籍として保存');
    separate.type = 'button';
    separate.addEventListener('click', () => resolveConflictAction('separate', conflict, context));
    actions.append(separate);
    if (!remoteRow) {
      const discard = node('button', 'smallBtn danger', 'ローカルも破棄');
      discard.type = 'button';
      discard.addEventListener('click', () => resolveConflictAction('discard', conflict, context));
      actions.append(discard);
    }
    detail.append(actions);
    row.append(detail);
    detailButton.textContent = '比較を更新';
  } catch (error) {
    setStatus(`競合内容を確認できませんでした: ${error && error.message ? error.message : '不明なエラー'}`, 'error');
    detailButton.textContent = '再試行';
  } finally {
    detailButton.disabled = false;
  }
}

function renderConflicts() {
  ui.conflictList.replaceChildren();
  if (!conflictMap.size) {
    ui.conflictPanel.hidden = true;
    return;
  }
  for (const conflict of conflictMap.values()) {
    const row = node('div', 'conflictRow');
    row.append(node('div', 'conflictTitle', conflictTitle(conflict)));
    row.append(node('div', 'conflictMeta', `理由: ${conflict.reason} · ローカルrev ${conflict.localRevision ?? '-'} / クラウドrev ${conflict.remoteRevision ?? '-'}`));
    const actions = node('div', 'conflictActions');
    const detail = node('button', 'smallBtn', '比較して解決');
    detail.type = 'button';
    detail.addEventListener('click', () => openConflictDetails(conflict, row, detail));
    actions.append(detail);
    row.append(actions);
    ui.conflictList.append(row);
  }
  ui.conflictPanel.hidden = false;
}

async function performSyncPass() {
  if (!cache || !navigator.onLine) return { conflicts: [], errors: [] };
  const pending = (await cache.list()).filter((record) => record.pendingAction).map((record) => record.chunkId);
  syncingIds = new Set(pending);
  renderBookManager();
  renderSyncSummary();
  setStatus('索引を同期しています…');
  try {
    const result = await ChunkSync.syncCache({ vault: Vault, cache });
    conflictMap = new Map((result.conflicts || []).map((item) => [item.chunkId, item]));
    errorMap = new Map((result.errors || []).filter((item) => item.chunkId).map((item) => [item.chunkId, item.error]));
    syncingIds.clear();
    await loadBooksFromCache({ preserveStatus: true });
    renderConflicts();
    if (result.conflicts.length) {
      setStatus(`同期競合が${result.conflicts.length}件あります。自動統合せず、ローカル変更を保持しています。`, 'warn');
      retryController?.recordFailure({ retryable: false, hasConflict: true });
    } else if (result.errors.length) {
      setStatus(`索引は端末で利用できます。クラウド同期で${result.errors.length}件のエラーがあり、自動再試行します。`, 'warn');
      retryController?.recordFailure({ retryable: true, hasConflict: false });
    } else {
      retryController?.recordSuccess();
      setStatus(`同期済み · ${importedBooks.length}冊`, 'ok');
      await maybeCleanupTombstones();
    }
    renderSyncSummary();
    return result;
  } catch (error) {
    syncingIds.clear();
    errorMap.set('__global__', error);
    renderBookManager();
    renderSyncSummary();
    setStatus(`索引は端末で利用できます。クラウド同期: ${error && error.message ? error.message : '失敗'}。自動再試行します。`, 'warn');
    retryController?.recordFailure({ retryable: true, hasConflict: false });
    return { conflicts: [], errors: [{ chunkId: null, error }] };
  }
}

async function syncCloud() {
  if (!navigator.onLine) return;
  if (retryController) return retryController.requestNow();
  return performSyncPass();
}

async function copyConversionPrompt() {
  const prompt = IndexConversionPrompt.buildPrompt();
  ui.conversionPromptText.value = prompt;
  try {
    await navigator.clipboard.writeText(prompt);
    setStatus('AI変換用プロンプトをコピーしました。', 'ok');
  } catch (_) {
    ui.conversionPromptPanel.hidden = false;
    setStatus('自動コピーできないため、下のプロンプトを手動でコピーしてください。', 'warn');
    ui.conversionPromptText.focus();
    ui.conversionPromptText.select();
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
  [[ui.matchExact, 'exact'], [ui.matchPartial, 'partial'], [ui.matchAnd, 'and'], [ui.matchFuzzy, 'fuzzy']].forEach(([input, key]) => input.addEventListener('change', () => {
    settings.matchModes[key] = input.checked;
    scheduleSettingsSync();
    resultLimit = INITIAL_RESULT_LIMIT;
    renderSearch();
  }));
  ui.openImport.addEventListener('click', () => showPanel(ui.importPanel));
  ui.openSettings.addEventListener('click', () => showPanel(ui.settingsPanel));
  ui.openBooks.addEventListener('click', () => { renderBookManager(); showPanel(ui.booksPanel); });
  ui.syncNowBtn.addEventListener('click', () => retryController?.requestNow());
  ui.copyConversionPromptBtn.addEventListener('click', copyConversionPrompt);
  document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
  ui.files.addEventListener('change', () => handleFiles(ui.files.files));
  ui.commitImport.addEventListener('click', commitImport);
  window.addEventListener('online', () => { saveSettingsToVault(); retryController?.onOnline(); });
  window.addEventListener('offline', () => { retryController?.onOffline(); setStatus(`オフライン · ${importedBooks.length}冊を端末内で検索できます`, 'warn'); renderSyncSummary(); });
  window.addEventListener('pagehide', () => { retryController?.dispose(); searchExecutor?.dispose(); });
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
  searchExecutor = IndexSearchWorkerClient.createSearchExecutor({
    WorkerCtor: window.Worker,
    workerUrl: 'legal-index-search-worker.js',
    directApi: Search,
    onDiagnostic: (error) => console.warn('Legal index Worker unavailable; using direct search', error)
  });
  retryController = SyncStatus.createRetryController({ run: performSyncPass, isOnline: () => navigator.onLine });
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
