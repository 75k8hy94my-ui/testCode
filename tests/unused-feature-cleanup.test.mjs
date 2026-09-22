import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

const removedPages = [
  'index-search.html',
  'hyakusen.html',
  'study.html',
  'roppo.html',
  'links.html',
  'local-reader.html'
];

const removedAssets = [
  'index-conversion-prompt.js',
  'supabase/functions/study-ai/core.mjs',
  'supabase/functions/study-ai/index.ts'
];

test('unused feature entry pages are removed', () => {
  for (const page of removedPages) assert.equal(fs.existsSync(page), false, `${page} should be removed`);
});

test('unused feature assets are removed', () => {
  for (const asset of removedAssets) assert.equal(fs.existsSync(asset), false, `${asset} should be removed`);
});

test('active shell CSS does not retain removed feature selectors', () => {
  const css = read('home-profile-shell.css');
  for (const selector of ['hyakusen', 'indexContent', 'indexShell', 'linksContent']) {
    assert.doesNotMatch(css, new RegExp(selector), `${selector} should be removed from active shell CSS`);
  }
});

test('retained entry pages do not link to removed feature routes', () => {
  for (const page of ['home.html', 'profile.html', 'reader.html', 'manga.html', 'video.html', 'sync.html']) {
    const source = read(page);
    for (const removed of removedPages) assert.doesNotMatch(source, new RegExp(`(?:href|src)=["'][^"']*${removed.replace('.', '\\.')}`), `${page} still references ${removed}`);
  }
});

test('legacy payload fields remain available for compatibility', () => {
  const vault = read('vault-payload.js');
  const backup = read('backup-format.js');
  for (const key of ['study', 'indexSearchSettings', 'roppoState']) {
    assert.match(vault, new RegExp(`\\b${key}\\b`));
    assert.match(backup, new RegExp(`\\b${key}\\b`));
  }
});
