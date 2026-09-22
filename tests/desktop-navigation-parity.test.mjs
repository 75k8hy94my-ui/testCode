import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Contract: every mobile-only reader destination needs a desktop-reachable counterpart.
const readFile = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const read = (name) => name === 'reader.html' ? ['reader.html', 'reader-saved-list-template.js', 'reader-author-list-template.js', 'reader-toc-template.js', 'reader-mobile-nav-template.js', 'reader-feature-overlays-template.js'].map(readFile).join('\n') : readFile(name);
const readReader = () => read('reader.html');

test('desktop navigation provides a counterpart for every mobile reader destination', () => {
  const reader = readReader();
  const flags = read('feature-flags.js');
  const desktop = read('desktop-navigation.js');
  const rail = read('app-desktop-rail.js');
  const source = reader + '\n' + flags + '\n' + desktop + '\n' + rail;
  const parity = [
    ['mobileNavManga', 'desktopNavManga'],
    ['mobileNavVideo', 'desktopNavVideo'],
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
});

test('desktop navigation uses the shared fixed Liquid Glass rail and stays off narrow screens', () => {
  const reader = readReader();
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
  const reader = readReader();
  const desktop = read('desktop-navigation.js');
  assert.doesNotMatch(desktop, /closeListBtn|updateListCloseVisibility|MutationObserver/);
  assert.ok((reader.match(/els\.closeListBtn\.style\.display = 'none';/g) || []).length >= 2);
  assert.match(desktop, /addEventListener\(['"]popstate['"]/);
  assert.match(desktop, /addEventListener\(['"]hashchange['"]/);
});

test('desktop navigation enhancement is bootstrapped after the reader code', () => {
  const source = read('recommendations.js');
  assert.match(source, /desktop-navigation\.js/);
  assert.match(source, /loadBrowserScript\('desktop-navigation\.js'\)/);
});

test('major pages expose the same primary destinations and mark the current page', () => {
  const pages = [['home.html', 'ホーム', 'home.html']];
  const destinations = [['ホーム', 'home.html']];

  for (const [file, currentLabel, currentHref] of pages) {
    const source = read(file);
    assert.match(source, /<nav[^>]+class=["'][^"']*\btopActions\b[^"']*["'][^>]*>/);
    assert.doesNotMatch(source, /へ戻る/);
    assert.match(source, new RegExp(`<a[^>]*class=["'][^"']*glassBtn[^"']*topActionCurrent[^"']*["'][^>]*aria-current=["']page["'][^>]*href=["']${currentHref.replace('.', '\\.')}["'][^>]*>${currentLabel}<\\/a>`));

    for (const [label, href] of destinations) {
      if (href === currentHref) continue;
      assert.match(source, new RegExp(`<a[^>]*class=["'][^"']*glassBtn[^"']*["'][^>]*href=["']${href.replace('.', '\\.') }["'][^>]*>${label}<\\/a>`));
    }
  }
});
