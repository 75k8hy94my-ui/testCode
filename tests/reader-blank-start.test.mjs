import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtimeFactory = require('../reader-runtime.js');
const html = fs.readFileSync(new URL('../reader.html', import.meta.url), 'utf8');

function fixture(item, source) {
  const elements = new Map();
  for (const id of ['currentTitle', 'readerStatus', 'pageLabel', 'pageSlider', 'retryPageBtn', 'verticalBtn', 'favToggleBtn', 'closeBtn']) {
    elements.set(id, { textContent: '', value: '', hidden: true, classList: { toggle() {} } });
  }
  const doc = {
    body: { classList: { toggle() {}, add() {}, contains() { return false; } } },
    getElementById(id) { return elements.get(id) || null; },
  };
  const win = {
    localStorage: { getItem() { return null; }, setItem() {} },
    EncryptedAssetItem: { encryptedAssetPagesForItem() { return []; } },
  };
  const repository = {
    loadItem(id) { return id === item.id ? item : null; },
    saveItem(value) { return value; },
    scheduleSync() {},
  };
  const runtime = runtimeFactory.create({
    repository,
    target: { itemResumeKey(id) { return `item:${id}`; } },
    location: { replace() {} },
    document: doc,
    window: win,
    pageSource: source,
  });
  return { runtime, elements };
}

test('failed first-page discovery is not reported as successful Reader startup', async () => {
  const item = { id: 'book', title: 'Saved title', pageManifest: { version: 1, pages: [] } };
  const { runtime, elements } = fixture(item, { async resolve() { return { item, urls: [] }; } });
  await assert.rejects(runtime.start('book'), /最初のページを表示できませんでした/);
  assert.equal(elements.get('currentTitle').textContent, 'Saved title');
  assert.equal(elements.get('readerStatus').textContent, '画像を見つけられませんでした。');
  runtime.destroy();
});

test('missing encrypted pages leave a visible diagnostic rather than a successful blank view', async () => {
  const item = { id: 'book', title: 'Protected title', encryptedAssets: { pages: [] } };
  const { runtime, elements } = fixture(item, { async resolve() { throw new Error('must not probe'); } });
  await assert.rejects(runtime.start('book'), /最初のページを表示できませんでした/);
  assert.equal(elements.get('readerStatus').textContent, '暗号化ページがありません。');
  runtime.destroy();
});

test('unexpected Reader boot failure reveals recovery links instead of retaining auth-pending visibility', () => {
  assert.match(html, /MangaReaderBootPromise = \(async \(\) => \{/);
  assert.match(html, /\}\)\(\)\.catch\(\(\) => \{/);
  assert.match(html, /document\.documentElement\.classList\.remove\('auth-pending'\)/);
  assert.match(html, /リーダーを起動できませんでした/);
  assert.match(html, /\['manga\.html', '本棚へ戻る'\]/);
  assert.match(html, /\['sync\.html', '保管庫を確認'\]/);
});
