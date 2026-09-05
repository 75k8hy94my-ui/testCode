import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../sync.html', import.meta.url), 'utf8');
const zipPath = new URL('../downloads/testcode-manga-extension.zip', import.meta.url);

test('vault page exposes browser extension download', () => {
  assert.match(html, /href="downloads\/testcode-manga-extension\.zip"/);
  assert.match(html, />ブラウザ拡張機能をダウンロード</);
  assert.match(html, /パッケージ化されていない拡張機能を読み込む/);
});

test('extension download ZIP exists and is a ZIP archive', () => {
  assert.ok(fs.existsSync(zipPath));
  const bytes = fs.readFileSync(zipPath);
  assert.ok(bytes.length > 1000);
  assert.equal(bytes.subarray(0, 4).toString('hex'), '504b0304');
});
