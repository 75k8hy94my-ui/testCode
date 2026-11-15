import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const appPages = [
  'home.html', 'manga.html', 'video.html', 'profile.html', 'add.html',
  'images.html', 'video-shorts.html', 'video-player.html', 'video-properties.html',
  'video-edit.html', 'video-virtual-editor.html', 'video-virtual-player.html',
  'definition-cards.html', 'statutes.html',
];
const standalonePages = [
  'index.html', 'sync.html', 'reader.html', 'drive-gallery.html',
  'manga-sandbox.html', 'game/index.html', 'fsrs-trainer/index.html',
];

test('every app HTML entry uses the same desktop width stylesheet before first paint', () => {
  // Automatically include any future root HTML route, not only the current list.
  const rootPages = fs.readdirSync(new URL('../', import.meta.url)).filter(file => file.endsWith('.html'));
  const allPages = [...new Set([...rootPages, ...appPages, ...standalonePages])];
  for (const file of allPages) {
    const html = read(file);
    assert.match(html, /<html[^>]*class=["'][^"']*\bapp-content-width-page\b[^"']*["']/i, file);
    const relative = file.includes('/') ? '../' : '';
    assert.ok(html.includes(`${relative}app-content-width.css?v=20261115-shared-width`), file);
  }
});

test('navigation pages reserve the same rail space from the initial HTML', () => {
  for (const file of appPages) {
    assert.match(read(file), /<html[^>]*class=["'][^"']*\bapp-desktop-rail-page\b[^"']*["']/i, file);
  }
  for (const file of standalonePages) {
    assert.doesNotMatch(read(file), /<html[^>]*class=["'][^"']*\bapp-desktop-rail-page\b[^"']*["']/i, file);
  }
});

test('shared width rule covers main and div shells, including full-screen exceptions', () => {
  const css = read('app-content-width.css');
  assert.match(css, /--app-content-max-width:\s*920px/);
  assert.match(css, /--app-desktop-rail-offset:\s*58px\s*!important/);
  assert.match(css, /body\s*>\s*:is\(main,\s*\.homeShell,\s*#app\)/);
  assert.match(css, /width:\s*min\(100%,\s*var\(--app-content-max-width\)\)\s*!important/);
  assert.match(css, /@media\s*\(min-width:\s*900px\)/);
  assert.match(css, /:fullscreen/);
});
