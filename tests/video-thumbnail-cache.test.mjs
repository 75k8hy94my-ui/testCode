import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const Cache=require('../video-thumbnail-cache.js');
const Renderer=require('../video-thumbnail-renderer.js');
const source=fs.readFileSync(new URL('../video-thumbnail-renderer.js',import.meta.url),'utf8');
const route=fs.readFileSync(new URL('../video-list-route.js',import.meta.url),'utf8');
const player=fs.readFileSync(new URL('../video-player.html',import.meta.url),'utf8');

test('cache is gated by media access',async()=>{
  assert.equal(Cache.permitted(),false);
  assert.equal(await Cache.read('https://example.com/file.mp4',0.1),null);
  assert.equal(await Cache.getOrCapture('https://example.com/file.mp4',0.1),null);
});
test('existing remote thumbnail is still prioritized',()=>{
  assert.equal(Renderer.imageUrl({url:'https://example.com/film.mp4',thumbnailUrl:'https://example.com/poster.jpg'}),'https://example.com/poster.jpg');
});
test('direct videos use cache read, capture, and fallback',()=>{
  assert.match(source,/cache\.read\(record\.url/);
  assert.match(source,/cache\.getOrCapture\(record\.url/);
  assert.match(source,/addDirectPreview\(\)/);
});
test('library and related-video page load cache before renderer',()=>{
  assert.ok(route.indexOf('video-thumbnail-cache.js') < route.indexOf('video-thumbnail-renderer.js'));
  assert.ok(player.indexOf('video-thumbnail-cache.js') < player.indexOf('video-thumbnail-renderer.js'));
});
test('cache has bounded storage and does not store raw URLs as keys',()=>{
  const content=fs.readFileSync(new URL('../video-thumbnail-cache.js',import.meta.url),'utf8');
  assert.match(content,/MAX_ITEMS=300/);
  assert.match(content,/MAX_BYTES=30\*1024\*1024/);
  assert.match(content,/SHA-256/);
  assert.match(content,/crossOrigin='anonymous'/);
});
