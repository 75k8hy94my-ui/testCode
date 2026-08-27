import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('every authenticated top-level page gets a desktop Liquid Glass rail', () => {
  for (const page of ['home.html','reader.html','links.html','sync.html','local-reader.html']) {
    assert.match(read(page), /app-desktop-rail\.js/, `${page} should load the shared rail`);
  }
  assert.doesNotMatch(read('index.html'), /app-desktop-rail\.js/);
  assert.doesNotMatch(read('study.html'), /app-desktop-rail\.js/);
  assert.match(read('study.html'), /@media\(min-width:900px\)[\s\S]*#studyBottomNav\{[^}]*left:18px/);
});

test('shared rail mirrors the study desktop Liquid Glass material', () => {
  const rail = read('app-desktop-rail.js');
  for (const token of [
    'left: 18px',
    'top: 50%',
    'width: 118px',
    'border-radius: 30px',
    'blur(28px) saturate(150%)',
    'var(--rail-selection)',
    'inset 0 1px 0 var(--rail-highlight)',
    'prefers-reduced-transparency',
    'prefers-reduced-motion'
  ]) assert.ok(rail.includes(token), token);
});

test('shared rail provides global destinations and page-aware active state', () => {
  const rail = read('app-desktop-rail.js');
  const destinations = [
    ['desktopNavHome','home.html'],
    ['desktopNavManga','reader.html#screen=saved-list'],
    ['desktopNavVideo','reader.html#screen=video-list'],
    ['desktopNavStudy','study.html'],
    ['desktopNavLinks','links.html'],
    ['desktopNavAuthor','reader.html#screen=author-cards'],
    ['desktopNavBackup','reader.html#screen=backup'],
    ['desktopNavSettings','reader.html#screen=settings'],
    ['desktopNavLocalReader','local-reader.html']
  ];
  for (const [id, href] of destinations) {
    assert.ok(rail.includes(id));
    assert.ok(rail.includes(href));
  }
  assert.match(rail, /screen === 'video-list'/);
  assert.match(rail, /screen === 'author-cards'/);
  assert.match(rail, /screen === 'backup'/);
  assert.match(rail, /screen === 'settings'/);
  assert.match(rail, /aria-current/);
  assert.doesNotMatch(rail, /desktopNavVault/);
  assert.doesNotMatch(rail, /label: '保管庫'/);
});

test('shared rail reserves desktop content space, caps width, and disappears below desktop width', () => {
  const rail = read('app-desktop-rail.js');
  assert.match(rail, /--app-desktop-content-max:\s*1180px/);
  assert.match(rail, /--app-desktop-rail-offset:\s*144px/);
  assert.match(rail, /padding-left:\s*var\(--app-desktop-rail-offset\)\s*!important/);
  assert.match(rail, /body > main,[\s\S]*body > #app[\s\S]*max-width:\s*var\(--app-desktop-content-max\)\s*!important/);
  assert.match(rail, /\.screenView\s*\{[\s\S]*left:\s*var\(--app-desktop-rail-offset\)\s*!important[\s\S]*width:\s*auto\s*!important/);
  assert.match(rail, /\.screenView > \.modalPanel[\s\S]*max-width:\s*var\(--app-desktop-content-max\)\s*!important/);
  assert.match(rail, /@media \(max-width: 899px\)/);
  assert.match(rail, /\.appDesktopRailItem\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});
