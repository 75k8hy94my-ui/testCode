import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../reader-runtime.js', import.meta.url), 'utf8');

test('reader runtime exposes a frozen item-scoped lifecycle and closes without shelf runtime state', () => {
  const context = { self: {}, console };
  vm.runInNewContext(source, context);
  const factory = context.self.ReaderRuntimeFactory;
  assert.ok(Object.isFrozen(factory));
  assert.deepEqual(Object.keys(factory), ['create', 'parseSequentialSource', 'numberedPageUrl']);
  assert.match(source, /function close\(\)[\s\S]*location\.replace\('manga\.html'\)/);
  assert.doesNotMatch(source, /MangaList|savedFolders|bookshelfPage|shelfSearchQuery/);
});
