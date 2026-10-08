import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Renderer = require('../video-thumbnail-renderer.js');

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.listeners = {}; this.dataset = {}; this.style = {}; this.hidden = false; }
  append(...nodes) { nodes.forEach((node) => { node.parentNode = this; this.children.push(node); }); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type) { (this.listeners[type] || []).forEach((listener) => listener({ type, target: this })); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this); }
}
const documentRef = { createElement: (tagName) => new Element(tagName) };

test('saved thumbnails take precedence and YouTube URLs derive a thumbnail', () => {
  assert.equal(Renderer.imageUrl({ thumbnailUrl: 'https://cdn.example/thumb.jpg', url: 'https://youtu.be/abc123' }), 'https://cdn.example/thumb.jpg');
  assert.equal(Renderer.imageUrl({ url: 'https://youtu.be/abc123' }), 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  assert.equal(Renderer.imageUrl({ url: 'https://youtube.com/watch?v=xyz789' }), 'https://i.ytimg.com/vi/xyz789/hqdefault.jpg');
  assert.equal(Renderer.imageUrl({ url: 'https://example.com/watch/123' }), '');
});

test('image load hides fallback and failure restores it before direct-video fallback', () => {
  const container = new Element('span');
  const result = Renderer.render(container, { thumbnailUrl: 'https://cdn.example/missing.jpg', url: 'https://cdn.example/movie.mp4', thumbnailTimeSeconds: 12 }, { documentRef });
  result.image.dispatch('error');
  assert.equal(result.video.tagName, 'video');
  result.video.dispatch('loadedmetadata');
  assert.equal(result.video.currentTime, 12);
  result.video.dispatch('seeked');
  assert.equal(result.video.dataset.frameReady, '1');
  assert.equal(result.fallback.hidden, true);
  result.video.dispatch('error');
  assert.equal(result.fallback.hidden, false);
});

test('missing image and failed direct video leave the play fallback visible', () => {
  const container = new Element('span');
  const result = Renderer.render(container, { url: 'https://cdn.example/movie.mp4' }, { documentRef });
  result.video.dispatch('error');
  assert.equal(result.fallback.hidden, false);
  assert.equal(container.children.includes(result.video), false);
});
