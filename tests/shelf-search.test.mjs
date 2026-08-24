import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildSearchText } = require('../shelf-search.js');

test('search text includes folder and video titles', () => {
  const text = buildSearchText(
    { id: 'item-1', folderId: 'folder-1', title: '作品', author: '作者', tags: ['タグ'] },
    [{ id: 'folder-1', name: 'お気に入りフォルダ' }],
    [{ id: 'video-1', folderId: 'folder-1', title: '関連動画タイトル' }],
    []
  );
  assert.match(text, /お気に入りフォルダ/);
  assert.match(text, /関連動画タイトル/);
});

test('search text includes video titles and author links', () => {
  const text = buildSearchText(
    { id: 'item-1', folderId: 'folder-1', author: '作者' },
    [],
    [{ id: 'video-1', title: '作品動画' }],
    [{ name: '作者', links: [{ url: 'https://example.com/author' }] }]
  );
  assert.match(text, /作品動画/);
  assert.match(text, /https:\/\/example\.com\/author/);
});
