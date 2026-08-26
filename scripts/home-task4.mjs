import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const read=(p)=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
const run=(args,expect=true)=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if((r.status===0)!==expect)throw new Error(`unexpected result: ${args.join(' ')} status=${r.status}`)};

// RED: Home shell contract before files exist.
write('tests/home-page.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(name)=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Home page exposes card grid, edit shell, and in-place vault gate',()=>{
  const html=read('home.html');
  for(const id of ['homeGrid','homeEditBtn','vaultGateHost','homeEditPanel','homeProfileSelect','homeStatus','recoveryContinueBtn'])assert.match(html,new RegExp('id=["\\\']'+id+'["\\\']'));
  for(const file of ['home-layout.js','home-cards.js','home-local-cards.js','vault-gate.js','home.js'])assert.match(html,new RegExp(file.replace('.','\\.')));
  assert.match(html,/@supports not \(\(backdrop-filter: blur\(1px\)\)/);
  assert.doesNotMatch(html,/id=["']homeHero["']/);
});

test('Home boot uses active vault and encrypted CAS save path',()=>{
  const js=read('home.js');
  assert.match(js,/MangaVault\.loadActive\(\)/);
  assert.match(js,/MangaVault\.savePayload\(/);
  assert.match(js,/750/);
  assert.match(js,/PROFILE_OVERRIDE_KEY/);
  assert.match(js,/updateCardSettings/);
  assert.match(js,/moveCard/);
  assert.match(js,/resetProfile/);
});

test('new vault recovery requires explicit confirmation before dashboard',()=>{
  const html=read('home.html'),js=read('home.js');
  assert.match(html,/復旧キーを保存した/);
  assert.match(js,/recoveryContinueBtn/);
  assert.doesNotMatch(js,/setTimeout\([^)]*showDashboard/);
});
`);
if(!fs.existsSync('home.html')||!fs.existsSync('home.js'))run(['--test','tests/home-page.test.mjs'],false);

write('home.html',String.raw`<!doctype html>
<html lang="ja" class="auth-pending">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#eef4ff">
<title>Home</title>
<link rel="icon" type="image/png" href="icon-152.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon-180.png">
<style>
:root{color-scheme:light;--bg:#f3f6fb;--surface:rgba(255,255,255,.76);--surface-solid:#fff;--text:#172033;--sub:#667085;--line:rgba(80,96,125,.16);--accent:#2563eb;--danger:#b42318;--shadow:0 18px 50px rgba(31,55,96,.12)}
html[data-theme="dark"]{color-scheme:dark;--bg:#0b0e14;--surface:rgba(24,29,40,.76);--surface-solid:#171c27;--text:#f3f5f9;--sub:#9aa4b5;--line:rgba(255,255,255,.12);--accent:#7aa2ff;--danger:#ff8c85;--shadow:0 18px 50px rgba(0,0,0,.34)}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}html.auth-pending body{visibility:hidden}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hiragino Sans","Yu Gothic",sans-serif;color:var(--text);background:radial-gradient(90% 55% at 0 0,rgba(100,150,255,.18),transparent 70%),radial-gradient(70% 50% at 100% 100%,rgba(88,204,2,.07),transparent 70%),var(--bg);-webkit-font-smoothing:antialiased}button,select,input{font:inherit;color:inherit}button,a,select{touch-action:manipulation}a{color:var(--accent)}[hidden]{display:none!important}
#homeApp{width:min(1180px,calc(100% - 24px));margin:0 auto;padding:max(12px,env(safe-area-inset-top)) 0 calc(42px + env(safe-area-inset-bottom))}
#homeShell{position:sticky;top:max(8px,env(safe-area-inset-top));z-index:30;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 14px;padding:9px;border:1px solid rgba(255,255,255,.58);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.38),transparent 45%),var(--surface);box-shadow:var(--shadow);-webkit-backdrop-filter:blur(24px) saturate(155%);backdrop-filter:blur(24px) saturate(155%)}
.shellBtn,.editBtn,.catalogBtn{border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.2);padding:10px 12px;text-decoration:none;font-weight:720;cursor:pointer}.shellBtn.primary{background:var(--accent);color:#fff;border-color:transparent}.shellSpacer{flex:1}.shellSelect{border:1px solid var(--line);border-radius:14px;background:var(--surface-solid);padding:9px 10px}.accountText{font-size:12px;color:var(--sub);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#homeStatus{min-height:20px;margin:0 4px 12px;color:var(--sub);font-size:13px}#homeStatus.isError{color:var(--danger)}
#homeGrid{display:grid;gap:14px;grid-template-columns:1fr}.homeCard{min-width:0;border:1px solid var(--line);border-radius:24px;padding:17px;background:var(--surface);box-shadow:0 12px 34px rgba(31,55,96,.08);-webkit-backdrop-filter:blur(18px) saturate(145%);backdrop-filter:blur(18px) saturate(145%)}.homeCard[data-size="small"],.homeCard[data-size="medium"]{grid-column:span 1}.homeCardHeader{display:flex;align-items:center;gap:8px;margin-bottom:13px}.homeCardHeader h2{font-size:17px;margin:0}.homeCardBody{display:grid;gap:10px}.homeCardBody p{margin:0;line-height:1.55}.homeCardLink{display:inline-flex;align-items:center;min-height:40px;padding:9px 11px;border:1px solid var(--line);border-radius:13px;text-decoration:none;background:rgba(255,255,255,.16);font-weight:700}.homeCardMeta,.homeCardEmpty{color:var(--sub);font-size:13px}.homeAppLinks{display:grid;gap:8px}.homeStudyDue{font-size:27px}.emptyHome{grid-column:1/-1;padding:42px 16px;text-align:center;color:var(--sub)}
.homeEditControls{display:flex;gap:5px;flex-wrap:wrap;margin-left:auto}.homeEditControls button,.homeEditControls select{border:1px solid var(--line);border-radius:10px;background:var(--surface-solid);padding:6px 8px;font-size:12px}.homeCard.isEditing{outline:2px dashed color-mix(in srgb,var(--accent) 55%,transparent);cursor:grab}.homeCard.dragging{opacity:.55}
#homeEditPanel,#homeSettingsPanel{margin:0 0 14px;padding:15px;border:1px solid var(--line);border-radius:20px;background:var(--surface);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}#homeEditPanel h2,#homeSettingsPanel h2{margin:0 0 10px;font-size:16px}.catalogRow{display:flex;gap:8px;flex-wrap:wrap}.catalogBtn{padding:8px 10px}.editPanelActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
#vaultGateHost{width:min(100%,580px);margin:7vh auto 0;padding:22px;border:1px solid var(--line);border-radius:26px;background:var(--surface);box-shadow:var(--shadow);-webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%)}#vaultGateHost h1{margin:0 0 5px;font-size:27px}#vaultGateHost p{color:var(--sub);line-height:1.6}.gateField{display:grid;gap:6px;margin-top:13px}.gateField label{font-size:12px;font-weight:800}.gateField input{width:100%;border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--surface-solid)}.gateActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.gateActions button{flex:1 1 130px;border:1px solid var(--line);border-radius:14px;padding:11px;background:var(--surface-solid);font-weight:750}.gateActions .primary{background:var(--accent);color:#fff;border-color:transparent}.gateStatus{min-height:20px;font-size:13px;color:var(--sub)}#recoveryPanel{margin-top:16px;padding:15px;border:1px solid rgba(234,179,8,.4);border-radius:16px;background:rgba(254,240,138,.14)}#recoveryCode{display:block;overflow-wrap:anywhere;margin:8px 0;padding:10px;border-radius:10px;background:var(--surface-solid);user-select:all}
@media(min-width:700px){#homeGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.homeCard[data-size="large"]{grid-column:span 2}}
@media(min-width:1100px){#homeGrid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:560px){#homeApp{width:min(100% - 16px,1180px)}#homeShell{border-radius:20px}.accountText{display:none}.homeCard{border-radius:20px}.homeCard[data-size="small"]{padding:13px}.homeCard[data-size="large"]{padding:20px}}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))){#homeShell,.homeCard,#homeEditPanel,#homeSettingsPanel,#vaultGateHost{background:var(--surface-solid)}}
</style>
<script>try{document.documentElement.dataset.theme=localStorage.getItem('mangaReaderTheme')==='light'?'light':'dark'}catch(_){document.documentElement.dataset.theme='dark'}</script>
</head>
<body>
<main id="homeApp">
  <section id="vaultGateHost" hidden aria-label="保管庫を開く">
    <h1>Home</h1><p id="vaultAccount"></p>
    <div id="vaultInputPanel">
      <div class="gateField"><label for="vaultPassphrase">保管庫パスフレーズ</label><input id="vaultPassphrase" type="password" autocomplete="off" data-lpignore="true" data-1p-ignore="true"></div>
      <div class="gateField"><label for="recoveryKey">または復旧キー</label><input id="recoveryKey" type="text" autocomplete="off" spellcheck="false"></div>
      <div class="gateActions"><button id="passphraseUnlockBtn" class="primary" type="button">開く</button><button id="passkeyUnlockBtn" type="button">パスキーで開く</button><button id="createVaultBtn" type="button">保管庫を作成</button><button id="passkeyRegisterBtn" type="button">パスキーを登録</button></div>
      <div class="gateActions"><button id="gateLogoutBtn" type="button">ログアウト</button></div>
    </div>
    <p id="vaultGateStatus" class="gateStatus" aria-live="polite"></p>
    <div id="recoveryPanel" hidden><strong>復旧キー（今だけ表示）</strong><code id="recoveryCode"></code><div class="gateActions"><button id="copyRecoveryBtn" type="button">コピー</button><button id="recoveryContinueBtn" class="primary" type="button">復旧キーを保存した</button></div></div>
  </section>

  <div id="homeShell" hidden>
    <button id="homeEditBtn" class="shellBtn primary" type="button">ホームを編集</button>
    <label class="accountText" for="homeProfileSelect">表示</label><select id="homeProfileSelect" class="shellSelect" aria-label="このブラウザのHomeレイアウト"><option value="auto">自動</option><option value="mobile">スマホ</option><option value="tablet">タブレット</option><option value="desktop">PC</option></select>
    <span id="homeProfileLabel" class="accountText"></span><span class="shellSpacer"></span><span id="homeAccount" class="accountText"></span>
    <a class="shellBtn" href="sync.html">同期・保管庫</a><button id="homeLogoutBtn" class="shellBtn" type="button">ログアウト</button>
  </div>
  <p id="homeStatus" aria-live="polite"></p>
  <section id="homeEditPanel" hidden><h2>カードを追加</h2><div id="homeCardCatalog" class="catalogRow"></div><div class="editPanelActions"><button id="homeResetBtn" class="editBtn" type="button">このレイアウトを初期化</button></div></section>
  <section id="homeSettingsPanel" hidden><h2 id="homeSettingsTitle">カード設定</h2><div id="homeSettingsBody"></div><div class="editPanelActions"><button id="homeSettingsCloseBtn" class="editBtn" type="button">閉じる</button></div></section>
  <section id="homeGrid" aria-label="Homeカード"></section>
</main>
<script src="supabase-config.js"></script>
<script src="vault-session.js?v=20260813-vault-state"></script>
<script src="home-layout.js"></script>
<script src="vault-payload.js"></script>
<script src="vault-gate.js"></script>
<script src="feature-flags.js"></script>
<script src="study-data.js"></script>
<script src="home-cards.js"></script>
<script src="home-local-cards.js"></script>
<script src="home.js"></script>
</body>
</html>
`);

write('home.js',String.raw`(()=>{
'use strict';
const $=(id)=>document.getElementById(id);
const DATA_KEYS=MangaVaultPayload.DATA_KEYS;
const OVERRIDE_KEY=MangaHomeLayout.PROFILE_OVERRIDE_KEY;
const registry=MangaHomeCards.createRegistry();
MangaHomeLocalCards.registerLocalCards(registry);
const ui={shell:$('homeShell'),grid:$('homeGrid'),edit:$('homeEditBtn'),editPanel:$('homeEditPanel'),catalog:$('homeCardCatalog'),reset:$('homeResetBtn'),profile:$('homeProfileSelect'),profileLabel:$('homeProfileLabel'),account:$('homeAccount'),status:$('homeStatus'),settings:$('homeSettingsPanel'),settingsTitle:$('homeSettingsTitle'),settingsBody:$('homeSettingsBody'),settingsClose:$('homeSettingsCloseBtn'),gate:$('vaultGateHost'),gateAccount:$('vaultAccount'),gateInput:$('vaultInputPanel'),gateStatus:$('vaultGateStatus'),passphrase:$('vaultPassphrase'),recovery:$('recoveryKey'),unlock:$('passphraseUnlockBtn'),passkeyUnlock:$('passkeyUnlockBtn'),create:$('createVaultBtn'),passkeyRegister:$('passkeyRegisterBtn'),gateLogout:$('gateLogoutBtn'),recoveryPanel:$('recoveryPanel'),recoveryCode:$('recoveryCode'),copyRecovery:$('copyRecoveryBtn'),recoveryContinue:$('recoveryContinueBtn'),logout:$('homeLogoutBtn')};
const session=MangaVault.loadSession();
if(!session||!session.user){location.replace('index.html');return;}
ui.account.textContent=session.user.email||'';ui.gateAccount.textContent=session.user.email||'';
let editing=false,draggedCardId=null,saveTimer=null,saveRunning=false,saveDirty=false,homeState=null,currentProfile='mobile',gateBusy=false;
function readJson(key,fallback){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value==null?fallback:value}catch(_){return fallback}}
function setStatus(text,error=false){ui.status.textContent=text||'';ui.status.classList.toggle('isError',!!error)}
function gateStatus(text){ui.gateStatus.textContent=text||''}
function overrideValue(){const value=localStorage.getItem(OVERRIDE_KEY);return MangaHomeLayout.PROFILE_NAMES.includes(value)?value:null}
function resolveProfile(){return MangaHomeLayout.resolveProfile({width:innerWidth,maxTouchPoints:navigator.maxTouchPoints||0,override:overrideValue()})}
function loadHome(){homeState=MangaHomeLayout.normalizeHome(readJson(DATA_KEYS.home,null));localStorage.setItem(DATA_KEYS.home,JSON.stringify(homeState));return homeState}
function context(){const features=window.MangaReaderFeatures||{};return{profile:currentProfile,study:window.StudyData?StudyData.load():readJson(DATA_KEYS.study,{}),items:readJson(DATA_KEYS.items,[]),features,localReaderEnabled:!!features.localReader,navigate(href){location.href=href},requestRender(){renderDashboard()}}}
function scheduleCloudSave(){clearTimeout(saveTimer);saveTimer=setTimeout(flushCloudSave,750)}
async function flushCloudSave(){if(saveRunning){saveDirty=true;return}saveRunning=true;saveDirty=false;try{await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());setStatus('ホームを同期しました')}catch(error){setStatus(error&&error.message?error.message:'ホームを同期できませんでした',true)}finally{saveRunning=false;if(saveDirty)scheduleCloudSave()}}
function persistHome(next){homeState=MangaHomeLayout.normalizeHome(next);localStorage.setItem(DATA_KEYS.home,JSON.stringify(homeState));renderDashboard();scheduleCloudSave()}
function cardsForProfile(){return homeState.layouts[currentProfile].cards}
function makeButton(label,handler){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',(event)=>{event.stopPropagation();handler(event)});return button}
function makeSizeSelect(instance,definition){const select=document.createElement('select');select.setAttribute('aria-label','カードサイズ');for(const size of definition.allowedSizes){const option=document.createElement('option');option.value=size;option.textContent=size==='small'?'小':size==='large'?'大':'中';option.selected=size===instance.size;select.appendChild(option)}select.addEventListener('click',(event)=>event.stopPropagation());select.addEventListener('change',()=>persistHome(MangaHomeLayout.resizeCard(homeState,currentProfile,instance.id,select.value)));return select}
function openSettings(instance,definition){ui.settings.hidden=false;ui.settingsTitle.textContent=definition.title+' の設定';ui.settingsBody.replaceChildren();registry.renderSettings({instance,host:ui.settingsBody,context:context(),updateSettings:(settings)=>persistHome(MangaHomeLayout.updateCardSettings(homeState,currentProfile,instance.id,settings))})}
function editControls(instance,index,definition){const box=document.createElement('div');box.className='homeEditControls';const up=makeButton('上へ',()=>{if(index>0)persistHome(MangaHomeLayout.moveCard(homeState,currentProfile,instance.id,index-1))});up.disabled=index===0;box.appendChild(up);const down=makeButton('下へ',()=>{if(index<cardsForProfile().length-1)persistHome(MangaHomeLayout.moveCard(homeState,currentProfile,instance.id,index+1))});down.disabled=index>=cardsForProfile().length-1;box.appendChild(down);box.appendChild(makeSizeSelect(instance,definition));box.appendChild(makeButton('設定',()=>openSettings(instance,definition)));box.appendChild(makeButton('削除',()=>persistHome(MangaHomeLayout.removeCard(homeState,currentProfile,instance.id))));return box}
function cardElement(instance,index){const definition=registry.get(instance.type);const section=document.createElement('article');section.className='homeCard'+(editing?' isEditing':'');section.dataset.cardId=instance.id;section.dataset.size=instance.size;const head=document.createElement('div');head.className='homeCardHeader';const title=document.createElement('h2');title.textContent=definition?definition.title:instance.type;head.appendChild(title);if(editing&&definition)head.appendChild(editControls(instance,index,definition));section.appendChild(head);const body=document.createElement('div');body.className='homeCardBody';section.appendChild(body);registry.render({instance,host:body,context:context()});if(editing){section.draggable=true;section.addEventListener('dragstart',()=>{draggedCardId=instance.id;section.classList.add('dragging')});section.addEventListener('dragend',()=>{draggedCardId=null;section.classList.remove('dragging')});section.addEventListener('dragover',(event)=>event.preventDefault());section.addEventListener('drop',(event)=>{event.preventDefault();if(!draggedCardId||draggedCardId===instance.id)return;const target=cardsForProfile().findIndex((card)=>card.id===instance.id);persistHome(MangaHomeLayout.moveCard(homeState,currentProfile,draggedCardId,target))})}return section}
function renderCatalog(){ui.catalog.replaceChildren();const present=new Set(cardsForProfile().map((card)=>card.type));const available=registry.list().filter((definition)=>!present.has(definition.type));if(!available.length){const text=document.createElement('span');text.className='homeCardMeta';text.textContent='追加できるカードはありません';ui.catalog.appendChild(text);return}for(const definition of available){const button=document.createElement('button');button.type='button';button.className='catalogBtn';button.textContent='＋ '+definition.title;button.addEventListener('click',()=>persistHome(MangaHomeLayout.addCard(homeState,currentProfile,{id:definition.type,type:definition.type,size:definition.allowedSizes.includes('medium')?'medium':definition.allowedSizes[0],settings:{}})));ui.catalog.appendChild(button)}}
function renderDashboard(){if(!homeState)loadHome();currentProfile=resolveProfile();ui.profileLabel.textContent=currentProfile==='mobile'?'スマホ用':currentProfile==='tablet'?'タブレット用':'PC用';ui.profile.value=overrideValue()||'auto';ui.grid.replaceChildren();const cards=cardsForProfile();if(!cards.length){const empty=document.createElement('div');empty.className='emptyHome';empty.textContent=editing?'カードを追加してHomeを作成できます':'表示するカードがありません。「ホームを編集」から追加できます。';ui.grid.appendChild(empty)}else cards.forEach((instance,index)=>ui.grid.appendChild(cardElement(instance,index)));ui.editPanel.hidden=!editing;if(editing)renderCatalog();ui.edit.textContent=editing?'編集完了':'ホームを編集'}
function showDashboard(){ui.gate.hidden=true;ui.shell.hidden=false;ui.status.hidden=false;ui.grid.hidden=false;ui.editPanel.hidden=!editing;ui.recoveryPanel.hidden=true;ui.recoveryCode.textContent='';loadHome();renderDashboard();document.documentElement.classList.remove('auth-pending')}
function validateGateInput({allowRecovery=true}={}){const passphrase=ui.passphrase.value,recovery=allowRecovery?ui.recovery.value.trim():'';if(!recovery&&passphrase.length<12){gateStatus('パスフレーズは12文字以上で入力してください。');return null}return{passphrase,recovery}}
const gate=MangaVaultGate.createController({vaultApi:MangaVault,payloadApi:MangaVaultPayload});
async function refreshVaultState(){try{const record=await MangaVault.withSession((token,user)=>MangaVault.fetchRecordForUi(token,user));const exists=!!record;ui.unlock.hidden=!exists;ui.passkeyUnlock.hidden=!exists;ui.passkeyRegister.hidden=!exists;ui.create.hidden=exists;if(!exists)gateStatus('保管庫はまだ作成されていません。')}catch(error){gateStatus(error&&error.message?error.message:'保管庫の状態を確認できませんでした。')}}
function displayRecovery(result){ui.gateInput.hidden=true;ui.recoveryPanel.hidden=false;ui.recoveryCode.textContent=result.recoveryCode||'';gateStatus('復旧キーを安全な場所へ保存してください。')}
async function unlockVault(){const input=validateGateInput();if(!input||gateBusy)return;gateBusy=true;gateStatus('保管庫を開いています…');try{const result=await gate.unlock(input);ui.passphrase.value='';ui.recovery.value='';if(result&&result.created)displayRecovery(result);else showDashboard()}catch(error){gateStatus(error&&error.message?error.message:'保管庫を開けませんでした。')}finally{gateBusy=false}}
async function unlockPasskey(){if(gateBusy)return;gateBusy=true;gateStatus('パスキーを確認しています…');try{await gate.unlockWithPasskey();showDashboard()}catch(error){gateStatus(error&&error.message?error.message:'パスキーで開けませんでした。')}finally{gateBusy=false}}
async function createVault(){const input=validateGateInput({allowRecovery:false});if(!input||gateBusy)return;gateBusy=true;gateStatus('保管庫を作成しています…');try{const result=await gate.create(input.passphrase);ui.passphrase.value='';displayRecovery(result)}catch(error){gateStatus(error&&error.message?error.message:'保管庫を作成できませんでした。')}finally{gateBusy=false}}
async function registerPasskey(){const input=validateGateInput({allowRecovery:false});if(!input||gateBusy)return;gateBusy=true;gateStatus('パスキーを登録しています…');try{await gate.registerPasskey(input.passphrase);ui.passphrase.value='';gateStatus('パスキーを登録しました。')}catch(error){gateStatus(error&&error.message?error.message:'パスキーを登録できませんでした。')}finally{gateBusy=false}}
async function logout(){if(!confirm('ログアウトしますか？'))return;try{await MangaVault.withSession((token)=>MangaVault.api('/auth/v1/logout',{method:'POST',token}))}catch(_){}MangaVault.clearActive();MangaVault.saveSession(null);localStorage.removeItem(MangaVault.META_KEY);MangaVaultPayload.clearDeviceData();for(const key of ['mangaReaderLastUrl','mangaReaderSavedUrls','mangaReaderGithubSync','mangaReaderVaultSyncMeta'])localStorage.removeItem(key);location.replace('index.html')}
function showVaultGate(){ui.shell.hidden=true;ui.grid.hidden=true;ui.editPanel.hidden=true;ui.settings.hidden=true;ui.status.hidden=true;ui.gate.hidden=false;ui.gateInput.hidden=false;ui.recoveryPanel.hidden=true;document.documentElement.classList.remove('auth-pending');refreshVaultState()}
ui.edit.addEventListener('click',()=>{editing=!editing;ui.settings.hidden=true;renderDashboard()});ui.profile.addEventListener('change',()=>{if(ui.profile.value==='auto')localStorage.removeItem(OVERRIDE_KEY);else localStorage.setItem(OVERRIDE_KEY,ui.profile.value);renderDashboard()});ui.reset.addEventListener('click',()=>{if(confirm('現在のレイアウトを初期状態に戻しますか？'))persistHome(MangaHomeLayout.resetProfile(homeState,currentProfile))});ui.settingsClose.addEventListener('click',()=>{ui.settings.hidden=true});ui.unlock.addEventListener('click',unlockVault);ui.passkeyUnlock.addEventListener('click',unlockPasskey);ui.create.addEventListener('click',createVault);ui.passkeyRegister.addEventListener('click',registerPasskey);ui.copyRecovery.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(ui.recoveryCode.textContent)}catch(_){}});ui.recoveryContinue.addEventListener('click',showDashboard);ui.gateLogout.addEventListener('click',logout);ui.logout.addEventListener('click',logout);window.addEventListener('resize',()=>{if(!overrideValue()&&!ui.shell.hidden)renderDashboard()});window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&saveTimer){clearTimeout(saveTimer);saveTimer=null;flushCloudSave()}});
if(MangaVault.loadActive())showDashboard();else showVaultGate();
})();
`);

// Add Home and all new modules to static syntax/reference verification.
let checker=read('scripts/check-static.mjs');
checker=checker.replace("const pages = ['index.html', 'sync.html', 'reader.html', 'local-reader.html', 'links.html', 'study.html'];","const pages = ['index.html', 'sync.html', 'reader.html', 'local-reader.html', 'links.html', 'study.html', 'home.html'];");
if(!checker.includes("'home-layout.js'"))checker=checker.replace("'author-summary.js', 'backup-format.js', 'home-cards.js', 'home-local-cards.js'","'author-summary.js', 'backup-format.js', 'home-layout.js', 'home-cards.js', 'home-local-cards.js', 'home.js'");
else if(!checker.includes("'home.js'"))checker=checker.replace("'home-layout.js'","'home-layout.js', 'home.js'");
write('scripts/check-static.mjs',checker);

run(['--test','tests/home-page.test.mjs','tests/home-layout.test.mjs','tests/home-cards.test.mjs','tests/home-local-cards.test.mjs'],true);
console.log('Home core Task 4 focused tests green');
