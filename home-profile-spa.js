(() => {
'use strict';
if (typeof window === 'undefined' || typeof document === 'undefined') return;
const Home=window.MangaReaderHome;
const config=window.MANGA_READER_SUPABASE||{};
const marks={manga:'漫',video:'動'};
const PROFILE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg>';
function profileHeaderButtonMarkup(){return '<button class="headerProfileButton" type="button" data-profile-menu-trigger aria-label="アカウント" aria-haspopup="menu" aria-expanded="false">'+PROFILE_ICON+'</button>';}
function ensureProfileOnlyHeader(app){
  let header=app.querySelector('.homeHeader');
  if(!header){
    header=document.createElement('header');
    header.className='homeHeader';
    app.insertBefore(header,app.firstChild);
  }
  if(header.dataset.profileOnlyHeader!=='1'){
    const currentTitle=(header.querySelector('#shellTitle')&&header.querySelector('#shellTitle').textContent)||document.title||'ホーム';
    header.innerHTML='<div><span class="eyebrow">HOME</span><h1 id="shellTitle"></h1></div>'+profileHeaderButtonMarkup();
    header.querySelector('#shellTitle').textContent=currentTitle;
    header.dataset.profileOnlyHeader='1';
  }
  return header;
}
const $=(id)=>document.getElementById(id);
const showLogin=()=>window.location.replace('index.html');
const showVault=()=>window.location.replace('sync.html');
const session=window.MangaVault&&MangaVault.loadSession();
const SPA_PAGES=(window.AppShell&&Array.isArray(AppShell.SPA_PAGES)?[...AppShell.SPA_PAGES]:['home.html','profile.html','manga.html','video.html','reader.html']);
let layout=Home?Home.loadLayout():[];
let editing=false,syncRunning=false,syncDirty=false,syncDirtyMessage='',syncClearTimer=null,profileSecurityBusy=false;
let mount=null,renderGeneration=0,mangaRouteRuntime=null,mangaRouteBootPromise=null,videoRouteRuntime=null;

function ensureAppShell(){
  const app=document.getElementById('homeApp')||document.querySelector('.homeShell');
  if(!app)return null;
  ensureProfileOnlyHeader(app);
  if(!document.getElementById('routeContent')){
    const content=document.createElement('div');
    content.id='routeContent';
    app.appendChild(content);
  }
  if(window.MobileBottomNav&&typeof MobileBottomNav.ensureSpaNav==='function'){
    MobileBottomNav.ensureSpaNav(app);
  }else if(!document.getElementById('mobileBottomNav')){
    const nav=document.createElement('nav');nav.id='mobileBottomNav';nav.className='mobileBottomNav';nav.setAttribute('aria-label','モバイルメニュー');nav.innerHTML='<a href="home.html">ホーム</a><a href="manga.html">漫画</a><a href="video.html">動画</a><a href="profile.html">プロフィール</a>';app.append(nav);
  }
  mount=document.getElementById('routeContent');
  return mount;
}

function getMount(){
  if(!mount || !mount.isConnected) mount=document.getElementById('routeContent')||ensureAppShell();
  return mount;
}

function routeName(path=location.pathname){const name=path.split('/').pop();if(name==='profile.html')return'profile';if(name==='manga.html')return'manga';if(name==='video.html')return'video';if(name==='reader.html')return'reader';return'home';}
function setTitle(route){const titles={home:'ホーム',profile:'プロフィール設定',manga:'漫画',video:'動画',reader:'漫画リーダー'};const title=titles[route]||titles.home;document.title=title;const h1=document.getElementById('shellTitle');if(h1)h1.textContent=title;}
function setSyncStatus(text){const node=$('homeSyncStatus');if(!node)return;clearTimeout(syncClearTimer);node.textContent=text||'';if(text&&text!=='同期中…')syncClearTimer=setTimeout(()=>{if(node.isConnected)node.textContent='';},3500);}
async function runHomeSync(okMessage){if(syncRunning){syncDirty=true;syncDirtyMessage=okMessage||syncDirtyMessage;return;}syncRunning=true;setSyncStatus('同期中…');try{await MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage());setSyncStatus(okMessage||'保存しました');}catch(error){setSyncStatus('端末には保存済みです。クラウド同期: '+(error&&error.message?error.message:'失敗'));}finally{syncRunning=false;if(syncDirty){syncDirty=false;const queued=syncDirtyMessage;syncDirtyMessage='';runHomeSync(queued);}}}
function commitLayout(next){layout=Home.saveLayout(next);renderHome();runHomeSync('ホームの並びを保存しました');}
function cardTop(card){const top=document.createElement('div');top.className='cardTop';const mark=document.createElement('span');mark.className='cardMark';mark.textContent=marks[card.id]||'・';const badge=document.createElement('span');badge.className='cardBadge';badge.textContent=card.badge||'';top.append(mark,badge);return top;}
function addCardText(root,card){root.append(cardTop(card));const title=document.createElement('h2');title.textContent=card.title;root.append(title);}
function buildCard(id,index){const card=Home.CARD_CATALOG[id];if(!card)return null;const article=document.createElement('article');article.className='homeCard';article.dataset.kind=card.kind;if(!editing){const link=document.createElement('a');link.className='homeCardLink';link.href=card.href;if(card.kind==='official'){link.target='_blank';link.rel='noopener noreferrer';}addCardText(link,card);const hint=document.createElement('span');hint.className='openHint';hint.textContent=card.kind==='official'?'公式サイトを開く ↗':'開く →';link.append(hint);article.append(link);return article;}const body=document.createElement('div');body.className='editCardBody';addCardText(body,card);article.append(body);const controls=document.createElement('div');controls.className='cardEditControls';const up=document.createElement('button');up.type='button';up.textContent='↑';up.disabled=index===0;up.addEventListener('click',()=>commitLayout(Home.moveCard(layout,id,-1)));const down=document.createElement('button');down.type='button';down.textContent='↓';down.disabled=index===layout.length-1;down.addEventListener('click',()=>commitLayout(Home.moveCard(layout,id,1)));const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='削除';remove.addEventListener('click',()=>commitLayout(Home.removeCard(layout,id)));controls.append(up,down,remove);article.append(controls);return article;}
function renderAddPanel(list){list.replaceChildren();Home.hiddenCardIds(layout).forEach((id)=>{const card=Home.CARD_CATALOG[id],button=document.createElement('button');button.className='addCardButton';button.type='button';const title=document.createElement('strong');title.textContent='+ '+card.title;button.append(title);button.addEventListener('click',()=>commitLayout(Home.addCard(layout,id)));list.append(button);});}
function renderHome(){const target=getMount();if(!target)return;setTitle('home');target.innerHTML='<p id="homeSyncStatus" class="syncStatus" aria-live="polite"></p><section id="homeGrid" class="homeGrid" aria-label="ホームカード"></section><section id="homeEmpty" class="emptyState" hidden><strong>ホームにカードがありません</strong><span>必要なカードだけ追加できます。</span><button id="emptyEditBtn" class="glassBtn" type="button">カードを追加</button></section><section id="addCardPanel" class="addPanel" hidden><h2>カードを追加</h2><p>非表示にしたカードはいつでも戻せます。</p><div id="addCardList" class="addCardList"></div></section>';const grid=$('homeGrid'),empty=$('homeEmpty'),addPanel=$('addCardPanel'),addList=$('addCardList'),edit=$('editHomeBtn');grid.replaceChildren();layout.forEach((id,index)=>{const node=buildCard(id,index);if(node)grid.append(node);});empty.hidden=layout.length>0;addPanel.hidden=!editing;if(edit){edit.hidden=true;}$('emptyEditBtn').onclick=()=>{editing=true;renderHome();};if(editing)renderAddPanel(addList);syncHeaderRoute();}
function currentTheme(){try{const raw=String(localStorage.getItem('mangaReaderTheme')||'').replace(/^"|"$/g,'').trim();return raw==='light'?'light':'dark'}catch(_){return'dark'}}
function applyTheme(theme){const selected=theme==='light'?'light':'dark';document.documentElement.dataset.theme=selected;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',selected==='light'?'#f4f6f8':'#0a0c11');try{localStorage.setItem('mangaReaderTheme',selected)}catch(_){}}
function loadFixedNonVpnIps(){try{const value=JSON.parse(localStorage.getItem('testCode.manualNonVpnIps')||'[]');return Array.isArray(value)?value.map((ip)=>String(ip||'').trim()).filter(Boolean):[];}catch(_){return[];}}
function renderFixedNonVpnIps(){const list=$('profileNonVpnIps');if(!list)return;const ips=loadFixedNonVpnIps();list.replaceChildren();if(!ips.length){const empty=document.createElement('p');empty.textContent='固定されたIPアドレスはありません。';list.append(empty);return;}ips.forEach((ip)=>{const row=document.createElement('div');row.className='profileFixedIp';const label=document.createElement('span');label.textContent=ip;const button=document.createElement('button');button.type='button';button.className='glassBtn';button.dataset.profileClearNonVpn=ip;button.textContent='固定を解除';button.addEventListener('click',()=>{const current=loadFixedNonVpnIps().filter((value)=>value!==ip);try{localStorage.setItem('testCode.manualNonVpnIps',JSON.stringify(current));}catch(_){ }renderFixedNonVpnIps();});row.append(label,button);list.append(row);});}
function setProfileSecurityStatus(text,isError=false){const node=$('profileSecurityStatus');if(!node)return;node.textContent=text||'';node.dataset.state=isError?'error':'ok';}
function resetProfileSecurityFields(){['profileCurrentPassphrase','profileNewPassphrase','profileNewPassphraseConfirm'].forEach((id)=>{const node=$(id);if(node)node.value='';});}
function setProfileSecurityBusy(value){profileSecurityBusy=value;document.querySelectorAll('[data-profile-security-action]').forEach((button)=>{button.disabled=value;});}
async function runProfileSecurity(operation,successMessage){if(profileSecurityBusy)return;setProfileSecurityBusy(true);setProfileSecurityStatus('処理中…');try{await operation();resetProfileSecurityFields();setProfileSecurityStatus(successMessage);}catch(error){setProfileSecurityStatus(error&&error.message?error.message:'処理に失敗しました。',true);}finally{setProfileSecurityBusy(false);}}
function renderProfile(){
  const target=getMount();if(!target)return;setTitle('profile');editing=false;
  const email=(session&&session.user&&session.user.email)||'';
  const light=currentTheme()==='light';
  target.innerHTML=`<section class="profileContent"><p id="homeSyncStatus" class="syncStatus profileToastStatus" aria-live="polite"></p><h2>プロフィール設定</h2><p class="profileLead">アカウントと、端末／クラウドに残るデータの扱いです。</p><dl class="profileMeta"><div><dt>ログイン中</dt><dd id="profileEmail"></dd></div></dl><section class="profileCard"><h3>保管庫</h3><p>漫画・動画・作者カードなどのデータはブラウザ内で暗号化して同期します。</p><a class="glassBtn profileAction" href="sync.html">保管庫を開く</a></section><section class="profileCard profileSecurityCard"><h3>認証方法</h3><p>現在のパスフレーズを確認して、パスキーの設定・解除やパスフレーズの再設定を行います。</p><div class="profileSecurityFields"><label class="profileField">現在のパスフレーズ<input id="profileCurrentPassphrase" type="password" autocomplete="current-password"></label><div class="profileSecurityActions"><button class="glassBtn profileAction" id="profilePasskeyRegisterBtn" type="button" data-profile-security-action>パスキーを設定</button><button class="glassBtn profileDanger" id="profilePasskeyRemoveBtn" type="button" data-profile-security-action>登録済みパスキーを解除</button></div><label class="profileField">新しいパスフレーズ<input id="profileNewPassphrase" type="password" autocomplete="new-password"></label><label class="profileField">新しいパスフレーズ（確認）<input id="profileNewPassphraseConfirm" type="password" autocomplete="new-password"></label><button class="glassBtn profileAction" id="profilePassphraseResetBtn" type="button" data-profile-security-action>パスフレーズを再設定</button></div><p id="profileSecurityStatus" class="profileSecurityStatus" role="status" aria-live="polite"></p></section><section class="profileCard"><h3>VPN診断</h3><p>「VPNではない」と固定したIPアドレスを管理します。</p><div id="profileNonVpnIps"></div></section><section class="profileCard"><h3>表示</h3><label class="profileThemeRow"><span>ライトテーマ</span><span class="iosSwitch"><input id="profileThemeLight" type="checkbox" role="switch" aria-label="ライトテーマ"><span class="iosSwitchTrack" aria-hidden="true"></span></span></label></section><section class="profileCard"><h3>セッション</h3><p>ログアウトすると、この端末の保管庫データを消します。</p><button class="glassBtn profileDanger" id="profileLogoutBtn" type="button">ログアウト</button></section></section>`;
  const mail=$('profileEmail');if(mail)mail.textContent=email||'（メール未取得）';
  const theme=$('profileThemeLight');if(theme){theme.checked=light;theme.addEventListener('change',()=>{applyTheme(theme.checked?'light':'dark');runHomeSync('保存しました')});}
  const currentPassphrase=$('profileCurrentPassphrase');
  const registerPasskey=$('profilePasskeyRegisterBtn');if(registerPasskey)registerPasskey.addEventListener('click',()=>{const value=currentPassphrase&&currentPassphrase.value;if(!value){setProfileSecurityStatus('現在のパスフレーズを入力してください。',true);return;}runProfileSecurity(()=>MangaVault.registerPasskey(value),'パスキーを設定しました。');});
  const removePasskey=$('profilePasskeyRemoveBtn');if(removePasskey)removePasskey.addEventListener('click',()=>{const value=currentPassphrase&&currentPassphrase.value;if(!value){setProfileSecurityStatus('現在のパスフレーズを入力してください。',true);return;}runProfileSecurity(()=>MangaVault.removePasskeys(value),'登録済みパスキーを解除しました。');});
  const resetPassphrase=$('profilePassphraseResetBtn');if(resetPassphrase)resetPassphrase.addEventListener('click',()=>{const current=currentPassphrase&&currentPassphrase.value;const next=$('profileNewPassphrase');const confirmation=$('profileNewPassphraseConfirm');if(!current||!next||!next.value){setProfileSecurityStatus('現在と新しいパスフレーズを入力してください。',true);return;}if(!confirmation||next.value!==confirmation.value){setProfileSecurityStatus('新しいパスフレーズが一致しません。',true);return;}runProfileSecurity(()=>MangaVault.changePassphrase(current,next.value),'パスフレーズを再設定しました。');});
  const logoutBtn=$('profileLogoutBtn');if(logoutBtn)logoutBtn.addEventListener('click',()=>{if(window.ProfileMenu&&typeof ProfileMenu.logout==='function')ProfileMenu.logout(logoutBtn);});
  renderFixedNonVpnIps();
  const edit=$('editHomeBtn');if(edit)edit.hidden=true;syncHeaderRoute();
}
function loadScript(src,id){return new Promise((resolve,reject)=>{const existing=id&&document.getElementById(id);if(existing){if(existing.dataset.loaded==='1')resolve();else existing.addEventListener('load',resolve,{once:true});return;}const script=document.createElement('script');if(id)script.id=id;script.src=src;script.addEventListener('load',()=>{script.dataset.loaded='1';resolve();},{once:true});script.addEventListener('error',reject,{once:true});document.body.appendChild(script);});}
function syncHeaderRoute(){
  const route=routeName();
  document.querySelectorAll('.topActions a[href], .globalShellNav a[href]').forEach((link)=>{
    const name=new URL(link.href,location.href).pathname.split('/').pop();
    const active=(route==='home'&&name==='home.html')||(route==='manga'&&name==='manga.html')||(route==='video'&&name==='video.html');
    link.classList.toggle('topActionCurrent',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
  if(window.AppDesktopRail)AppDesktopRail.syncActive();
  if(window.MobileBottomNav&&typeof MobileBottomNav.syncActive==='function')MobileBottomNav.syncActive();
}
function cleanupMangaRoute(runtime=mangaRouteRuntime){if(!runtime)return;if(typeof runtime.cleanup==='function')runtime.cleanup();if(mangaRouteRuntime===runtime)mangaRouteRuntime=null;mangaRouteBootPromise=null;}
function cleanupVideoRoute(){if(videoRouteRuntime)videoRouteRuntime.detach();}
function renderVpnGate(target,route){
  target.replaceChildren();
  const section=document.createElement('section');section.className='vpnRouteGate profileContent';section.setAttribute('aria-live','polite');
  const heading=document.createElement('h2');heading.textContent=route==='video'?'動画一覧を開くにはVPN接続が必要です':'漫画一覧を開くにはVPN接続が必要です';
  const message=document.createElement('p');message.className='profileLead';message.textContent='VPN接続を確認できるまで、保存データと一覧を表示しません。接続後に再確認してください。';
  const actions=document.createElement('div');actions.className='vpnRouteActions';
  const button=document.createElement('button');button.type='button';button.className='glassBtn vpnStatusButton';button.dataset.vpnStatusButton='1';button.dataset.vpnRecheckButton='1';button.textContent='VPN確認中';button.title='VPN接続を完全に再確認します。';
  const diagnostics=document.createElement('button');diagnostics.type='button';diagnostics.className='glassBtn vpnDiagnosticsButton';diagnostics.dataset.vpnDiagnosticsButton='1';diagnostics.textContent='VPN診断';diagnostics.title='VPN判定の詳細を表示します。';
  actions.append(button,diagnostics);section.append(heading,message,actions);target.append(section);
}
async function ensureVpnGate(){
  if(window.MangaReaderMediaAccess)return window.MangaReaderMediaAccess;
  await loadScript('media-access-gate.js?v=20260926-non-jp-vpn','spaMediaGate');
  return window.MangaReaderMediaAccess;
}
function cleanupReaderRuntime(){cleanupMangaRoute();if(typeof window.MangaReaderRuntimeCleanup==='function')window.MangaReaderRuntimeCleanup();document.querySelectorAll('[data-reader-head-asset],[data-reader-spa-script]').forEach((node)=>node.remove());document.querySelectorAll('#app,#metadataSuggestions,#saveDialogOverlay,#customAddOverlay,#editItemOverlay,#bulkEditOverlay,#bulkDetectOverlay,#savedListOverlay,#videoAddOverlay,#videoPlayerOverlay,#authorCardOverlay,#tocOverlay,#settingsOverlay,#backupOverlay').forEach((node)=>node.remove());document.documentElement.classList.remove('reader-shell-page','reader-saved-list-route','reader-videoList-route','reader-authorList-route','reader-settings-route','reader-backup-route');}
function pruneReaderSurface(route){const remove=(selector)=>document.querySelectorAll(selector).forEach((node)=>node.remove());if(route==='manga'){remove('#videoAddOverlay,#videoPlayerOverlay,#settingsOverlay,#backupOverlay,#authorCardOverlay,#tocOverlay');}else if(route==='reader'){remove('#savedListOverlay,#videoAddOverlay,#videoPlayerOverlay,#settingsOverlay,#backupOverlay,#authorCardOverlay,#tocOverlay');}}
function activateReaderEntry(route){
  const tab=document.getElementById(route==='video'?'listTabVideo':'listTabManga');
  if(tab)tab.click();
}
function installReaderHeadAssets(doc){document.querySelectorAll('[data-reader-head-asset]').forEach((node)=>node.remove());doc.head.querySelectorAll('link[rel="stylesheet"],style').forEach((source)=>{const asset=source.cloneNode(true);asset.dataset.readerHeadAsset='1';if(asset.tagName==='LINK')asset.href=new URL(source.getAttribute('href'),location.href).href;document.head.appendChild(asset);});}
function loadReaderScript(source){return new Promise((resolve,reject)=>{if(source.src){const src=new URL(source.getAttribute('src'),location.href).href;if([...document.scripts].some((script)=>!script.dataset.readerSpaScript&&script.src===src)){resolve();return;}const script=document.createElement('script');script.dataset.readerSpaScript='1';script.src=src;script.onload=resolve;script.onerror=reject;document.body.appendChild(script);return;}const script=document.createElement('script');script.dataset.readerSpaScript='1';script.textContent=source.textContent;document.body.appendChild(script);resolve();});}
function loadReaderAsset(src){const source=document.createElement('script');source.src=new URL(src,location.href).href;return loadReaderScript(source);}
async function ensureVideoEntryEnhancement(){
  await loadReaderAsset('video-data.js?v=20260918-video-data-no-window');
  await loadReaderAsset('video-library.js?v=20260918-video-library-no-window');
  await loadReaderAsset('video-routing-fix.js?v=20260918-video-routing-no-window');
  await loadReaderAsset('video-thumbnail-time.js?v=20260916-video-thumbnail');
  const deadline=Date.now()+3000;
  while(!document.getElementById('videoLibraryApp')&&Date.now()<deadline) await new Promise((resolve)=>setTimeout(resolve,25));
}
async function renderVideo(generation){
  const target=getMount();
  if(!target)return;
  cleanupReaderRuntime();
  target.replaceChildren();
  try{
    const gate=await ensureVpnGate();
    if(generation!==renderGeneration)return;
    if(!gate||!gate.canLoadExternalMedia()){renderVpnGate(target,'video');if(gate&&typeof gate.syncUi==='function')gate.syncUi();setTitle('video');syncHeaderRoute();return;}
    if(!window.VideoListRouteFactory)await loadScript('video-list-route.js?v=20260922-video-route','spaVideoListRoute');
    if(!window.MangaReaderVideoTemplate)await loadScript('video-list-template.js?v=20260922-vpn-tools','spaVideoListTemplate');
    if(generation!==renderGeneration)return;
    if(!videoRouteRuntime)videoRouteRuntime=window.VideoListRouteFactory.create({
      documentRef:document,
      loadScript,
      loadMediaGate:()=>window.MangaReaderMediaAccess?Promise.resolve():loadScript('media-access-gate.js?v=20260926-non-jp-vpn','spaMediaGate'),
    });
    await videoRouteRuntime.start({mountElement:target});
    if(gate&&typeof gate.syncUi==='function')gate.syncUi();
    if(generation!==renderGeneration){videoRouteRuntime.detach();return;}
    setTitle('video');syncHeaderRoute();
  }catch(_){
    if(generation===renderGeneration)target.innerHTML='<section class="profileContent"><h2>動画一覧を読み込めませんでした</h2><p>ホームへ戻って再試行してください。</p><a class="glassBtn" href="home.html">ホームへ戻る</a></section>';
  }
}
async function renderManga(generation){
  const target=getMount();
  if(!target)return;
  cleanupReaderRuntime();
  target.replaceChildren();
  let routeRuntime=null;
  try{
    const gate=await ensureVpnGate();
    if(generation!==renderGeneration)return;
    if(!gate||!gate.canLoadExternalMedia()){renderVpnGate(target,'manga');if(gate&&typeof gate.syncUi==='function')gate.syncUi();setTitle('manga');syncHeaderRoute();return;}
    if(!window.MangaListRouteFactory) await loadScript('manga-list-route.js?v=20260926-lifecycle-fix','spaMangaListRoute');
    if(generation!==renderGeneration)return;
    routeRuntime=window.MangaListRouteFactory.create({documentRef:document,windowRef:window});
    mangaRouteRuntime=routeRuntime;
    const mounted=await routeRuntime.start({mountElement:target});
    if(generation!==renderGeneration||mangaRouteRuntime!==routeRuntime){cleanupMangaRoute(routeRuntime);return;}
    if(!mounted)throw new Error('manga route start cancelled');
    if(gate&&typeof gate.syncUi==='function')gate.syncUi();
    setTitle('manga');syncHeaderRoute();
  }catch(_){
    if(routeRuntime)cleanupMangaRoute(routeRuntime);
    if(generation===renderGeneration)target.innerHTML='<section class="profileContent"><h2>漫画一覧を読み込めませんでした</h2><p>ホームへ戻って再試行してください。</p><a class="glassBtn" href="home.html">ホームへ戻る</a></section>';
  }
}
async function renderReader(route=routeName(),generation=renderGeneration){
  const target=getMount();
  if(!target)return;
  try{
    if(!window.ReaderRouteRuntimeFactory) await loadScript('reader-route-runtime.js?v=20260922-route-runtime','spaReaderRouteRuntime');
    const runtime=window.ReaderRouteRuntimeFactory.create({
      cleanup:cleanupReaderRuntime,
      setTitle,
      setEditing:(value)=>{editing=value;},
      getMount,
      createLoading:()=>{const loading=document.createElement('p');loading.className='syncStatus';loading.textContent='読み込み中…';return loading;},
      fetchReader:()=>fetch('reader.html?v=20260926-reader-startup-fix',{cache:'no-store'}),
      parseHtml:(html)=>new DOMParser().parseFromString(html,'text/html'),
      installHeadAssets:installReaderHeadAssets,
      mountBody:(doc)=>target.replaceChildren(...[...doc.body.children].filter((node)=>node.tagName!=='SCRIPT')),
      loadMediaGate:()=>window.MangaReaderMediaAccess?Promise.resolve():loadReaderAsset('media-access-gate.js?v=20260926-non-jp-vpn'),
      getScripts:(doc)=>[...doc.querySelectorAll('script')],
      loadScript:loadReaderScript,
      getGeneration:()=>renderGeneration,
      ensureVideoEntryEnhancement,
      prune:pruneReaderSurface,
      activate:activateReaderEntry,
      sync:syncHeaderRoute,
      renderError:(mount)=>{mount.innerHTML='<section class="profileContent"><h2>漫画を読み込めませんでした</h2><p>ホームへ戻って再試行してください。</p><a class="glassBtn" href="home.html">ホームへ戻る</a></section>';}
    });
    await runtime.render(route,generation);
  }catch(_){
    if(generation===renderGeneration)target.innerHTML='<section class="profileContent"><h2>漫画を読み込めませんでした</h2><p>ホームへ戻って再試行してください。</p><a class="glassBtn" href="home.html">ホームへ戻る</a></section>';
  }
}
function renderRoute(){ensureAppShell();const route=routeName(),generation=++renderGeneration,app=document.getElementById('homeApp');document.documentElement.classList.toggle('reader-entry-manga',route==='manga');document.documentElement.classList.toggle('reader-entry-video',route==='video');if(app){app.classList.toggle('reader-route',['manga','video','reader'].includes(route));app.dataset.readerRoute=route;}if(route!=='video')cleanupVideoRoute();if(!['manga','video','reader'].includes(route))cleanupReaderRuntime();else if(route!=='manga'&&route!=='video')cleanupMangaRoute();if(route==='profile')renderProfile();else if(route==='manga')renderManga(generation);else if(route==='video')renderVideo(generation);else if(route==='reader')renderReader(route,generation);else renderHome();document.dispatchEvent(new CustomEvent('home-profile-routechange',{detail:{route}}));}
let lastVpnRouteStatus='';
function handleVpnStatusChange(event){
  const route=routeName();
  if(route!=='manga'&&route!=='video')return;
  const next=String(event&&event.detail&&event.detail.status||'');
  if(next!=='allowed'&&next!=='blocked')return;
  const marker=route+':'+next;
  if(marker===lastVpnRouteStatus)return;
  lastVpnRouteStatus=marker;
  renderRoute();
}
function navigate(path,{replace=false}={}){const target=new URL(path,location.href),name=target.pathname.split('/').pop();if(!SPA_PAGES.includes(name)){location.href=target.href;return;}if(replace)history.replaceState({appShellSPA:true},'',target.href);else history.pushState({appShellSPA:true},'',target.href);renderRoute();}
function intercept(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const link=event.target.closest('a[href]');if(!link||link.target||link.hasAttribute('download'))return;const target=new URL(link.href,location.href),name=target.pathname.split('/').pop();if(target.origin===location.origin&&SPA_PAGES.includes(name)){event.preventDefault();navigate(target.href);}}
async function start(){
  ensureAppShell();
  if(!session||!session.refresh_token||!config.url||!config.publishableKey){showLogin();return;}if(!MangaVault.loadActive()){showVault();return;}try{await MangaVault.refreshSession();document.documentElement.classList.remove('auth-pending');}catch(_){MangaVault.saveSession(null);showLogin();return;}applyTheme(currentTheme());document.addEventListener('click',intercept);document.addEventListener('manga-reader-vpn-status',handleVpnStatusChange);window.addEventListener('popstate',renderRoute);renderRoute();
}
window.HomeProfileSPA={navigate,renderRoute,ensureAppShell};
start();
})();
