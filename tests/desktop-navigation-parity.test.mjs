import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop navigation provides a counterpart for every mobile reader destination', () => {
  const reader = read('reader.html');
  const flags = read('feature-flags.js');
  const desktop = read('desktop-navigation.js');
  const source = reader + '\n' + flags + '\n' + desktop;
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
    assert.match(desktop, new RegExp(desktopId));
  }
  assert.match(desktop, /desktopReaderNav/);
  assert.match(desktop, /デスクトップナビ/);
  assert.match(desktop, /desktopNavHome/);
  assert.match(desktop, /desktopNavLocalReader/);
});

test('desktop navigation stays off mobile and keeps the Liquid Glass bar mobile-only', () => {
  const reader = read('reader.html');
  const desktop = read('desktop-navigation.js');
  assert.match(reader, /#mobileBottomNav\s*\{\s*display:\s*none/);
  assert.match(desktop, /@media\s*\(max-width:\s*600px\)/);
  assert.match(desktop, /#desktopReaderNav\s*\{\s*display:\s*none\s*!important/);
  assert.doesNotMatch(desktop, /position:\s*fixed/);
});

test('desktop list exit is restored after reader code hides it', () => {
  const desktop = read('desktop-navigation.js');
  assert.match(desktop, /function\s+updateListCloseVisibility\s*\(/);
  assert.match(desktop, /matchMedia\(MOBILE_QUERY\)/);
  assert.match(desktop, /closeListBtn\.style\.display\s*=\s*visible\s*&&\s*!mobile\s*\?\s*['"]['"]\s*:\s*['"]none['"]/);
  assert.match(desktop, /addEventListener\(['"]popstate['"]/);
  assert.match(desktop, /addEventListener\(['"]hashchange['"]/);
});

test('cross-document return routes point to real destinations', () => {
  const links = read('links.html');
  const localReader = read('local-reader.html');
  assert.match(links, /href=["']home\.html["']/);
  assert.match(localReader, /reader\.html#screen=saved-list/);
  assert.doesNotMatch(localReader, /window\.location\.href\s*=\s*['"]reader\.html['"]/);
});

test('desktop navigation enhancement is bootstrapped after the reader code', () => {
  const source = read('recommendations.js');
  assert.match(source, /desktop-navigation\.js/);
  assert.match(source, /loadBrowserScript\('desktop-navigation\.js'\)/);
});