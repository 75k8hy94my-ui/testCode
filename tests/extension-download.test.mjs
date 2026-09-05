import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');
const downloader = fs.readFileSync(new URL('../extension-download.js', import.meta.url), 'utf8');

test('vault page exposes browser extension download', () => {
  assert.match(html, /id="extensionDownloadBtn"/);
  assert.match(html, />ブラウザ拡張機能をダウンロード</);
  assert.match(html, /パッケージ化されていない拡張機能を読み込む/);
  assert.match(html, /<script src="extension-download\.js"><\/script>/);
});

test('extension downloader builds a zip from the current extension files', () => {
  assert.match(downloader, /testcode-manga-extension\.zip/);
  assert.match(downloader, /extension\/manifest\.json/);
  assert.match(downloader, /extension\/content\/site-toolbar\.js/);
  assert.match(downloader, /PK/);
});
