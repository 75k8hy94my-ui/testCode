(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.ReaderShell) return;

  const routes = Object.freeze([
    ['saved-list', '本棚', '本'],
    ['video-list', '動画', '動画'],
    ['author-list', '作者', '作者'],
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
    return '<header class="homeHeader" id="readerShellHeader"><div><h1 id="readerShellTitle">漫画</h1></div><div class="topbarActions"><nav class="topActions" aria-label="主要ページ"><a class="glassBtn" href="home.html">ホーム</a><a class="glassBtn topActionCurrent" aria-current="page" href="reader.html#screen=saved-list" data-reader-route="saved-list">本棚</a><a class="glassBtn" href="study.html">学習</a><a class="glassBtn" href="links.html">リンク</a></nav><div class="headerActions"><a class="glassBtn" href="sync.html">保管庫</a><a class="glassBtn" href="reader.html#screen=settings" data-reader-route="settings">設定</a></div></div></header>';
  }

  function install() {
    if (document.getElementById('readerShellHeader')) return;
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
    const route = window.ReaderRoutes[screen];
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
