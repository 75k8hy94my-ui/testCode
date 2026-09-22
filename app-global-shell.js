(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (location.pathname.endsWith('/index.html') || location.pathname === '/index.html') return;

  const SPA_PAGES = Object.freeze(['home.html', 'profile.html', 'manga.html', 'video.html', 'reader.html']);
  const labels = {
    'home.html': 'ホーム',
    'profile.html': 'プロフィール設定',
    'manga.html': '漫画',
    'video.html': '動画',
    'reader.html': '漫画',
    'sync.html': '保管庫'
  };

  const currentPage = () => location.pathname.split('/').pop() || 'home.html';
  const isSpaPage = (name = currentPage()) => SPA_PAGES.includes(name);

  window.AppShell = { SPA_PAGES, labels, currentPage, isSpaPage };

  // Home-family routes keep a persistent header via home-profile-spa.js.
  // Do not rewrite that chrome or intercept those clicks.
  if (isSpaPage()) return;

  function ensureStylesheet() {
    if (document.querySelector('link[data-global-shell-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'app-global-shell.css?v=20260912-shell';
    link.dataset.globalShellStyle = '1';
    document.head.appendChild(link);
  }

  function markup() {
    return '<div class="globalShellBrand"><h1 id="shellTitle"></h1></div><button class="headerProfileButton" type="button" data-profile-menu-trigger aria-label="アカウント" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg></button>';
  }

  function install() {
    ensureStylesheet();
    const page = currentPage();
    const currentLabel = labels[page] || document.title;
    const existing = document.getElementById('appGlobalHeader') || document.querySelector('.globalAppHeader') || document.querySelector('.homeShell > .homeHeader');
    const header = existing || document.createElement('header');
    header.id = 'appGlobalHeader';
    header.classList.add('globalAppHeader');
    header.dataset.profileOnlyHeader = '1';
    header.innerHTML = markup();
    const title = header.querySelector('#shellTitle');
    if (title) title.textContent = currentLabel;
    if (!existing) document.body.insertBefore(header, document.body.firstChild);
    document.documentElement.classList.add('global-shell-page');
  }

  install();
})();
