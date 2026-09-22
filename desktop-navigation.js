(() => {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const DESKTOP_NAV_IDS = [
    'desktopNavHome', 'desktopNavManga', 'desktopNavVideo', 'desktopNavAuthor',
    'desktopNavBackup', 'desktopNavSettings', 'desktopNavVault'
  ];

  function currentScreen() {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('screen') || '';
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

  syncDesktopNavigation();

  // Keep the IDs discoverable for desktop/mobile navigation parity checks.
  void DESKTOP_NAV_IDS;
})();
