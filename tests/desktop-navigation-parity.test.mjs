import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Contract: every mobile-only reader destination needs a desktop-reachable counterpart.
const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop navigation provides a counterpart for every mobile reader destination', () => {
  const reader = read('reader.html');
  const flags = read('feature-flags.js');
  const desktop = read('desktop-navigation.js');
  const rail = read('app-desktop-rail.js');
  const source = reader + '\n' + flags + '\n' + desktop + '\n' + rail;
  const parity = [
    ['mobileNavManga', 'desktopNavManga'],
    ['mobileNavVideo', 'desktopNavVideo'],
    ['mobileNavStudy', 'desktopNavStudy'],
    ['mobileNavLinks', 'desktopNavLinks'],
    ['mobileNavAuthor', 'desktopNavAuthor'],
    ['mobileNavBackup', 'desktopNavBackup'],
    ['mobileNavSettings', 'desktopNavSettings'],
  ];
  for (const [mobileId, desktopId] of parity) {
    assert.match(source, new RegExp(mobileId));
    assert.match(source, new RegExp(desktopId));
  }
  assert.match(source, /desktopReaderNav/);
  assert.match(rail, /デスクトップナビ/);
  assert.match(source, /desktopNavHome/);
  assert.match(source, /desktopNavLocalReader/);
});

test('desktop navigation uses the shared fixed Liquid Glass rail and stays off narrow screens', () => {
  const reader = read('reader.html');
  const rail = read('app-desktop-rail.js');
  assert.match(reader, /#mobileBottomNav\s*\{\s*display:\s*none/);
  assert.match(rail, /@media\s*\(min-width:\s*900px\)/);
  assert.match(rail, /@media\s*\(max-width:\s*899px\)/);
  assert.match(rail, /position:\s*fixed/);
  assert.match(rail, /left:\s*18px/);
  assert.match(rail, /backdrop-filter:\s*blur\(28px\)\s+saturate\(150%\)/);
  assert.match(rail, /border-radius:\s*30px/);
  assert.match(rail, /appDesktopRailItem\.active/);
});

test('saved URL and video screens rely on desktop navigation instead of a redundant close button', () => {
  const reader = read('reader.html');
  const desktop = read('desktop-navigation.js');
  assert.doesNotMatch(desktop, /closeListBtn|updateListCloseVisibility|MutationObserver/);
  assert.ok((reader.match(/els\.closeListBtn\.style\.display = 'none';/g) || []).length >= 2);
  assert.match(desktop, /addEventListener\(['"]popstate['"]/);
  assert.match(desktop, /addEventListener\(['"]hashchange['"]/);
});

test('cross-document return routes point to real destinations', () => {
  const links = read('links.html');
  const desktop = read('desktop-navigation.js');
  assert.match(links, /href=["']home\.html["']/);
  // The implementation uses a RegExp literal, so do not couple this assertion to slash escaping.
  assert.match(desktop, /local-reader/);
  assert.match(desktop, /referrer\.pathname/);
  assert.match(desktop, /url\.hash\s*=\s*['"]screen=saved-list['"]/);
  assert.match(desktop, /readerScreen:\s*['"]saved-list['"]/);
  assert.match(desktop, /dispatchEvent\(new Event\(['"]hashchange['"]\)\)/);
});

test('desktop navigation enhancement is bootstrapped after the reader code', () => {
  const source = read('recommendations.js');
  assert.match(source, /desktop-navigation\.js/);
  assert.match(source, /loadBrowserScript\('desktop-navigation\.js'\)/);
});

test('major pages expose the same primary destinations and mark the current page', () => {
  const pages = [
    ['home.html', 'ホーム', 'home.html'],
    ['index-search.html', '索引検索', 'index-search.html'],
    ['hyakusen.html', '判例百選', 'hyakusen.html'],
  ];
  const destinations = [
    ['ホーム', 'home.html'],
    ['索引検索', 'index-search.html'],
    ['判例百選', 'hyakusen.html'],
  ];

  for (const [file, currentLabel, currentHref] of pages) {
    const source = read(file);
    assert.match(source, /<nav[^>]+class=["'][^"']*\btopActions\b[^"']*["'][^>]*>/);
    assert.doesNotMatch(source, /へ戻る/);
    assert.match(source, new RegExp(`<span[^>]*class=["'][^"']*glassBtn[^"']*topActionCurrent[^"']*["'][^>]*aria-current=["']page["'][^>]*>${currentLabel}<\\/span>`));

    for (const [label, href] of destinations) {
      if (href === currentHref) continue;
      assert.match(source, new RegExp(`<a[^>]*class=["'][^"']*glassBtn[^"']*["'][^>]*href=["']${href.replace('.', '\\.') }["'][^>]*>${label}<\\/a>`));
    }
  }
});
