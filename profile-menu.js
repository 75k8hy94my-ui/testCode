(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const DEVICE_DATA_KEYS = () => [...Object.values((window.MangaVaultPayload && MangaVaultPayload.DATA_KEYS) || {}),'mangaReaderLastUrl','mangaReaderSavedUrls','mangaReaderGithubSync','mangaReaderVaultSyncMeta'];
  let menu=null, activeTrigger=null;

  async function logout(button) {
    if (!confirm('ログアウトしますか？')) return;
    if (button) button.disabled = true;
    const session = window.MangaVault && MangaVault.loadSession();
    try { await MangaVault.withSession((token) => MangaVault.api('/auth/v1/logout', { method:'POST', token })); } catch (_) {}
    try { if (session && session.user && session.user.id && window.EncryptedChunkCache) await EncryptedChunkCache.clearAll({ dbName:`${EncryptedChunkCache.DB_NAME}:${session.user.id}` }); } catch (_) {}
    if (window.MangaVault) { MangaVault.clearActive(); MangaVault.saveSession(null); localStorage.removeItem(MangaVault.META_KEY); }
    DEVICE_DATA_KEYS().forEach((key) => localStorage.removeItem(key));
    Object.keys(localStorage).filter((key) => key.startsWith('mangaReaderSavedVaultPassphrase:')).forEach((key) => localStorage.removeItem(key));
    window.location.replace('index.html');
  }

  function openProfile() {
    if (window.HomeProfileSPA && typeof window.HomeProfileSPA.navigate === 'function') {
      window.HomeProfileSPA.navigate('profile.html');
      return;
    }
    window.location.assign('profile.html');
  }

  function ensureStyle() {
    if (document.getElementById('profileMenuSharedStyle')) return;
    const style=document.createElement('style');
    style.id='profileMenuSharedStyle';
    style.textContent='.homeHeader[data-profile-only-header="1"]{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important}.headerProfileButton{appearance:none;width:38px;height:38px;min-width:38px;padding:0;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}.headerProfileButton svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.headerProfileButton:hover{background:rgba(255,255,255,.14)}#desktopProfileMenu{position:fixed;z-index:1300;width:170px;padding:4px;background:#fff;border:1px solid #dfe3e8;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);color:#202124}#desktopProfileMenu[data-anchor="header"]{right:12px;top:58px;left:auto}#desktopProfileMenu[data-anchor="rail"]{left:66px;top:62px;right:auto}#desktopProfileMenu button{width:100%;min-height:38px;padding:0 10px;border:0;border-radius:4px;background:transparent;color:#202124;display:flex;align-items:center;text-align:left;font:inherit;font-size:13px;cursor:pointer}#desktopProfileMenu button:hover,#desktopProfileMenu button:focus-visible{background:#f1f3f5;outline:none}@media(max-width:899px){.homeHeader[data-profile-only-header="1"],#appGlobalHeader.globalAppHeader{display:flex!important;align-items:center!important;justify-content:space-between!important}.homeHeader[data-profile-only-header="1"] .headerProfileButton{color:#202124;border-color:#dfe3e8}.homeHeader[data-profile-only-header="1"] .headerProfileButton:hover{background:#f1f3f5}#desktopProfileMenu{right:12px!important;top:64px!important;left:auto!important;width:min(170px,calc(100vw - 24px))}}';
    document.head.appendChild(style);
  }

  function ensureMenu() {
    ensureStyle();
    if (menu && menu.isConnected) return menu;
    menu=document.getElementById('desktopProfileMenu');
    if(!menu){
      menu=document.createElement('div');
      menu.id='desktopProfileMenu';
      menu.hidden=true;
      menu.setAttribute('role','menu');
      menu.innerHTML='<button type="button" role="menuitem" data-profile-route>プロフィール設定</button><button type="button" role="menuitem" data-logout>ログアウト</button>';
      document.body.appendChild(menu);
      menu.addEventListener('click',(event)=>event.stopPropagation());
      menu.querySelector('[data-profile-route]').addEventListener('click',()=>{close();openProfile();});
      menu.querySelector('[data-logout]').addEventListener('click',()=>logout(menu.querySelector('[data-logout]')));
    }
    return menu;
  }

  function close() {
    if(menu) menu.hidden=true;
    if(activeTrigger) activeTrigger.setAttribute('aria-expanded','false');
    activeTrigger=null;
  }

  function openFrom(trigger) {
    const accountMenu=ensureMenu();
    const same=activeTrigger===trigger&&!accountMenu.hidden;
    close();
    if(same) return;
    activeTrigger=trigger;
    accountMenu.dataset.anchor=trigger.id==='desktopProfileButton'?'rail':'header';
    accountMenu.hidden=false;
    trigger.setAttribute('aria-expanded','true');
  }

  function installTrigger(trigger) {
    if(!trigger||trigger.dataset.profileMenuInstalled==='1') return;
    trigger.dataset.profileMenuInstalled='1';
    trigger.removeAttribute('href');
    trigger.removeAttribute('aria-current');
    trigger.classList.remove('active');
    trigger.setAttribute('role','button');
    trigger.setAttribute('aria-haspopup','menu');
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-label','アカウント');
    trigger.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();openFrom(trigger);});
  }

  function install() {
    ensureStyle();
    document.querySelectorAll('[data-profile-menu-trigger], #desktopProfileButton').forEach(installTrigger);
  }

  window.ProfileMenu={logout,openProfile,install};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  document.addEventListener('manga-reader-desktop-nav-ready',install);
  document.addEventListener('home-profile-routechange',()=>{close();install();});
  document.addEventListener('click',close);
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape')close();});
  window.addEventListener('resize',close);
})();