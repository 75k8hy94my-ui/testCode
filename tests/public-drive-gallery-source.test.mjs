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
