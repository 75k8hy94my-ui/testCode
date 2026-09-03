(()=>{
'use strict';
const SETTINGS_KEY = 'mangaReaderIndexSearchSettings';
const SEARCH_DELAY_MS = 100;
const SETTINGS_SYNC_DELAY_MS = 900;
const KIND_LABELS = { matter: '事項', case: '判例', statute: '条文' };
const $ = (id) => document.getElementById(id);
const ui = {
  query: $('indexQuery'), status: $('indexStatus'), results: $('indexResults'), subjects: $('subjectFilter'), books: $('bookFilter'),
  settingsBtn: $('indexSettingsBtn'), manageBtn: $('indexManageBtn'), settingsPanel: $('indexSettingsPanel'), managePanel: $('indexManagePanel'),
  exact: $('matchExact'), partial: $('matchPartial'), and: $('matchAnd'), fuzzy: $('matchFuzzy'),
  files: $('indexImportFiles'), preview: $('indexImportPreview'), commit: $('indexImportCommit'), bookList: $('indexBookList')
};
const tabs = Array.from(document.querySelectorAll('[data-kind]'));
const state = { books: [], searchIndex: [], settings: null, importRows: [], searchTimer: null, settingsTimer: null, syncing: false };

function defaultSettings() {
  return { matchModes: { exact: true, partial: true, and: true, fuzzy: true }, activeKind: 'all', selectedSubjects: [], selectedBookIds: [] };
}
function readSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    return MangaVaultPayload.normalize({ indexSearchSettings: raw }).indexSearchSettings;
  } catch (_) { return defaultSettings(); }
}
function setStatus(message) { ui.status.textContent = message || ''; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function currentVault() {
  const active = MangaVault.loadActive();
  if (!active || !active.rawKey) throw new Error('保管庫を開いてください。');
  return active;
}
function selectedValues(select) { return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean); }
function parseSubjects(value) {
  const seen = new Set();
  return String(value || '').split(/[,、，]/).map((item) => item.trim()).filter((item) => item && !seen.has(item) && seen.add(item));
}
function uuid() {
  if (!crypto.randomUUID) throw new Error('このブラウザでは書籍IDを安全に作成できません。');
  return crypto.randomUUID();
}
function bookCounts(book) {
  return { matter: book.matterEntries?.length || 0, case: book.caseEntries?.length || 0, statute: book.statuteEntries?.length || 0 };
}
function availableFilters() {
  const bookIds = new Set(state.books.map((book) => book.bookId));
  const subjects = new Set(state.books.flatMap((book) => book.book.subjects || []));
  return {
    bookIds: state.settings.selectedBookIds.filter((id) => bookIds.has(id)),
    subjects: state.settings.selectedSubjects.filter((subject) => subjects.has(subject))
  };
}
function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  scheduleSettingsSync();
}
function scheduleSettingsSync() {
  clearTimeout(state.settingsTimer);
  state.settingsTimer = setTimeout(async () => {
    if (!navigator.onLine) return;
    try { await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage()); }
    catch (error) { setStatus(`検索設定は端末に保存済みです。クラウド同期: ${error?.message || '失敗'}`); }
  }, SETTINGS_SYNC_DELAY_MS);
}
function renderTabs() {
  tabs.forEach((button) => button.setAttribute('aria-selected', String(button.dataset.kind === state.settings.activeKind)));
}
function replaceOptions(select, entries, selected) {
  select.replaceChildren();
  entries.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = label; option.selected = selected.includes(value); select.append(option);
  });
}
function renderFilters() {
  const subjects = Array.from(new Set(state.books.flatMap((book) => book.book.subjects || []))).sort((a,b)=>a.localeCompare(b,'ja'));
  const books = state.books.slice().sort((a,b)=>a.book.title.localeCompare(b.book.title,'ja'));
  replaceOptions(ui.subjects, subjects.map((subject)=>({ value:subject, label:subject })), state.settings.selectedSubjects);
  replaceOptions(ui.books, books.map((book)=>({ value:book.bookId, label:book.book.title })), state.settings.selectedBookIds);
}
function renderSettings() {
  ui.exact.checked = !!state.settings.matchModes.exact;
  ui.partial.checked = !!state.settings.matchModes.partial;
  ui.and.checked = !!state.settings.matchModes.and;
  ui.fuzzy.checked = !!state.settings.matchModes.fuzzy;
  renderTabs();
}
function resultNode(result) {
  const article = document.createElement('article'); article.className = 'result';
  const title = document.createElement('div'); title.className = 'resultTitle'; title.textContent = result.display;
  const type = document.createElement('span'); type.className = 'resultType'; type.textContent = KIND_LABELS[result.kind] || result.kind;
  title.append(type); article.append(title);
  result.sources.forEach((source) => {
    const row = document.createElement('div'); row.className = 'source';
    const name = document.createElement('span'); name.className = 'sourceBook'; name.textContent = source.bookTitle;
    const pages = document.createElement('span'); pages.textContent = `p. ${source.pages.join(', ')}`;
    row.append(name, pages); article.append(row);
  });
  return article;
}
function renderSearch() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    const query = ui.query.value.trim();
    if (!query) { ui.results.innerHTML = '<div class="empty">検索語を入力してください。</div>'; return; }
    const filters = availableFilters();
    const results = LegalIndexSearch.search(state.searchIndex, query, {
      kind: state.settings.activeKind,
      subjectIds: filters.subjects,
      bookIds: filters.bookIds,
      matchModes: state.settings.matchModes
    });
    ui.results.replaceChildren();
    if (!results.length) { const empty = document.createElement('div'); empty.className='empty'; empty.textContent='一致する索引はありません。'; ui.results.append(empty); return; }
    const fragment = document.createDocumentFragment(); results.slice(0, 500).forEach((result)=>fragment.append(resultNode(result))); ui.results.append(fragment);
    if (results.length > 500) { const note=document.createElement('div'); note.className='empty'; note.textContent=`${results.length}件中500件を表示しています。絞り込みを使うと探しやすくなります。`; ui.results.append(note); }
  }, SEARCH_DELAY_MS);
}
function renderBookList() {
  ui.bookList.replaceChildren();
  if (!state.books.length) { const empty=document.createElement('div'); empty.className='empty'; empty.textContent='登録済みの書籍はありません。'; ui.bookList.append(empty); return; }
  state.books.slice().sort((a,b)=>a.book.title.localeCompare(b.book.title,'ja')).forEach((book) => {
    const card=document.createElement('div'); card.className='bookCard';
    const top=document.createElement('div'); top.className='bookTop';
    const info=document.createElement('div'); const title=document.createElement('div'); title.className='bookTitle'; title.textContent=book.book.title;
    const counts=bookCounts(book); const meta=document.createElement('div'); meta.className='meta'; meta.textContent=`${(book.book.subjects||[]).join(' / ') || '科目未設定'} · 事項 ${counts.matter} · 判例 ${counts.case} · 条文 ${counts.statute}`;
    info.append(title,meta); const badge=document.createElement('span'); badge.className='badge'; badge.textContent=`rev ${book.revision || 0}`; top.append(info,badge); card.append(top);
    const actions=document.createElement('div'); actions.className='manageActions'; const remove=document.createElement('button'); remove.type='button'; remove.className='dangerBtn'; remove.textContent='削除'; remove.addEventListener('click',()=>deleteBook(book)); actions.append(remove); card.append(actions); ui.bookList.append(card);
  });
}
function renderAll() { renderFilters(); renderSettings(); renderBookList(); renderSearch(); }

async function decryptCachedBook(row, rawKey) {
  if (!row || row.deletedAt || !row.payload) return null;
  const data = await EncryptedChunkCrypto.decryptChunk(rawKey, row.chunkId, row.payload);
  if (!data || data.type !== 'index-book' || data.version !== 1 || data.chunkId !== row.chunkId || !data.bookId) throw new Error('索引チャンクの内容が正しくありません。');
  const normalized = LegalIndexSchema.normalizeBook(data);
  return { ...data, ...normalized, revision:Number(row.revision || 0), updatedAt:row.updatedAt || null };
}
async function reloadFromCache() {
  const rawKey = currentVault().rawKey;
  const rows = await EncryptedChunkCache.list();
  const books=[]; let unreadable=0;
  for (const row of rows) {
    try { const book=await decryptCachedBook(row,rawKey); if(book) books.push(book); }
    catch (_) { unreadable += 1; }
  }
  state.books=books; state.searchIndex=LegalIndexSearch.buildIndex(books); renderAll();
  if (unreadable) setStatus(`${unreadable}件の暗号化索引をこの保管庫では開けませんでした。`);
}
async function syncRemote() {
  if (state.syncing || !navigator.onLine) return;
  state.syncing=true; setStatus('索引を同期しています…');
  try {
    const result=await EncryptedChunkSync.sync(EncryptedChunkCache,{upload:true});
    await reloadFromCache();
    if (result.conflicts.length) setStatus(`${result.conflicts.length}冊で端末間の更新競合があります。ローカル変更は保持しています。`);
    else if (result.failures.length) setStatus(`${result.failures.length}冊を同期できませんでした。端末には保存されています。`);
    else setStatus('索引は最新です。');
  } catch(error) { setStatus(`オフライン検索は利用できます。クラウド同期: ${error?.message || '失敗'}`); }
  finally { state.syncing=false; }
}

function renderImportPreview() {
  ui.preview.replaceChildren(); let actionable=0;
  state.importRows.forEach((row,index) => {
    const card=document.createElement('div'); card.className='previewCard';
    const top=document.createElement('div'); top.className='previewTop'; const info=document.createElement('div');
    const title=document.createElement('div'); title.className='previewTitle'; title.textContent=row.valid ? row.book.book.title : row.fileName;
    const meta=document.createElement('div'); meta.className='meta'; meta.textContent=row.valid ? `${row.fileName} · 事項 ${row.book.matterEntries.length} · 判例 ${row.book.caseEntries.length} · 条文 ${row.book.statuteEntries.length}` : row.fileName;
    info.append(title,meta); top.append(info); card.append(top);
    if (!row.valid) { const error=document.createElement('div'); error.className='previewError'; error.textContent=row.error; card.append(error); ui.preview.append(card); return; }
    const controls=document.createElement('div'); controls.className='previewControls';
    const subject=document.createElement('input'); subject.type='text'; subject.value=row.subjectsText; subject.placeholder='科目（カンマ区切り）'; subject.setAttribute('aria-label',`${row.book.book.title} の科目`); subject.addEventListener('input',()=>{row.subjectsText=subject.value;});
    const action=document.createElement('select'); action.setAttribute('aria-label',`${row.book.book.title} の取込方法`);
    const blank=document.createElement('option'); blank.value=''; blank.textContent='処理を選択…'; action.append(blank);
    const add=document.createElement('option'); add.value='new'; add.textContent='新規追加'; action.append(add);
    state.books.slice().sort((a,b)=>a.book.title.localeCompare(b.book.title,'ja')).forEach((book)=>{const option=document.createElement('option'); option.value=`replace:${book.chunkId}`; option.textContent=`既存書籍を置換: ${book.book.title}`; action.append(option);});
    action.value=row.action || ''; action.addEventListener('change',()=>{row.action=action.value;renderImportCommitState();});
    controls.append(subject,action); card.append(controls); ui.preview.append(card); if(row.action) actionable += 1;
  });
  ui.commit.disabled = actionable===0;
}
function renderImportCommitState(){ui.commit.disabled=!state.importRows.some((row)=>row.valid&&row.action);}
async function parseSelectedFiles() {
  const files=Array.from(ui.files.files || []); state.importRows=[];
  for (const file of files) {
    try {
      const parsed=JSON.parse(await file.text()); const result=LegalIndexSchema.validateBookFile(parsed,{fileName:file.name});
      if (!result.ok) state.importRows.push({fileName:file.name,valid:false,error:result.error});
      else state.importRows.push({fileName:file.name,valid:true,book:result.book,subjectsText:result.book.book.subjects.join(', '),action:''});
    } catch(error) { state.importRows.push({fileName:file.name,valid:false,error:`${file.name}: JSONを読み込めません (${error?.message || 'parse error'})`}); }
  }
  renderImportPreview();
}
async function commitImport() {
  const targets=state.importRows.filter((row)=>row.valid&&row.action); if(!targets.length)return;
  ui.commit.disabled=true; setStatus(`${targets.length}冊を端末へ暗号化保存しています…`); const rawKey=currentVault().rawKey;
  const failures=[];
  await EncryptedChunkSync.mapLimit(targets,4,async(row)=>{
    try {
      const normalized=clone(row.book); normalized.book.subjects=parseSubjects(row.subjectsText);
      if(row.action==='new'){
        const bookId=uuid(),chunkId=uuid(); const chunk=LegalIndexSchema.createIndexBookChunk(normalized,{bookId,chunkId}); const payload=await EncryptedChunkCrypto.encryptChunk(rawKey,chunkId,chunk);
        await EncryptedChunkCache.put({chunkId,revision:0,deletedAt:null,updatedAt:new Date().toISOString(),payload,pendingAction:'insert',baseRevision:null});
      } else {
        const chunkId=row.action.slice('replace:'.length); const target=state.books.find((book)=>book.chunkId===chunkId); if(!target)throw new Error('置換対象の書籍が見つかりません。');
        const cached=await EncryptedChunkCache.get(chunkId); if(!cached)throw new Error('置換対象の暗号化データがありません。');
        const chunk=LegalIndexSchema.createIndexBookChunk(normalized,{bookId:target.bookId,chunkId}); const payload=await EncryptedChunkCrypto.encryptChunk(rawKey,chunkId,chunk);
        await EncryptedChunkCache.put({chunkId,revision:cached.revision,deletedAt:null,updatedAt:new Date().toISOString(),payload,pendingAction:'replace',baseRevision:cached.revision});
      }
      row.done=true;
    } catch(error){failures.push({row,error:error?.message||String(error)});}
  });
  await reloadFromCache(); state.importRows=state.importRows.filter((row)=>!row.done); renderImportPreview();
  if(failures.length)setStatus(`${failures.length}冊は取り込めませんでした。その他は端末に保存済みです。`); else setStatus(`${targets.length}冊を端末に保存しました。`);
  if(navigator.onLine)await syncRemote();
}
async function deleteBook(book) {
  if(!confirm(`「${book.book.title}」を削除しますか？`))return;
  const cached=await EncryptedChunkCache.get(book.chunkId); if(!cached)return;
  if(cached.pendingAction==='insert'&&Number(cached.revision||0)===0){await EncryptedChunkCache.remove(book.chunkId);}
  else await EncryptedChunkCache.put({...cached,deletedAt:new Date().toISOString(),pendingAction:'delete',baseRevision:Number(cached.baseRevision ?? cached.revision)});
  await reloadFromCache(); setStatus('書籍を端末から削除しました。'); if(navigator.onLine)await syncRemote();
}

function bind() {
  ui.query.addEventListener('input',renderSearch);
  tabs.forEach((button)=>button.addEventListener('click',()=>{state.settings.activeKind=button.dataset.kind;renderTabs();persistSettings();renderSearch();}));
  ui.subjects.addEventListener('change',()=>{state.settings.selectedSubjects=selectedValues(ui.subjects);persistSettings();renderSearch();});
  ui.books.addEventListener('change',()=>{state.settings.selectedBookIds=selectedValues(ui.books);persistSettings();renderSearch();});
  for(const [key,input] of [['exact',ui.exact],['partial',ui.partial],['and',ui.and],['fuzzy',ui.fuzzy]]) input.addEventListener('change',()=>{state.settings.matchModes[key]=input.checked;persistSettings();renderSearch();});
  ui.settingsBtn.addEventListener('click',()=>{ui.settingsPanel.classList.toggle('hidden');ui.managePanel.classList.add('hidden');});
  ui.manageBtn.addEventListener('click',()=>{ui.managePanel.classList.toggle('hidden');ui.settingsPanel.classList.add('hidden');renderBookList();});
  document.querySelectorAll('[data-close-panel]').forEach((button)=>button.addEventListener('click',()=>button.closest('.panel').classList.add('hidden')));
  ui.files.addEventListener('change',parseSelectedFiles); ui.commit.addEventListener('click',commitImport);
  window.addEventListener('online',syncRemote);
  window.addEventListener('pagehide',()=>{state.books=[];state.searchIndex=[];});
}
async function start() {
  try{const theme=localStorage.getItem('mangaReaderTheme');document.documentElement.dataset.theme=theme==='light'?'light':'dark';}catch(_){document.documentElement.dataset.theme='dark';}
  const session=MangaVault.loadSession(); if(!session||!session.refresh_token){window.location.replace('index.html');return;}
  if(!MangaVault.loadActive()){window.location.replace('sync.html');return;}
  state.settings=readSettings(); bind(); document.documentElement.classList.remove('auth-pending');
  try{await reloadFromCache();}catch(error){setStatus(error?.message||'索引キャッシュを開けませんでした。');}
  if(navigator.onLine)syncRemote();
}
window.LegalIndexApp={start,reloadFromCache,exportBooks:()=>state.books.map((book)=>({schemaVersion:book.schemaVersion,book:clone(book.book),matterEntries:clone(book.matterEntries),caseEntries:clone(book.caseEntries),statuteEntries:clone(book.statuteEntries)}))};
start();
})();
