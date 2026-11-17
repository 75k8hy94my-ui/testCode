import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../video-ts-sequence.js');
const data = require('../video-data.js');

test('bare numbered TS URLs register as direct videos and retain optional ranges', () => {
  const bare = 'https://media.example.test/files/001.ts?token=abc';
  assert.equal(data.classifyVideoUrl(bare).kind, 'direct');
  const auto = ts.parse(bare);
  assert.equal(auto.start, 1);
  assert.equal(auto.end, null);
  assert.equal(auto.seconds, 6);
  assert.equal(auto.segment(2), 'https://media.example.test/files/002.ts?token=abc');
  const manual = ts.parse(bare + '#ts=1-3&seconds=5');
  assert.equal(manual.end, 3);
  assert.equal(manual.seconds, 5);
  const playlist = ts.manifest(manual);
  assert.equal((playlist.match(/#EXTINF:/g) || []).length, 3);
  assert.match(playlist, /#EXT-X-ENDLIST/);
  assert.ok(!playlist.includes('#ts='));
});

test('auto-discovery locates final segment using HEAD without downloading bodies', async () => {
  const requests = [];
  const fetchStub = async (url, options) => {
    requests.push({ url, options });
    const n = Number(new URL(url).pathname.match(/\/(\d+)\.ts$/)[1]);
    return { ok: n <= 57, status: n <= 57 ? 200 : 404, headers: { get: () => 'video/mp2t' } };
  };
  const conf = ts.parse('https://media.example.test/a/1.ts');
  assert.equal(await ts.discoverEnd(conf, fetchStub), 57);
  assert.ok(requests.length < 25);
  assert.ok(requests.every(x => x.options.method === 'HEAD'));
  conf.end = 57;
  assert.equal((ts.manifest(conf).match(/#EXTINF:/g) || []).length, 57);
});

test('auto-discovery distinguishes missing video and network failures', async () => {
  const conf = ts.parse('https://x.test/1.ts');
  await assert.rejects(ts.discoverEnd(conf, async () => ({ status: 404, ok: false })), /最初/);
  await assert.rejects(ts.discoverEnd(conf, async () => { throw Error('CORS'); }), /CORS/);
  assert.equal(ts.parse('https://x.test/1.ts#ts=1-999999'), null);
  assert.equal(ts.parse('https://x.test/1.ts#ts=2-3'), null);
  assert.equal(ts.parse('https://x.test/1.ts#seconds=0'), null);
  assert.equal(ts.parse('javascript:alert(1)#ts=1-3'), null);
});
