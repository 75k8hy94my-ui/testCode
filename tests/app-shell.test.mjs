import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('global chrome does not fetch-replace pages or intercept SPA family clicks', () => {
  const shell = read('app-global-shell.js');
  assert.match(shell, /window\.AppShell\s*=/);
  assert.match(shell, /SPA_PAGES/);
  assert.match(shell, /if \(isSpaPage\(\)\) return;/);
  assert.doesNotMatch(shell, /function loadRoute/);
  assert.doesNotMatch(shell, /fetch\(url\.href/);
  assert.doesNotMatch(shell, /addEventListener\('click', intercept\)/);
});

test('home-family pages share one History API controller', () => {
  const spa = read('home-profile-spa.js');
  const shell = read('app-global-shell.js');
  for (const page of ['home.html', 'profile.html', 'manga.html', 'video.html']) {
    assert.match(shell, new RegExp(`['"]${page}['"]`));
    assert.match(read(page), /home-profile-spa\.js/);
    assert.match(read(page), /class=["']homeHeader["']/);
  }
  assert.match(spa, /history\.pushState/);
  assert.match(spa, /addEventListener\('click',intercept\)/);
  assert.match(spa, /function renderProfile/);
  assert.match(spa, /id="profileLogoutBtn"/);
  assert.match(spa, /id="profileThemeLight"/);
  assert.match(spa, /保管庫を開く/);
  assert.match(spa, /id="profileAvatarInput"/);
  assert.match(spa, /avatarApi\.fromFile\(file\)/);
  assert.match(read('profile-menu.js'), /refreshAvatar/);
  for(const page of ['home.html','profile.html','manga.html','video.html']) assert.match(read(page), /profile-avatar\.js/);
});

test('mobile home shell delegates navigation to the shared Liquid Glass component', () => {
  const spa = read('home-profile-spa.js');
  const nav = read('mobile-bottom-nav.js');
  assert.match(spa, /MobileBottomNav\.ensureSpaNav/);
  assert.match(spa, /MobileBottomNav\.syncActive/);
  assert.match(nav, /profile\.html/);
  assert.match(nav, /manga\.html/);
  assert.match(nav, /video\.html/);
  assert.match(nav, /home\.html/);
});

test('static verifier covers the shared shell and profile entry', () => {
  const verifier = read('scripts/check-static.mjs');
  for (const file of ['profile.html', 'home-profile-spa.js', 'profile-menu.js', 'video-library.js', 'media-access-gate.js']) {
    assert.match(verifier, new RegExp(`['"]${file}['"]`));
  }
});

test('mobile bottom navigation stays visible on manga and video routes', () => {
  const css = read('home-profile-shell.css');
  assert.doesNotMatch(css, /html\.reader-entry-manga #mobileBottomNav,html\.reader-entry-video #mobileBottomNav[^{}]*\{display:none!important\}/);
  assert.match(css, /@media\(max-width:899px\)\{html\.reader-entry-manga #mobileBottomNav,html\.reader-entry-video #mobileBottomNav\{display:flex!important\}\}/);
  for (const page of ['manga.html', 'video.html']) {
    assert.match(read(page), /home-profile-shell\.css\?v=20261008-profile-avatar/);
  }
});

test('authenticated top bars keep only the shared profile action', () => {
  const iconPages = ['home.html', 'profile.html', 'manga.html', 'video.html', 'video-player.html', 'video-edit.html'];
  for (const page of iconPages) {
    const source = read(page);
    const header = source.match(/<header class=["']homeHeader["'][\s\S]*?<\/header>/)?.[0] || '';
    assert.match(header, /data-profile-menu-trigger/);
    assert.match(header, /<circle cx=["']12["'] cy=["']8["'] r=["']3\.2["']/);
    assert.doesNotMatch(header, /topActions|headerActions|>保管庫<|>設定<|>本棚</);
  }
  const reader = read('reader.html');
  assert.doesNotMatch(reader, /app-global-shell\.js|home-profile-spa\.js|reader-shell\.js/);
  assert.match(reader, /aria-label="本棚に戻る"/);
  const globalShell = read('app-global-shell.js');
  assert.match(globalShell, /data-profile-menu-trigger/);
  assert.doesNotMatch(globalShell.match(/function markup\(\)[\s\S]*?function install\(\)/)?.[0] || '', /globalShellAccount|topActions|headerActions/);
  const menu = read('profile-menu.js');
  assert.match(menu, /\[data-profile-menu-trigger\], #desktopProfileButton/);
  assert.doesNotMatch(menu, /matchMedia\('\(min-width: 900px\)'\)\.matches\) return/);
  assert.match(read('sync.html'), /profile-menu\.js\?v=20260924-theme-unified/);
});

test('login page has no top navigation menu', () => {
  const index = read('index.html');
  assert.doesNotMatch(index, /mobileTopBar|mobileTopNav/);
  assert.doesNotMatch(index, /href=["'](?:home|manga|video|reader)\.html/);
});

test('VPN gate keeps readable contrast on dark manga/video routes', () => {
  const css = read('home-profile-shell.css');
  assert.match(css, /reader-entry-manga \.vpnRouteGate \.vpnRouteActions \.glassBtn/);
  assert.match(css, /background:#1c2430/);
  assert.match(css, /color:#f8fafc/);
  assert.match(css, /vpnStatusButton\[data-vpn-state="blocked"\][\s\S]*color:#ffb4b4/);
  for (const page of ['home.html','profile.html','manga.html','video.html']) {
    assert.match(read(page), /home-profile-shell\.css\?v=20261008-profile-avatar/);
  }
});

test('profile save feedback is a compact toast instead of a full-width status bar', () => {
  const spa = read('home-profile-spa.js');
  const css = read('home-profile-shell.css');
  assert.match(spa, /class="syncStatus profileToastStatus"/);
  assert.match(spa, /runHomeSync\('保存しました'\)/);
  assert.doesNotMatch(spa, /表示設定を保存しました/);
  assert.match(css, /\.profileToastStatus\{/);
  assert.match(css, /border-radius:999px/);
  assert.match(css, /bottom:calc\(88px \+ env\(safe-area-inset-bottom\)\)/);
});

test('saved theme drives home profile manga video and header colors', () => {
  const spa = read('home-profile-spa.js');
  const shell = read('app-global-shell.js');
  const css = read('home-profile-shell.css');
  const globalCss = read('app-global-shell.css');
  assert.match(spa, /localStorage\.setItem\('mangaReaderTheme',selected\)/);
  assert.match(spa, /document\.documentElement\.dataset\.theme=selected/);
  assert.match(shell, /localStorage\.getItem\('mangaReaderTheme'\)/);
  assert.match(shell, /applyStoredTheme\(\)/);
  assert.match(css, /html\[data-theme="light"\] \.homeShell/);
  assert.match(css, /html\[data-theme="dark"\] \.homeShell/);
  assert.match(css, /--header-bg:/);
  assert.match(css, /homeHeader[\s\S]*background:var\(--header-bg\)!important/);
  assert.match(css, /reader-entry-manga body[\s\S]*background:#f4f6f8!important/);
  assert.match(css, /reader-entry-video body[\s\S]*background:#0a0c11!important/);
  assert.match(globalCss, /--shell-header-bg/);
  for (const page of ['home.html','profile.html','manga.html','video.html','video-player.html']) {
    const shellVersion = page === 'video-player.html' ? '20261009-generated-volume-icons' : '20261008-profile-avatar';
    assert.match(read(page), new RegExp(`home-profile-shell\\.css\\?v=${shellVersion}`));
    assert.match(read(page), /app-global-shell\.js\?v=20261003-reader-spa/);
    const menuVersion = page === 'video-player.html' ? '20260924-theme-unified' : '20261008-profile-avatar';
    assert.match(read(page), new RegExp(`profile-menu\\.js\\?v=${menuVersion}`));
  }
});

test('reader owns a dedicated reading surface instead of home navigation chrome', () => {
  const reader = read('reader.html');
  assert.doesNotMatch(reader, /reader-shell-page/);
  assert.match(reader, /#readerApp/);
  assert.doesNotMatch(reader, /home-profile-shell|home-profile-spa|mobile-bottom-nav|app-desktop-rail/);
});

test('profile theme uses an iOS-style switch', () => {
  const spa = read('home-profile-spa.js');
  const css = read('home-profile-shell.css');
  assert.match(spa, /class="profileThemeRow"/);
  assert.match(spa, /class="iosSwitch"/);
  assert.match(spa, /id="profileThemeLight" type="checkbox" role="switch"/);
  assert.match(css, /\.iosSwitch\{[\s\S]*width:51px[\s\S]*height:31px/);
  assert.match(css, /\.iosSwitch input:checked \+ \.iosSwitchTrack\{background:#34c759\}/);
  assert.match(css, /translateX\(20px\)/);
  assert.match(css, /\.iosSwitchTrack::after[\s\S]*width:27px[\s\S]*height:27px/);
});

test('shared mobile nav provides a moving Liquid Glass lens and adaptive interaction', () => {
  const nav = read('mobile-bottom-nav.js');
  const css = read('mobile-bottom-nav.css');
  assert.match(nav, /className = 'liquidGlassSelection'/);
  assert.match(nav, /lens\.animate\(/);
  assert.match(nav, /scale3d\([^)]*\.95/);
  assert.match(nav, /requestAnimationFrame/);
  assert.match(nav, /--glass-light-x/);
  assert.match(nav, /pointermove/);
  assert.match(nav, /liquidNavCompact/);
  assert.match(nav, /MutationObserver/);
  assert.match(css, /backdrop-filter:blur\(34px\) saturate\(180%\) contrast\(106%\)/);
  assert.match(css, /\.liquidGlassSelection/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /prefers-reduced-transparency:reduce/);
  assert.match(css, /html\[data-theme="light"\] #mobileBottomNav\.liquidGlassNav/);
});

test('all authenticated mobile destinations load the shared Liquid Glass assets', () => {
  for (const page of ['home.html','profile.html','manga.html','video.html','video-player.html']) {
    const source = read(page);
    assert.match(source, /mobile-bottom-nav\.css\?v=20260925-instagram-drag-lock/, page);
    assert.match(source, /mobile-bottom-nav\.js\?v=20260925-instagram-drag-lock/, page);
  }
  for (const page of ['home.html','profile.html','manga.html','video.html']) {
    assert.match(read(page), /home-profile-spa\.js\?v=20261009-vault-sync-queue/, page);
  }
});


test('reader is excluded from the app navigation shells', () => {
  const reader = read('reader.html');
  assert.doesNotMatch(reader, /home-profile-shell|home-profile-spa|mobile-bottom-nav|app-desktop-rail/);
});

test('the manga shell opens Reader through standalone document navigation', () => {
  const shell = read('app-global-shell.js');
  const spa = read('home-profile-spa.js');
  const route = read('manga-list-route.js');
  assert.doesNotMatch(shell, /reader\.html/);
  assert.doesNotMatch(spa, /renderReader|reader\.html|iframe/);
  assert.match(spa, /history\.pushState/);
  assert.match(route, /location\.assign\(url\)/);
  assert.doesNotMatch(read('reader.html'), /home-profile-spa|manga-list-route|MangaListHostRuntimeFactory/);
});

test('global Vault sync does not save protected data without access', () => {
  const spa = read('home-profile-spa.js');
  const sync = spa.slice(spa.indexOf('async function runHomeSync'), spa.indexOf('function commitLayout'));
  assert.match(spa, /function canSyncProtectedData\(\)[\s\S]*canReadProtectedData\(\)===true/);
  assert.ok(sync.indexOf('if(!canSyncProtectedData())return;') < sync.indexOf('MangaVault.saveLocalChanges()'));
});

test('sync result stays visible until another status replaces it', () => {
  const spa = read('home-profile-spa.js');
  assert.match(spa, /function setSyncStatus\(text\)\{[^}]*node\.textContent=text\|\|'';\}/);
  assert.doesNotMatch(spa, /function setSyncStatus\(text\)[\s\S]{0,250}setTimeout\(/);
});
