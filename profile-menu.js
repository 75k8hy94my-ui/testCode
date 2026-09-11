(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const DEVICE_DATA_KEYS = () => [...Object.values((window.MangaVaultPayload && MangaVaultPayload.DATA_KEYS) || {}),'mangaReaderLastUrl','mangaReaderSavedUrls','mangaReaderGithubSync','mangaReaderVaultSyncMeta'];
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
  function install() {
    if (!window.matchMedia || !window.matchMedia('(min-width: 900px)').matches) return;
    const nav = document.getElementById('appDesktopRail') || document.getElementById('desktopReaderNav');
    if (!nav) { requestAnimationFrame(install); return; }
    const trigger = nav.querySelector('#desktopNavHome');
    if (!trigger || trigger.dataset.profileMenuInstalled === '1') return;
    trigger.dataset.profileMenuInstalled = '1'; trigger.removeAttribute('href'); trigger.removeAttribute('aria-current'); trigger.classList.remove('active'); trigger.setAttribute('role','button'); trigger.setAttribute('aria-haspopup','menu'); trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-label','アカウント');
    const menu = document.createElement('div'); menu.id='desktopProfileMenu'; menu.hidden=true; menu.setAttribute('role','menu'); menu.innerHTML='<button type="button" role="menuitem" data-profile-route>プロフィール設定</button><button type="button" role="menuitem" data-logout>ログアウト</button>'; document.body.appendChild(menu);
    const style=document.createElement('style'); style.textContent='@media(min-width:900px){#desktopProfileMenu{position:fixed;z-index:1200;left:66px;top:62px;width:170px;padding:4px;background:#fff;border:1px solid #dfe3e8;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.14)}#desktopProfileMenu a,#desktopProfileMenu button{width:100%;min-height:38px;padding:0 10px;border:0;border-radius:4px;background:transparent;color:#202124;display:flex;align-items:center;text-align:left;text-decoration:none;font:inherit;font-size:13px;cursor:pointer}#desktopProfileMenu a:hover,#desktopProfileMenu button:hover{background:#f1f3f5}}@media(max-width:899px){#desktopProfileMenu{display:none!important}}'; document.head.appendChild(style);
    const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
    trigger.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',menu.hidden?'false':'true');});
    menu.addEventListener('click',(event)=>event.stopPropagation());
    menu.querySelector('[data-profile-route]').addEventListener('click',()=>{close();if(window.HomeProfileSPA)window.HomeProfileSPA.navigate('profile.html');});
    menu.querySelector('[data-logout]').addEventListener('click',()=>logout(menu.querySelector('[data-logout]')));
    document.addEventListener('click',close); document.addEventListener('keydown',(event)=>{if(event.key==='Escape')close();});
    document.addEventListener('home-profile-routechange',close);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();