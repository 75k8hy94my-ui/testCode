import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop navigation keeps the manga destination active while the Reader SPA route is open', () => {
  const rail = read('app-desktop-rail.js');
  for (const [id, href] of [
    ['desktopNavHome', 'home.html'], ['desktopNavManga', 'manga.html'],
    ['desktopNavVideo', 'video.html'], ['desktopNavBackup', 'sync.html'],
    ['desktopNavSettings', 'profile.html'],
  ]) {
    assert.ok(rail.includes(id));
    assert.ok(rail.includes(href));
  }
  assert.match(rail, /page === 'manga\.html' \|\| page === 'reader\.html'/);
});

test('desktop navigation keeps its shared Liquid Glass rail and mobile breakpoint', () => {
  const rail = read('app-desktop-rail.js');
  assert.match(rail, /@media\s*\(min-width:\s*900px\)/);
  assert.match(rail, /@media\s*\(max-width:\s*899px\)/);
  assert.match(rail, /position:\s*fixed/);
  assert.match(rail, /left:\s*18px/);
  assert.match(rail, /backdrop-filter:\s*blur\(28px\)\s+saturate\(150%\)/);
  assert.match(rail, /border-radius:\s*30px/);
});

test('Reader remains an independent item page and closes to the bookshelf', () => {
  const reader = read('reader.html');
  const runtime = read('reader-runtime.js');
  assert.doesNotMatch(reader, /desktop-navigation|app-desktop-rail|mobile-bottom-nav/);
  assert.match(reader, /id="closeBtn"/);
  assert.match(runtime, /location\.replace\('manga\.html'\)/);
});

test('SPA chrome exposes shared profile action without Reader route assumptions', () => {
  for (const file of ['home.html', 'profile.html', 'manga.html', 'video.html']) {
    const source = read(file);
    const header = source.match(/<header class=["']homeHeader["'][\s\S]*?<\/header>/)?.[0] || '';
    assert.match(header, /data-profile-menu-trigger/);
    assert.doesNotMatch(header, /topActions|headerActions/);
  }
});
