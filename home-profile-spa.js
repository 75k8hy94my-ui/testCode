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
const guestMode=window.TestCodeGuest?.isActive()===true;
const session=guestMode?null:window.MangaVault&&MangaVault.loadSession();
const SPA_PAGES=(window.AppShell&&Array.isArray(AppShell.SPA_PAGES)?AppShell.SPA_PAGES:['home.html','profile.html','manga.html','video.html']);
let layout=Home?Home.loadLayout():[];
let editing=false,syncRunning=false,syncDirty=false,syncDirtyMessage='',profileSecurityBusy=false;
let mount=null,renderGeneration=0,mangaRouteRuntime=null,mangaRouteBootPromise=null,videoRouteRuntime=null,lastVpnRouteAccess='',skipNextPopstate=false,lastSpaUrl=location.href;

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
    const nav=document.createElement('nav');nav.id='mobileBottomNav';nav.className='mobileBottomNav';nav.setAttribute('aria-label','モバイルメニュー');nav.innerHTML='<a href="home.html">ホーム</a><a href="manga.html">漫画</a><a href="images.html">画像</a><a href="video.html">動画</a><a href="profile.html">プロフィール</a>';app.append(nav);
  }
  mount=document.getElementById('routeContent');
  return mount;
}

function getMount(){
  if(!mount || !mount.isConnected) mount=document.getElementById('routeContent')||ensureAppShell();
  return mount;
}

function routeName(path=location.pathname){const name=path.split('/').pop();if(name==='profile.html')return'profile';if(name==='manga.html')return'manga';if(name==='video.html')return'video';return'home';}
function setTitle(route){const titles={home:'ホーム',profile:'プロフィール設定',manga:'漫画',video:'動画'};const title=titles[route]||titles.home;document.title=title;const h1=document.getElementById('shellTitle');if(h1)h1.textContent=title;}
function setSyncStatus(text){const node=$('homeSyncStatus');if(!node)return;node.textContent=text||'';}
function canSyncProtectedData(){if(guestMode)return false;const gate=window.MangaReaderMediaAccess;return !!gate&&typeof gate.canReadProtectedData==='function'&&gate.canReadProtectedData()===true;}
async function runHomeSync(okMessage){if(guestMode){setSyncStatus('端末内に保存しました（ゲスト・同期なし）');return;}if(!canSyncProtectedData()){syncDirty=false;syncDirtyMessage='';setSyncStatus('VPN接続を確認できるまでクラウド同期を停止しています。');return;}if(syncRunning){syncDirty=true;syncDirtyMessage=okMessage||syncDirtyMessage;return;}syncRunning=true;setSyncStatus('同期中…');try{if(!canSyncProtectedData())return;await MangaVault.saveLocalChanges();setSyncStatus(okMessage||'保存しました');}catch(error){setSyncStatus('端末には保存済みです。クラウド同期: '+(error&&error.message?error.message:'失敗'));}finally{syncRunning=false;if(syncDirty){syncDirty=false;const queued=syncDirtyMessage;syncDirtyMessage='';runHomeSync(queued);}}}
function commitLayout(next){layout=Home.saveLayout(next);renderHome();runHomeSync('ホームの並びを保存しました');}
function cardTop(card){const top=document.createElement('div');top.className='cardTop';const mark=document.createElement('span');mark.className='cardMark';mark.textContent=marks[card.id]||'・';const badge=document.createElement('span');badge.className='cardBadge';badge.textContent=card.badge||'';top.append(mark,badge);return top;}
function addCardText(root,card){root.append(cardTop(card));const title=document.createElement('h2');title.textContent=card.title;root.append(title);}
function buildCard(id,index){const card=Home.CARD_CATALOG[id];if(!card)return null;const article=document.createElement('article');article.className='homeCard';article.dataset.kind=card.kind;if(!editing){const link=document.createElement('a');link.className='homeCardLink';link.href=card.href;if(card.kind==='official'){link.target='_blank';link.rel='noopener noreferrer';}addCardText(link,card);const hint=document.createElement('span');hint.className='openHint';hint.textContent=card.kind==='official'?'公式サイトを開く ↗':'開く →';link.append(hint);article.append(link);return article;}const body=document.createElement('div');body.className='editCardBody';addCardText(body,card);article.append(body);const controls=document.createElement('div');controls.className='cardEditControls';const up=document.createElement('button');up.type='button';up.textContent='↑';up.disabled=index===0;up.addEventListener('click',()=>commitLayout(Home.moveCard(layout,id,-1)));const down=document.createElement('button');down.type='button';down.textContent='↓';down.disabled=index===layout.length-1;down.addEventListener('click',()=>commitLayout(Home.moveCard(layout,id,1)));const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='削除';remove.addEventListener('click',()=>commitLayout(Home.removeCard(layout,id)));controls.append(up,down,remove);article.append(controls);return article;}
function renderAddPanel(list){list.replaceChildren();Home.hiddenCardIds(layout).forEach((id)=>{const card=Home.CARD_CATALOG[id],button=document.createElement('button');button.className='addCardButton';button.type='button';const title=document.createElement('strong');title.textContent='+ '+card.title;button.append(title);button.addEventListener('click',()=>commitLayout(Home.addCard(layout,id)));list.append(button);});}
function renderHome(){const target=getMount();if(!target)return;setTitle('home');target.innerHTML='<p id="homeSyncStatus" class="syncStatus" aria-live="polite"></p><section id="homeGrid" class="homeGrid" aria-label="ホームカード"></section><section id="homeEmpty" class="emptyState" hidden><strong>ホームにカードがありません</strong><button id="emptyEditBtn" class="glassBtn" type="button">カードを追加</button></section><section id="addCardPanel" class="addPanel" hidden><h2>カードを追加</h2><div id="addCardList" class="addCardList"></div></section>';const grid=$('homeGrid'),empty=$('homeEmpty'),addPanel=$('addCardPanel'),addList=$('addCardList'),edit=$('editHomeBtn');grid.replaceChildren();layout.forEach((id,index)=>{const node=buildCard(id,index);if(node)grid.append(node);});empty.hidden=layout.length>0;addPanel.hidden=!editing;if(edit){edit.hidden=true;}$('emptyEditBtn').onclick=()=>{editing=true;renderHome();};if(editing)renderAddPanel(addList);syncHeaderRoute();}
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
  target.innerHTML=`<section class="profileContent"><p id="homeSyncStatus" class="syncStatus profileToastStatus" aria-live="polite"></p><h2>プロフィール設定</h2><section class="profileCard profileAvatarCard"><h3>プロフィール画像</h3><div class="profileAvatarRow"><div class="profileAvatarPreview" aria-hidden="true"><img id="profileAvatarPreview" alt="" hidden><span id="profileAvatarPlaceholder">アカウント</span></div><div class="profileAvatarSettings"><input id="profileAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden><div class="profileSecurityActions"><button class="glassBtn profileAction" id="profileAvatarChooseBtn" type="button">画像を選択</button><button class="glassBtn" id="profileAvatarRemoveBtn" type="button">画像を削除</button></div><p id="profileAvatarStatus" class="profileAvatarStatus" role="status" aria-live="polite"></p></div></div></section><dl class="profileMeta"><div><dt>ログイン中</dt><dd id="profileEmail"></dd></div></dl><section class="profileCard profileShortsCard"><h3>縦スワイプ動画</h3><p class="profileLead">次回の縦スワイプ再生順とランダム区間を作り直します。</p><button class="glassBtn profileAction" id="profileShortsResetBtn" type="button" disabled>再生順をリセット</button><p class="profileSecurityStatus" id="profileShortsResetStatus" role="status" aria-live="polite"></p></section><section class="profileCard"><h3>保管庫</h3><a class="glassBtn profileAction" href="sync.html">保管庫を開く</a></section><section class="profileCard profileSecurityCard"><h3>認証方法</h3><div class="profileSecurityFields"><label class="profileField">現在のパスフレーズ<input id="profileCurrentPassphrase" type="password" autocomplete="current-password"></label><div class="profileSecurityActions"><button class="glassBtn profileAction" id="profilePasskeyRegisterBtn" type="button" data-profile-security-action>パスキーを設定</button><button class="glassBtn profileDanger" id="profilePasskeyRemoveBtn" type="button" data-profile-security-action>登録済みパスキーを解除</button></div><label class="profileField">新しいパスフレーズ<input id="profileNewPassphrase" type="password" autocomplete="new-password"></label><label class="profileField">新しいパスフレーズ（確認）<input id="profileNewPassphraseConfirm" type="password" autocomplete="new-password"></label><button class="glassBtn profileAction" id="profilePassphraseResetBtn" type="button" data-profile-security-action>パスキーで本人確認して再設定</button></div><p id="profileSecurityStatus" class="profileSecurityStatus" role="status" aria-live="polite"></p></section><section class="profileCard"><h3>VPN診断</h3><div id="profileNonVpnIps"></div></section><section class="profileCard"><h3>表示</h3><label class="profileThemeRow"><span>ライトテーマ</span><span class="iosSwitch"><input id="profileThemeLight" type="checkbox" role="switch" aria-label="ライトテーマ"><span class="iosSwitchTrack" aria-hidden="true"></span></span></label></section><section class="profileCard"><h3>セッション</h3><div class="profileSecurityActions"><button class="glassBtn profileAction" id="profileLockBtn" type="button">ロック</button><button class="glassBtn profileDanger" id="profileLogoutBtn" type="button">アカウントからログアウト</button></div></section></section>`;
  const shortsResetButton=$('profileShortsResetBtn'),shortsResetStatus=$('profileShortsResetStatus');
  const canResetShortsQueue=()=>{const gate=window.MangaReaderMediaAccess;return !!gate&&typeof gate.canReadProtectedData==='function'&&gate.canReadProtectedData()===true;};
  const refreshShortsResetAccess=()=>{if(shortsResetButton)shortsResetButton.disabled=!canResetShortsQueue();};
  refreshShortsResetAccess();
  shortsResetButton?.addEventListener('click',()=>{
    if(!canResetShortsQueue()){if(shortsResetStatus)shortsResetStatus.textContent='VPN接続を確認できるまで実行できません。';return;}
    const state=window.MangaReaderVideoShortsState;
    const saved=state&&typeof state.reset==='function'?state.reset({guest:guestMode}):null;
    if(!saved){if(shortsResetStatus){shortsResetStatus.textContent='再生順をリセットできませんでした。';shortsResetStatus.dataset.state='error';}return;}
    if(shortsResetStatus){shortsResetStatus.textContent='再生順をリセットしました。';shortsResetStatus.dataset.state='ok';}
  });
  const mail=$('profileEmail');if(mail)mail.textContent=guestMode?'ゲスト（端末内のみ）':(email||'（メール未取得）');
  if(guestMode){
    target.querySelectorAll('.profileSecurityCard, .profileCard:has(a[href="sync.html"]), .profileCard:has(#profileNonVpnIps)').forEach((element)=>{element.hidden=true;element.style.display='none';});
    const lock=$('profileLockBtn');if(lock){lock.hidden=true;lock.style.display='none';}
    const exit=$('profileLogoutBtn');if(exit)exit.textContent='ゲストモードを終了してログインへ';
  }
  const avatarApi=window.ProfileAvatar;
  const avatarInput=$('profileAvatarInput'),avatarChoose=$('profileAvatarChooseBtn'),avatarRemove=$('profileAvatarRemoveBtn');
  const avatarStatus=$('profileAvatarStatus'),avatarPreview=$('profileAvatarPreview'),avatarPlaceholder=$('profileAvatarPlaceholder');
  const refreshProfileAvatar=()=>{
    const source=avatarApi?.read()||'';
    if(avatarPreview){avatarPreview.hidden=!source;avatarPreview.removeAttribute('src');if(source)avatarPreview.src=source;}
    if(avatarPlaceholder)avatarPlaceholder.hidden=!!source;
    if(avatarRemove)avatarRemove.disabled=!source;
    window.ProfileMenu?.refreshAvatar?.();
  };
  const setAvatarStatus=(message,error=false)=>{if(avatarStatus){avatarStatus.textContent=message;avatarStatus.dataset.state=error?'error':'ok';}};
  const setAvatarBusy=(busy)=>{if(avatarChoose)avatarChoose.disabled=busy;if(avatarRemove)avatarRemove.disabled=busy||!avatarApi?.read();};
  refreshProfileAvatar();
  avatarChoose?.addEventListener('click',()=>avatarInput?.click());
  avatarInput?.addEventListener('change',async()=>{
    const file=avatarInput.files?.[0];
    if(!file)return;
    setAvatarBusy(true);
    setAvatarStatus('画像を処理しています…');
    try{
      const encoded=await avatarApi.fromFile(file);
      avatarApi.write(encoded);
      refreshProfileAvatar();
      document.dispatchEvent(new Event('testcode-profile-avatar-change'));
      setAvatarStatus('端末に保存しました。クラウド同期を実行します。');
      await runHomeSync('プロフィール画像を同期しました');
    }catch(error){setAvatarStatus(error?.message||'画像の設定に失敗しました。',true);}
    finally{avatarInput.value='';setAvatarBusy(false);}
  });
  avatarRemove?.addEventListener('click',async()=>{
    setAvatarBusy(true);
    try{
      avatarApi.write('');
      refreshProfileAvatar();
      document.dispatchEvent(new Event('testcode-profile-avatar-change'));
      setAvatarStatus('画像を削除しました。クラウド同期を実行します。');
      await runHomeSync('プロフィール画像の削除を同期しました');
    }catch(error){setAvatarStatus(error?.message||'画像を削除できませんでした。',true);}
    finally{setAvatarBusy(false);}
  });
  const theme=$('profileThemeLight');if(theme){theme.checked=light;theme.addEventListener('change',()=>{applyTheme(theme.checked?'light':'dark');runHomeSync('保存しました')});}
  const currentPassphrase=$('profileCurrentPassphrase');
  const registerPasskey=$('profilePasskeyRegisterBtn');if(registerPasskey)registerPasskey.addEventListener('click',()=>{const value=currentPassphrase&&currentPassphrase.value;if(!value){setProfileSecurityStatus('現在のパスフレーズを入力してください。',true);return;}runProfileSecurity(()=>MangaVault.registerPasskey(value),'パスキーを設定しました。');});
  const removePasskey=$('profilePasskeyRemoveBtn');if(removePasskey)removePasskey.addEventListener('click',()=>{const value=currentPassphrase&&currentPassphrase.value;if(!value){setProfileSecurityStatus('現在のパスフレーズを入力してください。',true);return;}runProfileSecurity(()=>MangaVault.removePasskeys(value),'登録済みパスキーを解除しました。');});
  const resetPassphrase=$('profilePassphraseResetBtn');if(resetPassphrase)resetPassphrase.addEventListener('click',()=>{const next=$('profileNewPassphrase');const confirmation=$('profileNewPassphraseConfirm');if(!next||!next.value){setProfileSecurityStatus('新しいパスフレーズを入力してください。',true);return;}if(!confirmation||next.value!==confirmation.value){setProfileSecurityStatus('新しいパスフレーズが一致しません。',true);return;}runProfileSecurity(()=>MangaVault.changePassphrase(next.value),'パスフレーズを再設定しました。');});
  const lockBtn=$('profileLockBtn');if(lockBtn)lockBtn.addEventListener('click',()=>{if(window.ProfileMenu&&typeof ProfileMenu.lock==='function')ProfileMenu.lock(lockBtn);});
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
  const gateStatus=window.MangaReaderMediaAccess&&window.MangaReaderMediaAccess.getStatus();
  const checking=gateStatus==='pending'||gateStatus==='checking';
  const section=document.createElement('section');section.className='vpnRouteGate profileContent';section.setAttribute('aria-live','polite');
  const heading=document.createElement('h2');heading.textContent=route==='video'?'動画一覧を開くにはVPN接続が必要です':'漫画一覧を開くにはVPN接続が必要です';
  const message=document.createElement('p');message.className='profileLead';message.textContent='VPN接続を確認できるまで、保存データと一覧を表示しません。接続後に再確認してください。';
  if(checking){heading.textContent=route==='video'?'動画を読み込んでいます':'本棚を読み込んでいます';message.textContent='VPN接続を確認しています。';section.classList.add('vpnRouteChecking');}
  const actions=document.createElement('div');actions.className='vpnRouteActions';
  const button=document.createElement('button');button.type='button';button.className='glassBtn vpnStatusButton';button.dataset.vpnStatusButton='1';button.dataset.vpnRecheckButton='1';button.textContent=checking?'VPN確認中':'VPN接続を再確認';button.title='VPN接続を完全に再確認します。';button.disabled=checking;
  const diagnostics=document.createElement('button');diagnostics.type='button';diagnostics.className='glassBtn vpnDiagnosticsButton';diagnostics.dataset.vpnDiagnosticsButton='1';diagnostics.textContent='VPN診断';diagnostics.title='VPN判定の詳細を表示します。';
  actions.append(button,diagnostics);section.append(heading,message,actions);target.append(section);
}
async function ensureVpnGate(){
  if(window.MangaReaderMediaAccess)return window.MangaReaderMediaAccess;
  await loadScript('media-access-gate.js?v=20261009-guest-mode','spaMediaGate');
  return window.MangaReaderMediaAccess;
}
function cleanupMangaShell(){cleanupMangaRoute();document.querySelectorAll('#metadataSuggestions,#saveDialogOverlay,#customAddOverlay,#editItemOverlay,#bulkEditOverlay,#bulkDetectOverlay,#savedListOverlay,#tocOverlay').forEach((node)=>node.remove());}
async function renderVideo(generation){
  const target=getMount();
  if(!target)return;
  cleanupMangaShell();
  target.replaceChildren();
  try{
    const gate=await ensureVpnGate();
    if(generation!==renderGeneration)return;
    if(!gate){renderVpnGate(target,'video');setTitle('video');syncHeaderRoute();return;}
    if(!window.VideoListRouteFactory)await loadScript('video-list-route.js?v=20261010-local-first-save','spaVideoListRoute');
    if(!window.MangaReaderVideoTemplate)await loadScript('video-list-template.js?v=20260922-vpn-tools','spaVideoListTemplate');
    if(generation!==renderGeneration)return;
    if(!videoRouteRuntime)videoRouteRuntime=window.VideoListRouteFactory.create({
      documentRef:document,
      loadScript,
      loadMediaGate:()=>window.MangaReaderMediaAccess?Promise.resolve():loadScript('media-access-gate.js?v=20261009-guest-mode','spaMediaGate'),
      mediaAccess:gate,
    });
    await videoRouteRuntime.start({mountElement:target});
    if(gate&&typeof gate.syncUi==='function')gate.syncUi();
    if(generation!==renderGeneration)return;
    setTitle('video');syncHeaderRoute();
  }catch(_){
    if(generation===renderGeneration)target.innerHTML='<section class="profileContent"><h2>動画一覧を読み込めませんでした</h2><p>ホームへ戻って再試行してください。</p><a class="glassBtn" href="home.html">ホームへ戻る</a></section>';
  }
}
async function renderManga(generation){
  const target=getMount();
  if(!target)return;
  cleanupMangaShell();
  target.replaceChildren();
  let routeRuntime=null;
  try{
    const gate=await ensureVpnGate();
    if(generation!==renderGeneration)return;
    if(!gate){renderVpnGate(target,'manga');setTitle('manga');syncHeaderRoute();return;}
    if(!window.MangaListRouteFactory) await loadScript('manga-list-route.js?v=20261010-sync-validation','spaMangaListRoute');
    if(generation!==renderGeneration)return;
    routeRuntime=window.MangaListRouteFactory.create({documentRef:document,windowRef:window,mediaAccess:gate});
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
function renderRoute(){ensureAppShell();const route=routeName(),generation=++renderGeneration,app=document.getElementById('homeApp');if(route==='manga'||route==='video'){const gate=window.MangaReaderMediaAccess;lastVpnRouteAccess=route+':'+(gate&&gate.canReadProtectedData&&gate.canReadProtectedData()?'allowed':'blocked');}else lastVpnRouteAccess='';document.documentElement.classList.toggle('reader-entry-manga',route==='manga');document.documentElement.classList.toggle('reader-entry-video',route==='video');if(app){app.classList.toggle('reader-route',['manga','video'].includes(route));app.dataset.readerRoute=route;}if(route!=='video')cleanupVideoRoute();if(route!=='manga')cleanupMangaShell();if(route==='profile')renderProfile();else if(route==='manga')renderManga(generation);else if(route==='video')renderVideo(generation);else renderHome();document.dispatchEvent(new CustomEvent('home-profile-routechange',{detail:{route}}));}
function handleVpnStatusChange(event){
  const route=routeName();
  const next=String(event&&event.detail&&event.detail.status||'');
  if(next!=='allowed'){syncDirty=false;syncDirtyMessage='';}
  if(route!=='manga'&&route!=='video')return;
  if(next==='pending'||next==='checking'){
    if(lastVpnRouteAccess!==route+':allowed')return;
    lastVpnRouteAccess=route+':blocked';
    renderRoute();
    return;
  }
  if(next!=='allowed'&&next!=='blocked')return;
  const marker=route+':'+(next==='allowed'?'allowed':'blocked');
  if(marker===lastVpnRouteAccess)return;
  lastVpnRouteAccess=marker;
  renderRoute();
}
function navigate(path,{replace=false}={}){const target=new URL(path,location.href),name=target.pathname.split('/').pop();if(!SPA_PAGES.includes(name)){location.href=target.href;return;}if(replace)history.replaceState({appShellSPA:true},'',target.href);else history.pushState({appShellSPA:true},'',target.href);lastSpaUrl=location.href;renderRoute();}
function confirmPendingSyncLeave(){return guestMode||!window.MangaVault||typeof MangaVault.hasPendingLocalChanges!=='function'||!MangaVault.hasPendingLocalChanges()||window.confirm('クラウド同期が完了していません。変更は端末に保存済みです。ページを移動しますか？');}
function intercept(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const link=event.target.closest('a[href]');if(!link||link.target||link.hasAttribute('download'))return;const target=new URL(link.href,location.href),name=target.pathname.split('/').pop();if(target.origin===location.origin&&SPA_PAGES.includes(name)){if(!confirmPendingSyncLeave()){event.preventDefault();return;}event.preventDefault();navigate(target.href);}}
function handleRoutePopstate(){if(skipNextPopstate){skipNextPopstate=false;lastSpaUrl=location.href;return;}if(location.href===lastSpaUrl)return;if(!confirmPendingSyncLeave()){skipNextPopstate=true;history.forward();return;}lastSpaUrl=location.href;renderRoute();}
async function start(){
  ensureAppShell();
  if(guestMode){
    document.documentElement.classList.remove('auth-pending');
    applyTheme(currentTheme());
    document.addEventListener('click',intercept);
    document.addEventListener('manga-reader-vpn-status',handleVpnStatusChange);
    window.addEventListener('popstate',handleRoutePopstate);
    renderRoute();
    return;
  }
  if(!session||!session.refresh_token||!config.url||!config.publishableKey){showLogin();return;}if(!MangaVault.loadActive()){showVault();return;}try{await MangaVault.ensureSession();document.documentElement.classList.remove('auth-pending');}catch(error){if(typeof MangaVault.isSessionAuthError==='function'&&MangaVault.isSessionAuthError(error))MangaVault.saveSession(null);showLogin();return;}applyTheme(currentTheme());document.addEventListener('click',intercept);document.addEventListener('manga-reader-vpn-status',handleVpnStatusChange);window.addEventListener('popstate',handleRoutePopstate);renderRoute();
}
window.HomeProfileSPA={navigate,renderRoute,ensureAppShell};
start();
})();

