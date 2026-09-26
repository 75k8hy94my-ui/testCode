import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const template = read('reader-mobile-nav-template.js');
const spa = read('home-profile-spa.js');
const reader = read('reader.html');

const readerIds = ['mobileBottomNav', 'mobileNavManga', 'mobileNavVideo', 'mobileNavMore', 'mobileUtilityMenu'];
const readerMobileTemplateSrc = 'reader-mobile-nav-template.js?v=20260921-mobile-utility-contract';

test('reader.html uses the refreshed reader mobile navigation asset identifier once', () => {
  assert.equal((reader.match(/reader-mobile-nav-template\.js\?v=[^"']+/g) || []).length, 1);
  assert.match(reader, new RegExp(`<script src="${readerMobileTemplateSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"><\\/script>`));
});

test('reader mobile template replaces the generic SPA nav when reader controls are missing', () => {
  assert.match(template, /getElementById\('mobileBottomNav'\)/);
  assert.match(template, /getElementById\('mobileNavMore'\)/);
  assert.match(template, /getElementById\('mobileUtilityMenu'\)/);
  assert.match(template, /mobileBottomNav[\s\S]*mobileNavMore[\s\S]*mobileUtilityMenu/);
  assert.match(template, /mobileBottomNav[\s\S]*remove\(\)/);
});

test('reader mobile template keeps each reader id unique and does not affect generic SPA routes', () => {
  for (const id of readerIds) assert.match(template, new RegExp(`id="${id}"`), id);
  assert.match(spa, /if\(!document\.getElementById\('mobileBottomNav'\)\)/);
  assert.match(spa, /if\(!\['manga','video','reader'\]\.includes\(route\)\)cleanupReaderRuntime\(\)/);
  assert.match(template, /id="mobileUtilityMenu"/);
});

test('reader mobile utility contract matches reader event bindings', () => {
  for (const id of ['mobileNavMore', 'mobileNavManga', 'mobileNavVideo', 'mobileUtilityMenu']) {
    assert.match(reader, new RegExp(`getElementById\\(['"]${id}['"]\\)`), id);
  }
  assert.match(reader, /els\.mobileUtilityMenu\.hidden = !open/);
  assert.match(reader, /els\.mobileNavMore\.setAttribute\('aria-expanded'/);
});


test('saved-item open enters mobile reader mode before alternate-source probing', () => {
  const start = reader.indexOf('async function openItem(item, addToHistoryFlag, switchDirection)');
  const end = reader.indexOf('function closeManga()', start);
  assert.ok(start >= 0 && end > start);
  const source = reader.slice(start, end);
  assert.ok(source.indexOf('setMobileReaderMode(true)') < source.indexOf('Promise.any'));
  assert.ok(source.indexOf("els.spinner.style.display = 'block'") < source.indexOf('Promise.any'));
  assert.match(source, /els\.status\.textContent = '読み込み中\.\.\.'/);
});
