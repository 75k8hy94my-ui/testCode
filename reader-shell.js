(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.ReaderShell) return;

  const routes = Object.freeze([
    ['saved-list', '本棚', '本'],
    ['video-list', '動画', '動画'],
    ['author-cards', '作者', '作者'],
    ['settings', '設定', '設定'],
    ['backup', '保管庫', '保管庫']
  ]);
  window.ReaderRoutes = window.ReaderRoutes || {};
  let mountedRoute = null;
  const routeContainer = () => document.getElementById('app') || document.body;

  function getScreen() {
    const match = String(location.hash || '').match(/(?:^#|&)screen=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : 'saved-list';
  }

  function setScreen(screen, replace = false) {
    const next = routes.some(([key]) => key === screen) ? screen : 'saved-list';
    const url = new URL(location.href);
    url.hash = `screen=${encodeURIComponent(next)}`;
    const state = { ...(history.state || {}), readerScreen: next };
    if (replace) history.replaceState(state, '', url);
    else history.pushState(state, '', url);
    window.dispatchEvent(new Event('hashchange'));
    syncActive();
  }

  function shellMarkup() {
    return '<header class="homeHeader" id="readerShellHeader" data-profile-only-header="1"><div><h1 id="readerShellTitle">漫画</h1></div><button class="headerProfileButton" type="button" data-profile-menu-trigger aria-label="アカウント" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg></button></header>';
  }

  function install() {
    if (document.getElementById('readerShellHeader') || document.querySelector('.homeHeader')) return;
    installShellStyle();
    document.body.insertAdjacentHTML('afterbegin', shellMarkup());
    document.documentElement.classList.add('reader-shell-page');
    document.querySelectorAll('[data-reader-route]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = new URL(link.href, location.href);
        if (target.origin !== location.origin || target.pathname !== location.pathname) return;
        event.preventDefault();
        setScreen(target.hash.replace(/^#screen=/, '') || 'saved-list');
      });
    });
    syncActive();
  }

  function installShellStyle() {
    if (document.getElementById('readerShellStyle')) return;
    const style = document.createElement('style');
    style.id = 'readerShellStyle';
    style.textContent = `
      #readerShellHeader.homeHeader {
        position: fixed !important;
        z-index: 1100 !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: auto !important;
        height: 54px !important;
        min-height: 54px !important;
        margin: 0 !important;
        padding: 0 18px 0 74px !important;
        background: #1769aa !important;
        color: #fff !important;
        border-bottom: 1px solid rgba(0,0,0,.08) !important;
        box-shadow: none !important;
      }
      #readerShellHeader.homeHeader h1 { color: #fff !important; }
      #readerShellHeader.homeHeader .glassBtn { color: #fff !important; }
      #readerShellHeader.homeHeader .glassBtn:hover { background: rgba(255,255,255,.14) !important; }
      @media (min-width: 900px) {
        html.reader-shell-page #app { padding-top: 54px !important; }
      }
      @media (max-width: 899px) {
        #readerShellHeader.homeHeader { position: static !important; height: auto !important; min-height: 0 !important; padding: 18px !important; background: #fff !important; color: #202124 !important; }
        #readerShellHeader.homeHeader h1, #readerShellHeader.homeHeader .glassBtn { color: #202124 !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function syncActive() {
    const screen = getScreen();
    document.querySelectorAll('[data-reader-route]').forEach((link) => {
      const active = link.dataset.readerRoute === screen;
      link.classList.toggle('active', active);
      link.classList.toggle('topActionCurrent', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const route = window.ReaderRoutes[screen] || window.ReaderRoutes[screen === 'author-cards' ? 'authorList' : screen === 'video-list' ? 'videoList' : screen];
    if (mountedRoute && mountedRoute.module.unmount) mountedRoute.module.unmount(mountedRoute.container);
    mountedRoute = null;
    if (route && route.mount) {
      const container = routeContainer();
      route.mount(container, { screen });
      mountedRoute = { module: route, container };
    }
  }

  window.ReaderShell = Object.freeze({ routes, getScreen, setScreen, syncActive });
  install();
  window.addEventListener('hashchange', syncActive);
  window.addEventListener('popstate', syncActive);
})();
