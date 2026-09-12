(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (location.pathname.endsWith('/index.html') || location.pathname === '/index.html') return;

  const SPA_PAGES = Object.freeze(['home.html', 'profile.html', 'index-search.html', 'hyakusen.html', 'links.html']);
  const labels = {
    'home.html': 'ホーム',
    'profile.html': 'プロフィール設定',
    'index-search.html': '索引検索',
    'hyakusen.html': '判例百選',
    'links.html': 'リンク管理',
    'reader.html': '漫画',
    'local-reader.html': 'ローカル漫画',
    'study.html': '学習',
    'roppo.html': '六法',
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
    const account = currentPage() === 'sync.html'
      ? '<span class="globalShellAccount" id="globalShellAccountEmail"></span><span class="globalShellAccountSuffix">でログイン中</span>'
      : '';
    return '<div class="globalShellBrand"><span class="globalShellEyebrow">BOOKS</span><h1 id="shellTitle"></h1></div>' + account;
  }

  function install() {
    ensureStylesheet();
    const page = currentPage();
    const currentLabel = labels[page] || document.title;
    if (page === 'study.html') setTimeout(() => document.getElementById('studyBottomNav')?.remove(), 0);
    const existing = document.getElementById('appGlobalHeader') || document.querySelector('.globalAppHeader');
    const header = existing || document.createElement('header');
    header.id = 'appGlobalHeader';
    header.classList.add('globalAppHeader');
    header.innerHTML = markup();
    const title = header.querySelector('#shellTitle');
    if (title) title.textContent = currentLabel;
    const accountEmail = header.querySelector('#globalShellAccountEmail');
    const session = window.MangaVault && MangaVault.loadSession && MangaVault.loadSession();
    if (accountEmail) accountEmail.textContent = session && session.user ? session.user.email || '' : '';
    if (!existing) document.body.insertBefore(header, document.body.firstChild);
    document.documentElement.classList.add('global-shell-page');
  }

  install();
})();
