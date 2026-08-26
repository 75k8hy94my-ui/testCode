import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../video-data.js';

const { classifyVideoUrl, parseLegacyUrl, isDirectVideoUrl } = data;

test('legacy service URLs are parsed internally from the URL', () => {
  assert.deepEqual(parseLegacyUrl('https://www.example.com/v/12345/anything'), { a: 'example', b: '12345' });
  assert.equal(parseLegacyUrl('https://example.com/watch/12345'), null);
});

test('direct video file URLs are classified before legacy service parsing', () => {
  assert.equal(isDirectVideoUrl('https://cdn.example.com/movie.mp4?token=abc'), true);
  assert.equal(isDirectVideoUrl('https://example.com/watch/123'), false);
  assert.deepEqual(classifyVideoUrl('https://cdn.example.com/v/123/movie.mp4?token=abc'), {
    kind: 'direct',
    url: 'https://cdn.example.com/v/123/movie.mp4?token=abc',
    a: '',
    b: '',
  });
});

test('URL classification keeps legacy support but treats arbitrary pages as URL bookmarks', () => {
  assert.deepEqual(classifyVideoUrl('https://www.example.com/v/987'), {
    kind: 'legacy',
    url: 'https://www.example.com/v/987',
    a: 'example',
    b: '987',
  });
  assert.deepEqual(classifyVideoUrl('https://videos.example.net/watch?id=abc'), {
    kind: 'link',
    url: 'https://videos.example.net/watch?id=abc',
    a: '',
    b: '',
  });
  assert.equal(classifyVideoUrl('not a url').kind, 'invalid');
});
