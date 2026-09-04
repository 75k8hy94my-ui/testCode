(()=>{
'use strict';
const config=window.MANGA_READER_SUPABASE||{};
const showLogin=()=>window.location.replace('index.html');
const showVault=()=>window.location.replace('sync.html');
const session=window.MangaVault&&MangaVault.loadSession();
if(!session||!session.refresh_token||!config.url||!config.publishableKey){showLogin();return;}
if(!MangaVault.loadActive()){showVault();return;}

try{const theme=localStorage.getItem('mangaReaderTheme');document.documentElement.dataset.theme=theme==='light'?'light':'dark';}catch(_){document.documentElement.dataset.theme='dark';}

const $=(id)=>document.getElementById(id);
const ui={tabs:$('lawTabs'),search:$('articleSearch'),refresh:$('refreshLawBtn'),meta:$('dataMeta'),state:$('readerState'),list:$('articleList'),detail:$('articleDetail'),detailTitle:$('detailTitle'),detailCaption:$('detailCaption'),text:$('articleText'),back:$('backToListBtn'),prev:$('prevArticleBtn'),next:$('nextArticleBtn'),pane:$('notePane'),memo:$('statuteMemo'),memoContext:$('memoContext'),memoClose:$('memoCloseBtn'),sync:$('syncStatus')};
const Statutes=window.MangaStatutes;
const NOTES_KEY='mangaReaderStatuteNotes';
let selectedLawId=Statutes.LAW_CATALOG[0].id;
let lawRecord=null;
let filtered=[];
let selectedArticle=null;
let loadToken=0;
let memoTimer=null;
let syncTimer=null;
let syncRunning=false;
let syncDirty=false;

function isMobile(){return window.matchMedia&&window.matchMedia('(max-width:780px)').matches;}
function readNotes(){try{const parsed=JSON.parse(localStorage.getItem(NOTES_KEY)||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch(_){return {};}}
function writeNotes(notes){localStorage.setItem(NOTES_KEY,JSON.stringify(notes));}
function noteKey(){return selectedArticle?selectedLawId+':'+selectedArticle.num:'';}
function setSync(text){ui.sync.textContent=text||'';}
function scheduleCloudSync(){clearTimeout(syncTimer);syncTimer=setTimeout(runCloudSync,900);}
async function runCloudSync(){
  if(syncRunning){syncDirty=true;return;}
  syncRunning=true;setSync('同期中…');
  try{await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());setSync('同期済み');}
  catch(error){setSync('端末保存済み・クラウド同期失敗: '+(error&&error.message?error.message:'失敗'));}
  finally{syncRunning=false;if(syncDirty){syncDirty=false;runCloudSync();}}
}
function commitMemo(){
  memoTimer=null;
  if(!selectedArticle)return;
  const key=noteKey();const notes=readNotes();const text=ui.memo.value.replace(/\r\n?/g,'\n');
  if(text.trim())notes[key]=text;else delete notes[key];
  try{writeNotes(notes);setSync('端末に保存済み');scheduleCloudSync();}catch(error){setSync('端末保存に失敗: '+(error&&error.message?error.message:'失敗'));}
}
function flushPendingMemo(){
  if(!memoTimer||!selectedArticle)return;
  clearTimeout(memoTimer);
  memoTimer=null;
  commitMemo();
}
function loadMemo(){
  const key=noteKey();const notes=readNotes();
  ui.memo.disabled=!selectedArticle;ui.memo.value=key?(notes[key]||''):'';
  ui.memoContext.textContent=selectedArticle?(Statutes.getLaw(selectedLawId).title+' '+(selectedArticle.title||selectedArticle.num)):'条文を選択してください。';
  setSync('');
}
function openMemo(){if(isMobile()&&selectedArticle)ui.pane.classList.add('open');}
function closeMemo(){ui.pane.classList.remove('open');}
function setReaderState(title,text){ui.state.hidden=false;ui.state.innerHTML='';const strong=document.createElement('strong');strong.textContent=title;const span=document.createElement('span');span.textContent=text||'';ui.state.append(strong,span);ui.list.hidden=true;ui.detail.hidden=true;}
function renderTabs(){ui.tabs.replaceChildren();Statutes.LAW_CATALOG.forEach((law)=>{const button=document.createElement('button');button.type='button';button.className='lawTab'+(law.id===selectedLawId?' active':'');button.textContent=law.shortTitle;button.setAttribute('role','tab');button.setAttribute('aria-selected',law.id===selectedLawId?'true':'false');button.addEventListener('click',()=>{if(law.id!==selectedLawId)selectLaw(law.id);});ui.tabs.append(button);});}
function formatDate(value){if(!value)return'';const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);}
function renderMeta(extra=''){
  ui.meta.replaceChildren();if(!lawRecord){ui.meta.textContent=extra;return;}
  const source=document.createElement('span');source.textContent=(lawRecord.source||'e-Gov 法令API')+(lawRecord.lawNum?' ・ '+lawRecord.lawNum:'');ui.meta.append(source);
  if(lawRecord.fetchedAt){const fetched=document.createElement('span');fetched.textContent='端末保存: '+formatDate(lawRecord.fetchedAt);ui.meta.append(fetched);}
  const link=document.createElement('a');link.href=lawRecord.sourceUrl||('https://laws.e-gov.go.jp/law/'+lawRecord.lawId);link.target='_blank';link.rel='noopener noreferrer';link.textContent='e-Govで確認 ↗';ui.meta.append(link);
  if(extra){const note=document.createElement('span');note.textContent=extra;ui.meta.append(note);}
}
function matches(){return Statutes.searchArticles(lawRecord,ui.search.value);}
function renderList(){
  flushPendingMemo();
  selectedArticle=null;closeMemo();loadMemo();filtered=matches();ui.state.hidden=true;ui.detail.hidden=true;ui.list.hidden=false;ui.list.replaceChildren();
  if(!filtered.length){setReaderState('該当する条文がありません','検索語を変えてください。');return;}
  const fragment=document.createDocumentFragment();filtered.forEach((article)=>{const button=document.createElement('button');button.type='button';button.className='articleRow';button.dataset.article=article.num;const title=document.createElement('div');title.className='articleRowTitle';title.textContent=article.title||('第'+article.num+'条');button.append(title);if(article.caption){const caption=document.createElement('div');caption.className='articleCaption';caption.textContent=article.caption;button.append(caption);}if(article.text){const preview=document.createElement('div');preview.className='articlePreview';preview.textContent=article.text;button.append(preview);}button.addEventListener('click',()=>selectArticle(article));fragment.append(button);});ui.list.append(fragment);
}
function selectedIndex(){return lawRecord&&selectedArticle?lawRecord.articles.findIndex((article)=>String(article.num)===String(selectedArticle.num)):-1;}
function renderDetail(){
  if(!selectedArticle)return;ui.state.hidden=true;ui.list.hidden=true;ui.detail.hidden=false;ui.detailTitle.textContent=selectedArticle.title||('第'+selectedArticle.num+'条');ui.detailCaption.textContent=selectedArticle.caption||'';ui.text.textContent=selectedArticle.text||'';
  const index=selectedIndex();ui.prev.disabled=index<=0;ui.next.disabled=index<0||index>=lawRecord.articles.length-1;
}
function selectArticle(article){
  flushPendingMemo();
  selectedArticle=article;renderDetail();loadMemo();openMemo();const url=new URL(location.href);url.searchParams.set('law',selectedLawId);url.searchParams.set('article',article.num);history.replaceState(null,'',url);
}
function moveArticle(delta){const index=selectedIndex();const next=lawRecord&&lawRecord.articles[index+delta];if(next)selectArticle(next);}
function restoreArticleFromUrl(){const params=new URLSearchParams(location.search);const num=params.get('article');if(!num||!lawRecord)return false;const normalized=Statutes.normalizeArticleQuery(num);const found=lawRecord.articles.find((article)=>Statutes.normalizeArticleQuery(String(article.num).replace(/-/g,'_'))===normalized||Statutes.normalizeArticleQuery(article.title)===normalized);if(!found)return false;selectArticle(found);return true;}
async function selectLaw(id,force=false){
  flushPendingMemo();
  const token=++loadToken;selectedLawId=id;lawRecord=null;selectedArticle=null;ui.search.value='';renderTabs();loadMemo();closeMemo();ui.refresh.disabled=true;setReaderState(force?'法令データを更新しています':'法令データを準備しています','端末キャッシュを優先して読み込みます。');renderMeta('');
  try{
    const result=await Statutes.ensureLaw(id,{force});if(token!==loadToken)return;lawRecord=result.record;renderMeta(result.cached?'端末キャッシュを使用':'最新データを端末に保存しました');
    if(!restoreArticleFromUrl())renderList();
  }catch(error){if(token!==loadToken)return;const cached=await Statutes.getCachedLaw(id).catch(()=>null);if(cached){lawRecord=cached;renderMeta('更新に失敗したため端末キャッシュを使用');renderList();}else{setReaderState('法令データを取得できませんでした',error&&error.message?error.message:'通信状態を確認して再試行してください。');renderMeta('');}}
  finally{if(token===loadToken)ui.refresh.disabled=false;}
}
ui.search.addEventListener('input',()=>{if(lawRecord)renderList();});
ui.refresh.addEventListener('click',()=>selectLaw(selectedLawId,true));
ui.back.addEventListener('click',()=>renderList());ui.prev.addEventListener('click',()=>moveArticle(-1));ui.next.addEventListener('click',()=>moveArticle(1));ui.memoClose.addEventListener('click',closeMemo);
ui.memo.addEventListener('input',()=>{clearTimeout(memoTimer);setSync('入力中…');memoTimer=setTimeout(commitMemo,350);});
window.addEventListener('pagehide',()=>flushPendingMemo());
window.addEventListener('resize',()=>{if(!isMobile())closeMemo();});

const requestedLaw=new URLSearchParams(location.search).get('law');if(Statutes.getLaw(requestedLaw))selectedLawId=requestedLaw;
renderTabs();
MangaVault.refreshSession().then(()=>{document.documentElement.classList.remove('auth-pending');selectLaw(selectedLawId);}).catch(()=>{MangaVault.saveSession(null);showLogin();});
})();
