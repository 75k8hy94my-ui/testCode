(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const DESKTOP_NAV_IDS = [
    'desktopNavHome', 'desktopNavManga', 'desktopNavVideo', 'desktopNavStudy',
    'desktopNavLinks', 'desktopNavAuthor', 'desktopNavBackup', 'desktopNavSettings',
    'desktopNavVault', 'desktopNavLocalReader'
  ];

  function currentScreen() {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('screen') || '';
  }

  function normalizeInboundLocalReaderRoute() {
    if (currentScreen() || !document.referrer) return false;
    let referrer;
    try { referrer = new URL(document.referrer, window.location.href); } catch (_) { return false; }
    if (referrer.origin !== window.location.origin || !/\/local-reader\.html$/.test(referrer.pathname)) return false;
    const url = new URL(window.location.href);
    url.hash = 'screen=saved-list';
    window.history.replaceState({ ...(window.history.state || {}), readerScreen: 'saved-list' }, '', url);
    window.dispatchEvent(new Event('hashchange'));
    return true;
  }

  function syncDesktopNavigation() {
    if (!window.AppDesktopRail) return null;
    const nav = window.AppDesktopRail.build();
    window.AppDesktopRail.syncActive(nav);
    return nav;
  }

  window.addEventListener('popstate', syncDesktopNavigation);
  window.addEventListener('hashchange', syncDesktopNavigation);
  document.addEventListener('manga-reader-desktop-nav-ready', () => {
    const nav = document.getElementById('desktopReaderNav');
    if (nav && window.AppDesktopRail) window.AppDesktopRail.syncActive(nav);
  });

  normalizeInboundLocalReaderRoute();
  syncDesktopNavigation();

  // Keep the IDs discoverable for desktop/mobile navigation parity checks.
  void DESKTOP_NAV_IDS;
})();
