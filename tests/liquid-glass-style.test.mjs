import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cssUrl = new URL('../liquid-glass.css', import.meta.url);
const cssExists = fs.existsSync(cssUrl);
const css = cssExists ? fs.readFileSync(cssUrl, 'utf8') : '';
const shell = fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8');
const globalShell = fs.readFileSync(new URL('../app-global-shell.css', import.meta.url), 'utf8');
const targetPages = ['hyakusen.html', 'home.html', 'index-search.html'];
const pages = Object.fromEntries(targetPages.map((name) => [name, fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')]));

test('home-family pages load the shared home shell stylesheet', () => {
  for (const [name, html] of Object.entries(pages)) {
    assert.match(html, /<link\s+rel="stylesheet"\s+href="home-profile-shell\.css/, `${name} should load home-profile-shell.css`);
  }
});

test('shared Liquid Glass stylesheet still defines optical tokens for remaining surfaces', () => {
  assert.equal(cssExists, true, 'liquid-glass.css should exist');
  assert.match(css, /--glass-highlight:/);
  assert.match(css, /backdrop-filter:\s*blur\(/);
});

test('home-family chrome keeps a no-backdrop fallback', () => {
  const combined = shell + '\n' + globalShell;
  assert.match(combined, /backdrop-filter/);
  assert.match(combined, /@supports not \(\(backdrop-filter: blur\(1px\)\)/);
});
