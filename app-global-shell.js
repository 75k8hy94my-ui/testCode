(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (location.pathname.endsWith('/index.html') || location.pathname === '/index.html') return;

  const currentPage = () => location.pathname.split('/').pop() || 'home.html';
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
  const routePages = new Set(Object.keys(labels));
  let navigating = false;

  function ensureStylesheet() {
    if (document.querySelector('link[data-global-shell-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'app-global-shell.css?v=20260911-shell';
    link.dataset.globalShellStyle = '1';
    document.head.appendChild(link);
  }

  function routeName(pathname = location.pathname) {
    return pathname.split('/').pop() || 'home.html';
  }

  function isRouteLink(link) {
    if (!link || link.target || link.hasAttribute('download')) return false;
    const target = new URL(link.href, location.href);
    return target.origin === location.origin && routePages.has(routeName(target.pathname));
  }

  function copyHeadAssets(doc) {
    doc.querySelectorAll('link[rel="stylesheet"], style').forEach((source) => {
      if (source.matches('link') && document.querySelector(`link[href="${source.getAttribute('href')}"]`)) return;
      const asset = document.createElement(source.tagName.toLowerCase());
      for (const attribute of source.attributes) asset.setAttribute(attribute.name, attribute.value);
      asset.dataset.globalRouteAsset = '1';
      if (source.tagName === 'STYLE') asset.textContent = source.textContent;
      document.head.appendChild(asset);
    });
  }

  function appendScript(source) {
    return new Promise((resolve) => {
      if (source.src && source.src.includes('app-global-shell.js')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      for (const attribute of source.attributes) script.setAttribute(attribute.name, attribute.value);
      if (source.src) {
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', resolve, { once: true });
      } else {
        script.textContent = source.textContent;
        resolve();
      }
      document.body.appendChild(script);
    });
  }

  async function loadRoute(url, replace = false) {
    if (navigating) return;
    navigating = true;
    try {
      const response = await fetch(url.href, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Route load failed');
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const scripts = [...parsed.body.querySelectorAll('script')];
      const content = [...parsed.body.children].filter((element) => {
        if (element.matches('.globalAppHeader, .homeHeader')) return false;
        if (url.pathname.endsWith('/roppo.html') && element.matches('main > .header')) return false;
        return true;
      });
      content.forEach((element) => {
        element.querySelectorAll('.globalAppHeader, .homeHeader').forEach((header) => header.remove());
        if (url.pathname.endsWith('/roppo.html')) {
          element.querySelectorAll('.header').forEach((header) => header.remove());
        }
        if (url.pathname.endsWith('/sync.html')) {
          element.querySelectorAll('main > header').forEach((header) => header.remove());
        }
      });
      copyHeadAssets(parsed);
      document.body.replaceChildren(document.getElementById('appGlobalHeader'), ...content);
      document.title = parsed.title || document.title;
      if (replace) history.replaceState({ globalShellRoute: true }, '', url.href);
      else history.pushState({ globalShellRoute: true }, '', url.href);
      install();
      for (const script of scripts) await appendScript(script);
      install();
      window.scrollTo(0, 0);
    } catch (_) {
      window.location.assign(url.href);
    } finally {
      navigating = false;
    }
  }

  function intercept(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!isRouteLink(link)) return;
    event.preventDefault();
    loadRoute(new URL(link.href, location.href));
  }

  function markup() {
    return '<div class="globalShellBrand"><span class="globalShellEyebrow">BOOKS</span><h1 id="shellTitle"></h1></div>';
  }

  function install() {
    ensureStylesheet();
    const page = currentPage();
    const currentLabel = labels[page] || document.title;
    if (page === 'study.html') setTimeout(() => document.getElementById('studyBottomNav')?.remove(), 0);
    const existing = document.querySelector('.homeHeader');
    const header = existing || document.createElement('header');
    header.id = 'appGlobalHeader';
    header.classList.add('globalAppHeader');
    header.innerHTML = markup();
    header.querySelector('#shellTitle').textContent = currentLabel;
    if (!existing) document.body.insertBefore(header, document.body.firstChild);
    document.documentElement.classList.add('global-shell-page');
    document.removeEventListener('click', intercept);
    document.addEventListener('click', intercept);
  }

  install();
})();
