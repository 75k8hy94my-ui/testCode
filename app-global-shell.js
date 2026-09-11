(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (location.pathname.endsWith('/index.html') || location.pathname === '/index.html') return;

  const page = location.pathname.split('/').pop() || 'home.html';
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
  const currentLabel = labels[page] || document.title;
  const nav = [
    ['home.html', 'ホーム'],
    ['reader.html#screen=saved-list', '漫画'],
    ['study.html', '学習'],
    ['links.html', 'リンク'],
    ['index-search.html', '索引'],
    ['hyakusen.html', '判例百選'],
    ['roppo.html', '六法'],
    ['sync.html', '保管庫']
  ];

  function active(href) {
    return href.split('#')[0] === page;
  }

  function syncActive() {
    const current = location.pathname.split('/').pop() || 'home.html';
    document.querySelectorAll('.globalShellLink[href]').forEach((link) => {
      const isCurrent = new URL(link.href, location.href).pathname.split('/').pop() === current;
      link.classList.toggle('is-current', isCurrent);
      if (isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-global-shell-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'app-global-shell.css?v=20260911-shell';
    link.dataset.globalShellStyle = '1';
    document.head.appendChild(link);
  }

  function markup() {
    return '<div class="globalShellBrand"><span class="globalShellEyebrow">BOOKS</span><h1 id="shellTitle"></h1></div>' +
      '<nav class="globalShellNav" aria-label="主要ページ">' +
      nav.map(([href, label]) => '<a class="globalShellLink' + (active(href) ? ' is-current' : '') + '" href="' + href + '"' + (active(href) ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') +
      '</nav>' + (page === 'home.html' ? '<button class="globalShellEdit" id="editHomeBtn" type="button">カードを編集</button>' : '');
  }

  function install() {
    ensureStylesheet();
    const existing = document.querySelector('.homeHeader');
    const header = existing || document.createElement('header');
    header.id = 'appGlobalHeader';
    header.classList.add('globalAppHeader');
    header.innerHTML = markup();
    header.querySelector('#shellTitle').textContent = currentLabel;
    if (!existing) document.body.insertBefore(header, document.body.firstChild);
    document.documentElement.classList.add('global-shell-page');
    syncActive();
    document.addEventListener('home-profile-routechange', syncActive);
    window.addEventListener('popstate', syncActive);
  }

  install();
})();
