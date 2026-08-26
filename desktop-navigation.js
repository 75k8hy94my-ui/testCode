(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const MOBILE_QUERY = '(max-width: 600px)';
  const LIST_SCREENS = new Set(['saved-list', 'video-list']);

  function currentScreen() {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('screen') || '';
  }

  function createStyles() {
    if (document.getElementById('desktopReaderNavStyles')) return;
    const style = document.createElement('style');
    style.id = 'desktopReaderNavStyles';
    style.textContent = `
      #desktopReaderNav {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin: 0 0 12px;
        padding: 10px 0 12px;
        border-bottom: 1px solid var(--border);
        flex-shrink: 0;
      }
      #desktopReaderNav .desktopReaderNavBtn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 36px;
        text-decoration: none;
      }
      #desktopReaderNav .desktopReaderNavBtn.active {
        color: var(--accent);
        border-color: var(--accent);
        background: var(--accent-dim);
      }
      @media (max-width: 600px) {
        #desktopReaderNav { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function makeLink(id, label, href) {
    const link = document.createElement('a');
    link.id = id;
    link.className = 'ctrlBtn desktopReaderNavBtn';
    link.href = href;
    link.textContent = label;
    return link;
  }

  function makeButton(id, label, targetId) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'ctrlBtn desktopReaderNavBtn';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      const target = document.getElementById(targetId);
      if (target) target.click();
      queueMicrotask(syncDesktopNavigation);
    });
    return button;
  }

  function buildDesktopNavigation() {
    if (document.getElementById('desktopReaderNav')) return document.getElementById('desktopReaderNav');
    const panel = document.getElementById('savedListPanel');
    if (!panel) return null;

    createStyles();
    const nav = document.createElement('nav');
    nav.id = 'desktopReaderNav';
    nav.setAttribute('aria-label', 'デスクトップナビ');

    nav.append(
      makeLink('desktopNavHome', 'ホーム', 'home.html'),
      makeButton('desktopNavManga', '漫画', 'mobileNavManga'),
      makeButton('desktopNavVideo', '動画', 'mobileNavVideo'),
      makeLink('desktopNavStudy', '司法試験学習', 'study.html'),
      makeLink('desktopNavLinks', 'リンク', 'links.html'),
      makeButton('desktopNavAuthor', '作者カード', 'mobileNavAuthor'),
      makeButton('desktopNavBackup', 'バックアップ', 'mobileNavBackup'),
      makeButton('desktopNavSettings', '設定', 'mobileNavSettings')
    );

    const localReader = document.createElement('button');
    localReader.id = 'desktopNavLocalReader';
    localReader.className = 'ctrlBtn desktopReaderNavBtn';
    localReader.type = 'button';
    localReader.textContent = 'ローカル漫画';
    localReader.hidden = true;
    nav.append(localReader);

    const listTabRow = document.getElementById('listTabRow');
    if (listTabRow && listTabRow.parentNode === panel) panel.insertBefore(nav, listTabRow);
    else panel.insertBefore(nav, panel.firstChild);

    document.dispatchEvent(new CustomEvent('manga-reader-desktop-nav-ready'));
    return nav;
  }

  function updateDesktopReaderNavState() {
    const screen = currentScreen();
    const states = [
      [document.getElementById('desktopNavManga'), screen === 'saved-list'],
      [document.getElementById('desktopNavVideo'), screen === 'video-list'],
    ];
    for (const [button, active] of states) {
      if (!button) continue;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function updateListCloseVisibility() {
    const closeListBtn = document.getElementById('closeListBtn');
    if (!closeListBtn) return;
    const visible = LIST_SCREENS.has(currentScreen());
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const desired = visible && !mobile ? '' : 'none';
    if (closeListBtn.style.display !== desired) closeListBtn.style.display = visible && !mobile ? '' : 'none';
  }

  function syncDesktopNavigation() {
    buildDesktopNavigation();
    updateDesktopReaderNavState();
    updateListCloseVisibility();
  }

  function installCloseVisibilityGuard() {
    const closeListBtn = document.getElementById('closeListBtn');
    if (!closeListBtn || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => updateListCloseVisibility());
    observer.observe(closeListBtn, { attributes: true, attributeFilter: ['style'] });
  }

  const media = window.matchMedia(MOBILE_QUERY);
  if (typeof media.addEventListener === 'function') media.addEventListener('change', syncDesktopNavigation);
  else if (typeof media.addListener === 'function') media.addListener(syncDesktopNavigation);
  window.addEventListener('popstate', syncDesktopNavigation);
  window.addEventListener('hashchange', syncDesktopNavigation);

  syncDesktopNavigation();
  installCloseVisibilityGuard();
})();