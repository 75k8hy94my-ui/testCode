import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { folderIdFromInput, makeListUrl, normalizeImage, imageUrls, listPublicImages } = require('../public-drive-gallery-source.js');
const folder = '1AbcDE_fgHIJkLMnOPqRsTUvW';

test('accepts raw ids and trusted Google Drive folder links only', () => {
  assert.equal(folderIdFromInput(folder), folder);
  assert.equal(folderIdFromInput('https://drive.google.com/drive/u/0/folders/' + folder + '?usp=sharing'), folder);
  assert.equal(folderIdFromInput('https://drive.google.com/open?id=' + folder), folder);
  assert.equal(folderIdFromInput('https://evil.example/folders/' + folder), '');
  assert.equal(folderIdFromInput('javascript:alert(1)'), '');
  assert.equal(folderIdFromInput('short'), '');
});

test('builds scoped Google Drive API request, without unsafe query interpolation', () => {
  const u = new URL(makeListUrl(folder, 'api-example', 'next page'));
  assert.equal(u.origin, 'https://www.googleapis.com');
  assert.equal(u.searchParams.get('q'), "'" + folder + "' in parents and trashed = false");
  assert.equal(u.searchParams.get('pageToken'), 'next page');
  assert.equal(u.searchParams.get('key'), 'api-example');
  assert.equal(u.searchParams.get('pageSize'), '1000');
});

test('filters non-images and constructs fixed-host image URLs', () => {
  assert.equal(normalizeImage({ id: folder, mimeType: 'application/pdf' }), null);
  assert.equal(normalizeImage({ id: '!!!', mimeType: 'image/png' }), null);
  assert.equal(normalizeImage({ id: folder, mimeType: 'image/jpeg', name: 'sample.jpg' }).name, 'sample.jpg');
  assert.equal(imageUrls(folder).direct, 'https://lh3.googleusercontent.com/d/' + folder);
});

test('loads all pages, deduplicates, and sorts naturally', async () => {
  const urls = [];
  const onPage = [];
  const mock = async (url) => {
    urls.push(url);
    const paged = urls.length === 1
      ? { nextPageToken: 'token-2', files: [
          { id: 'image_000000002', name: '10.jpg', mimeType: 'image/jpeg' },
          { id: 'ignore_00000000', name: 'notes.txt', mimeType: 'text/plain' }
        ] }
      : { files: [
          { id: 'image_000000001', name: '2.png', mimeType: 'image/png' },
          { id: 'image_000000002', name: '10.jpg', mimeType: 'image/jpeg' }
        ] };
    return { ok: true, json: async () => paged };
  };
  const images = await listPublicImages({ folderId: folder, apiKey: 'api-key', fetcher: mock, onPage: (data) => onPage.push(data) });
  assert.deepEqual(images.map(x => x.name), ['2.png', '10.jpg']);
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).searchParams.get('pageToken'), 'token-2');
  assert.equal(onPage.at(-1).imageCount, 2);
});

test('reports API errors and does not produce an incomplete gallery', async () => {
  await assert.rejects(
    listPublicImages({ folderId: folder, apiKey: 'key', fetcher: async () => ({
      status: 403, ok: false, json: async () => ({ error: { message: 'Forbidden' } })
    }) }),
    /HTTP 403/
  );
  await assert.rejects(
    listPublicImages({ folderId: folder, apiKey: 'key', fetcher: async () => ({
      ok: true, json: async () => ({ incompleteSearch: true, files: [] })
    }) }),
    /不完全/
  );
});

test('cached direct URLs avoid Drive API calls on reopen, including an empty folder', async () => {
  const { createCache, loadGallery, normalizeCache } = require('../public-drive-gallery-source.js');
  const manifest = createCache(folder, [
    { id: 'image_000000001', name: '写真 1.jpg' },
    { id: 'image_000000002', name: '写真 2.jpg' }
  ], '2026-10-08T00:00:00.000Z');
  assert.equal(manifest.images[0].directUrl, 'https://lh3.googleusercontent.com/d/image_000000001');
  const bomb = async () => { throw new Error('Drive API MUST NOT be called'); };
  const result = await loadGallery({ folderId: folder, cache: manifest, apiKey: 'unused', fetcher: bomb });
  assert.equal(result.source, 'cache');
  assert.equal(result.images.length, 2);
  assert.equal(normalizeCache(manifest, folder).images[1].name, '写真 2.jpg');
  const empty = await loadGallery({ folderId: folder, cache: createCache(folder, []), fetcher: bomb });
  assert.equal(empty.source, 'cache');
  assert.equal(empty.images.length, 0);
});
test('explicit refresh makes a Drive API call and cached URLs never mix between folders', async () => {
  const { createCache, loadGallery } = require('../public-drive-gallery-source.js');
  const manifest = createCache(folder, [{ id: 'image_000000001', name: 'old.jpg' }]);
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: true, json: async () => ({
    files: [{ id: 'image_000000002', name: 'new.jpg', mimeType: 'image/jpeg' }]
  }) }; };
  const fresh = await loadGallery({ folderId: folder, cache: manifest, apiKey: 'key', forceRefresh: true, fetcher });
  assert.equal(fresh.source, 'drive');
  assert.equal(fresh.images[0].name, 'new.jpg');
  assert.equal(calls, 1);
  const newFolder = '1DifferentFolderIdentifier';
  const mismatch = await loadGallery({ folderId: newFolder, cache: manifest, apiKey: 'key', fetcher });
  assert.equal(mismatch.source, 'drive');
  assert.equal(calls, 2);
});
test('rejects corrupted, duplicate, oversized or non-Google URL caches', () => {
  const { createCache, normalizeCache } = require('../public-drive-gallery-source.js');
  const valid = createCache(folder, [{ id: 'image_000000001', name: 'safe.jpg' }]);
  assert.equal(normalizeCache({ ...valid, images: [{...valid.images[0], directUrl:'https://evil.example/photo.jpg'}] },folder),null);
  assert.equal(normalizeCache({ ...valid, images: [valid.images[0], valid.images[0]] },folder),null);
  assert.equal(normalizeCache({ ...valid, updatedAt:'not-a-date' },folder),null);
  const largeName = '長'.repeat(501);
  assert.throws(() => createCache(folder, [{ id:'image_000000001',name:largeName }]),/画像名/);
});
