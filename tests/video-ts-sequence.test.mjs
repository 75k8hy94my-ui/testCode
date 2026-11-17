import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../video-ts-sequence.js');
const data = require('../video-data.js');

test('numbered TS URLs are video entries and generate bounded HLS playlists', () => {
  const url = 'https://media.example.test/files/001.ts?token=abc#ts=1-3&seconds=5';
  assert.equal(data.classifyVideoUrl(url).kind, 'direct');
  const conf = ts.parse(url);
  assert.ok(conf);
  assert.equal(conf.segment(2), 'https://media.example.test/files/002.ts?token=abc');
  const playlist = ts.manifest(conf);
  assert.match(playlist, /#EXT-X-ENDLIST/);
  assert.equal((playlist.match(/#EXTINF:/g) || []).length, 3);
  assert.ok(!playlist.includes('#ts='));
  assert.ok(!playlist.includes('004.ts'));
});

test('rejects unsafe or unbounded TS configurations', () => {
  assert.equal(ts.parse('javascript:alert(1)#ts=1-3'), null);
  assert.equal(ts.parse('https://x.test/1.ts#ts=1-999999'), null);
  assert.equal(ts.parse('https://x.test/1.ts#ts=2-3'), null);
  assert.equal(ts.parse('https://x.test/1.ts#ts=1-3&seconds=0'), null);
  assert.equal(data.classifyVideoUrl('https://x.test/1.ts').kind, 'link');
});
