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
    const items = routes.map(([key, label, short]) =>
      `<a class="readerShellNavItem" data-reader-route="${key}" href="reader.html#screen=${key}"><span>${short}</span><small>${label}</small></a>`).join('');
    return `<header class="readerShellHeader" id="readerShellHeader"><a class="readerShellBrand" href="home.html"><span class="readerShellEyebrow">BOOKS</span><strong>漫画</strong></a><nav class="readerShellTopNav" aria-label="主要ページ"><a href="home.html">ホーム</a><a href="reader.html#screen=saved-list" data-reader-route="saved-list">本棚</a><a href="study.html">学習</a><a href="links.html">リンク</a></nav></header><nav class="readerShellBottomNav" id="readerShellNavigation" aria-label="漫画メニュー">${items}</nav>`;
  }

  function install() {
    if (document.getElementById('readerShellHeader')) return;
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

  function syncActive() {
    const screen = getScreen();
    document.querySelectorAll('[data-reader-route]').forEach((link) => {
      const active = link.dataset.readerRoute === screen;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  window.ReaderShell = Object.freeze({ routes, getScreen, setScreen, syncActive });
  install();
  window.addEventListener('hashchange', syncActive);
  window.addEventListener('popstate', syncActive);
})();
