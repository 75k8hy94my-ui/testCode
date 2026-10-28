import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Loading from '../video-player-loading.js';

const ranges = (spans) => ({
  length: spans.length,
  start: (index) => spans[index][0],
  end: (index) => spans[index][1],
});

class FakeElement {
  constructor() {
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.textContent = '';
    this.attributes = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.removed = true; }
}
function fakePlayer() {
  const handlers = new Map();
  const media = {
    duration: 100, buffered: ranges([]), readyState: 0, paused: true,
    ended: false, seeking: false, error: null,
    addEventListener(name, callback) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(callback);
    },
    removeEventListener(name, callback) { handlers.get(name)?.delete(callback); },
  };
  const frame = new FakeElement();
  frame.ownerDocument = { createElement: () => new FakeElement() };
  const fire = (name) => { for (const callback of handlers.get(name) || []) callback(); };
  return { media, frame, handlers, fire };
}

test('buffered percentage uses the union of playback time, not last loaded offset', () => {
  assert.equal(Loading.bufferedPercent({ duration: 200, buffered: ranges([[0, 70]]) }), 35);
  assert.equal(Loading.bufferedPercent({ duration: 100, buffered: ranges([[50, 70], [0, 20]]) }), 40);
  assert.equal(Loading.bufferedPercent({ duration: 100, buffered: ranges([[0, 40], [30, 70]]) }), 70);
  assert.equal(Loading.bufferedPercent({ duration: 100, buffered: ranges([[-10, 60], [95, 150]]) }), 65);
});

test('percentage is withheld when video duration or buffered data is unknown', () => {
  assert.equal(Loading.bufferedPercent({ duration: Infinity, buffered: ranges([[0, 5]]) }), null);
  assert.equal(Loading.bufferedPercent({ duration: NaN, buffered: ranges([[0, 5]]) }), null);
  assert.equal(Loading.bufferedPercent({ duration: 0, buffered: ranges([[0, 5]]) }), null);
  assert.equal(Loading.bufferedPercent({ duration: 100, buffered: ranges([]) }), null);
});

test('shows loading and buffering; hides as soon as playable without waiting for 100%', () => {
  const { media, frame, fire } = fakePlayer();
  const cleanup = Loading.attach(media, frame);
  const badge = frame.children[0];
  const [label, detail, track] = badge.children;
  assert.equal(badge.hidden, false);
  assert.equal(label.textContent, '読み込み中…');
  media.buffered = ranges([[0, 35]]);
  fire('progress');
  assert.equal(label.textContent, '読み込み中… 35%');
  assert.equal(detail.hidden, false);
  assert.equal(track.hidden, false);
  media.readyState = 1;
  fire('loadedmetadata');
  assert.equal(badge.hidden, true); // preload=metadata must not spin indefinitely
  media.paused = false;
  media.readyState = 2;
  fire('play');
  assert.equal(label.textContent, 'バッファリング中… 35%');
  media.readyState = 3;
  fire('canplay');
  assert.equal(badge.hidden, true);
  cleanup();
  assert.equal(badge.removed, true);
});

test('seek, error and cleanup keep the existing player events independent', () => {
  const { media, frame, handlers, fire } = fakePlayer();
  const cleanup = Loading.attach(media, frame);
  const badge = frame.children[0];
  const label = badge.children[0];
  media.paused = false;
  media.seeking = true;
  fire('seeking');
  assert.equal(label.textContent, 'シーク先を読み込み中…');
  media.seeking = false;
  media.readyState = 2;
  fire('seeked');
  assert.equal(label.textContent, 'バッファリング中…');
  media.readyState = 3;
  fire('playing');
  assert.equal(badge.hidden, true);
  media.error = { code: 4 };
  fire('error');
  assert.equal(label.textContent, '動画を読み込めませんでした');
  cleanup();
  assert.equal(handlers.get('progress').size, 0);
  assert.equal(badge.removed, true);
});

test('player route loads buffering module before attaching the media source', () => {
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
  assert.match(html, /video-player-loading\.css/);
  assert.ok(html.indexOf('video-player-loading.js') < html.indexOf('video-player-page.js'));
  assert.ok(page.indexOf('TestCodeVideoLoading.attach(video, frame)') < page.indexOf('video.src = sourceUrl'));
});
