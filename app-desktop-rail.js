(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M9 20v-6h6v6"/></svg>',
    manga: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c3-1.5 5.5-1.2 8 .7v13c-2.2-1.7-4.8-2-8-.6z"/><path d="M20 5.5c-3-1.5-5.5-1.2-8 .7v13c2.2-1.7 4.8-2 8-.6z"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/></svg>',
    study: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12v14H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',\n    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3z"/><path d="M8 9h8M8 12.5h5"/></svg>',
    links: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14 14 10"/><path d="M7.5 16.5 5 19a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path d="m16 8 3-3a3.5 3.5 0 1 1 5 5l-2.5 2.5a3.5 3.5 0 0 1-5 0"/></svg>',
    author: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/></svg>',
    backup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14v12H5z"/><path d="M8 4h8v3.5H8zM9 12h6M9 16h4"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"/></svg>',
    local: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h6l2 2h8v10H4z"/><path d="M8 13h8"/></svg>'
  };

  const ITEMS = [
    { id: 'desktopNavHome', key: 'home', label: 'ホーム', href: 'home.html' },
    { id: 'desktopNavManga', key: 'manga', label: '漫画', href: 'reader.html#screen=saved-list' },
    { id: 'desktopNavVideo', key: 'video', label: '動画', href: 'reader.html#screen=video-list' },
    { id: 'desktopNavStudy', key: 'study', label: '学習', href: 'study.html' },\n    { id: 'desktopNavChat', key: 'chat', label: 'Chat', href: 'chat.html' },
    { id: 'desktopNavLinks', key: 'links', label: 'リンク', href: 'links.html' },
    { id: 'desktopNavAuthor', key: 'author', label: '作者', href: 'reader.html#screen=author-cards' },
    { id: 'desktopNavBackup', key: 'backup', label: 'バックアップ', href: 'reader.html#screen=backup' },
    { id: 'desktopNavSettings', key: 'settings', label: '設定', href: 'reader.html#screen=settings' },
    { id: 'desktopNavLocalReader', key: 'local', label: 'ローカル', href: 'local-reader.html', optional: true }
  ];

  function pageName() {
    const name = window.location.pathname.split('/').pop();
    return name || 'index.html';
  }

  function currentReaderScreen() {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('screen') || '';
  }

  function activeKey() {
    const page = pageName();
    if (page === 'home.html') return 'home';
    if (page === 'study.html') return 'study';\n    if (page === 'chat.html') return 'chat';
    if (page === 'links.html') return 'links';
    if (page === 'local-reader.html') return 'local';
    if (page !== 'reader.html') return '';
    const screen = currentReaderScreen();
    if (screen === 'video-list' || screen.startsWith('video-')) return 'video';
    if (screen === 'author-cards' || screen.startsWith('author-')) return 'author';
    if (screen === 'backup') return 'backup';
    if (screen === 'settings') return 'settings';
    return 'manga';
  }

  function shouldShowLocal() {
    return pageName() === 'local-reader.html' || Boolean(window.MangaReaderFeatures && window.MangaReaderFeatures.localReader);
  }

  function ensureStyles() {
    if (document.getElementById('appDesktopRailStyles')) return;
    const style = document.createElement('style');
    style.id = 'appDesktopRailStyles';
    style.textContent = `
      #appDesktopRail,
      #desktopReaderNav {
        --rail-surface: rgba(248,249,252,.78);
        --rail-text: #17181a;
        --rail-muted: #5d626b;
        --rail-border: rgba(255,255,255,.78);
        --rail-edge: rgba(65,69,78,.14);
        --rail-highlight: rgba(255,255,255,.52);
        --rail-selection: rgba(255,255,255,.58);
        --rail-shadow: rgba(38,42,50,.16);
        display: none;
      }
      html[data-theme="dark"] #appDesktopRail,
      html[data-theme="dark"] #desktopReaderNav {
        --rail-surface: rgba(25,28,35,.80);
        --rail-text: #fbfbfd;
        --rail-muted: #c7cbd4;
        --rail-border: rgba(255,255,255,.22);
        --rail-edge: rgba(0,0,0,.30);
        --rail-highlight: rgba(255,255,255,.16);
        --rail-selection: rgba(255,255,255,.14);
        --rail-shadow: rgba(0,0,0,.44);
      }
      @media (prefers-color-scheme: dark) {
        html:not([data-theme="light"]) #appDesktopRail,
        html:not([data-theme="light"]) #desktopReaderNav {
          --rail-surface: rgba(25,28,35,.80);
          --rail-text: #fbfbfd;
          --rail-muted: #c7cbd4;
          --rail-border: rgba(255,255,255,.22);
          --rail-edge: rgba(0,0,0,.30);
          --rail-highlight: rgba(255,255,255,.16);
          --rail-selection: rgba(255,255,255,.14);
          --rail-shadow: rgba(0,0,0,.44);
        }
      }
      @media (min-width: 900px) {
        html.app-desktop-rail-page {
          --app-desktop-content-max: 920px;
          --app-desktop-rail-offset: 144px;
        }
        html.app-desktop-rail-page body {
          padding-left: var(--app-desktop-rail-offset) !important;
        }
        html.app-desktop-rail-page body > main,
        html.app-desktop-rail-page body > #app {
          width: min(100%, var(--app-desktop-content-max)) !important;
          max-width: var(--app-desktop-content-max) !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        html.app-desktop-rail-page .screenView {
          left: var(--app-desktop-rail-offset) !important;
          right: 0 !important;
          width: auto !important;
        }
        html.app-desktop-rail-page .screenView > .modalPanel {
          width: min(100%, var(--app-desktop-content-max)) !important;
          max-width: var(--app-desktop-content-max) !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        #appDesktopRail,
        #desktopReaderNav {
          position: fixed;
          left: 18px;
          top: 50%;
          bottom: auto;
          transform: translateY(-50%);
          z-index: 1000;
          width: 118px;
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 10px;
          isolation: isolate;
          border: 1px solid var(--rail-border);
          border-radius: 30px;
          background: linear-gradient(180deg,var(--rail-highlight),transparent 34%),var(--rail-surface);
          box-shadow: 0 18px 42px var(--rail-shadow), inset 0 1px 0 var(--rail-highlight), inset 0 -1px 0 var(--rail-edge);
          -webkit-backdrop-filter: blur(28px) saturate(150%);
          backdrop-filter: blur(28px) saturate(150%);
          scrollbar-width: none;
        }
        #appDesktopRail::-webkit-scrollbar,
        #desktopReaderNav::-webkit-scrollbar { display: none; }
        #appDesktopRail::before,
        #desktopReaderNav::before {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 29px;
          pointer-events: none;
          border: 1px solid color-mix(in srgb,var(--rail-border) 52%,transparent);
          mask: linear-gradient(#000,transparent 52%);
        }
        #appDesktopRail::after,
        #desktopReaderNav::after {
          content: "";
          position: absolute;
          left: 11%;
          right: 11%;
          top: 1px;
          height: 1px;
          pointer-events: none;
          background: linear-gradient(90deg,transparent,var(--rail-highlight),transparent);
        }
        .appDesktopRailItem {
          appearance: none;
          -webkit-appearance: none;
          min-width: 0;
          min-height: 52px;
          width: 100%;
          border: 1px solid transparent !important;
          border-radius: 22px !important;
          background: transparent !important;
          color: var(--rail-muted) !important;
          box-shadow: none !important;
          font: inherit;
          font-size: 12px !important;
          font-weight: 720 !important;
          line-height: 1.05;
          padding: 7px 8px !important;
          display: flex !important;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          gap: 9px;
          text-align: left;
          text-decoration: none !important;
          cursor: pointer;
          transition: transform .14s ease, background .18s ease, color .18s ease, box-shadow .18s ease;
        }
        .appDesktopRailItem[hidden] { display: none !important; }
        .appDesktopRailItem svg {
          width: 21px;
          height: 21px;
          flex: 0 0 21px;
          stroke: currentColor;
          stroke-width: 1.9;
          fill: none;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .appDesktopRailItem span {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .appDesktopRailItem.active,
        .appDesktopRailItem[aria-current="page"] {
          color: var(--rail-text) !important;
          background: var(--rail-selection) !important;
          border-color: color-mix(in srgb,var(--rail-border) 68%,transparent) !important;
          box-shadow: 0 2px 8px color-mix(in srgb,var(--rail-shadow) 48%,transparent), inset 0 1px 0 var(--rail-highlight) !important;
        }
        .appDesktopRailItem:active { transform: scale(.96); }
        .appDesktopRailItem:focus-visible {
          outline: 3px solid color-mix(in srgb,#2563eb 70%,transparent);
          outline-offset: 2px;
        }
      }
      @media (max-width: 899px) {
        #appDesktopRail,
        #desktopReaderNav { display: none !important; }
      }
      @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))) {
        #appDesktopRail,
        #desktopReaderNav {
          background: var(--rail-surface);
        }
      }
      @media (prefers-reduced-transparency: reduce) {
        #appDesktopRail,
        #desktopReaderNav {
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .appDesktopRailItem { transition: none !important; }
        .appDesktopRailItem:active { transform: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function decorateItem(element, item) {
    element.className = 'appDesktopRailItem';
    element.innerHTML = `${ICONS[item.key] || ''}<span>${item.label}</span>`;
    element.setAttribute('aria-label', item.label);
    return element;
  }

  function makeItem(item) {
    const link = document.createElement('a');
    link.id = item.id;
    link.href = item.href;
    decorateItem(link, item);
    if (item.optional) link.hidden = !shouldShowLocal();
    return link;
  }

  function syncActive(nav = document.getElementById(pageName() === 'reader.html' ? 'desktopReaderNav' : 'appDesktopRail')) {
    if (!nav) return;
    const active = activeKey();
    for (const item of ITEMS) {
      const element = nav.querySelector('#' + item.id);
      if (!element) continue;
      if (item.optional) element.hidden = !shouldShowLocal();
      const selected = item.key === active;
      element.classList.toggle('active', selected);
      if (selected) element.setAttribute('aria-current', 'page');
      else element.removeAttribute('aria-current');
    }
  }

  function build() {
    const page = pageName();
    if (page === 'index.html' || page === 'study.html') return null;
    const id = page === 'reader.html' ? 'desktopReaderNav' : 'appDesktopRail';
    let nav = document.getElementById(id);
    if (nav) {
      ensureStyles();
      document.documentElement.classList.add('app-desktop-rail-page');
      syncActive(nav);
      return nav;
    }
    ensureStyles();
    nav = document.createElement('nav');
    nav.id = id;
    nav.className = 'appDesktopRailSurface';
    nav.setAttribute('aria-label', 'デスクトップナビ');
    for (const item of ITEMS) nav.appendChild(makeItem(item));
    document.body.appendChild(nav);
    document.documentElement.classList.add('app-desktop-rail-page');
    syncActive(nav);
    document.dispatchEvent(new CustomEvent('manga-reader-desktop-nav-ready'));
    return nav;
  }

  const api = { ITEMS, ICONS, ensureStyles, decorateItem, build, syncActive, activeKey, shouldShowLocal };
  window.AppDesktopRail = api;

  const start = () => build();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.addEventListener('hashchange', () => syncActive());
  window.addEventListener('popstate', () => syncActive());
})();
