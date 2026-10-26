import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const controls = fs.readFileSync(new URL('../video-player-controls.js', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');

function createPlayer(saved = {}, options = {}) {
  class Node {
    constructor(tagName = 'DIV') {
      this.tagName = tagName;
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.events = new Map();
      this.attributes = {};
      const classes = new Set();
      this.classList = {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, forced) {
          const shouldAdd = forced === undefined ? !classes.has(name) : Boolean(forced);
          if (shouldAdd) classes.add(name); else classes.delete(name);
          return shouldAdd;
        },
      };
      this.hidden = false;
      this.value = '';
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    addEventListener(type, listener) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(listener); }
    emit(type, event = {}) { for (const listener of this.events.get(type) || []) listener({ type, target: this, ...event }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    contains(child) { return child === this || this.children.includes(child); }
    remove() { this.removed = true; }
  }
  const frame = new Node();
  const video = new Node('VIDEO'); Object.assign(video, { volume: .8, muted: false, currentTime: 11.25, duration: 60, paused: true });
  video.closest = () => frame;
  video.pause = () => { video.paused = true; video.emit('pause'); };
  video.play = () => { video.paused = false; video.emit('play'); };
  const documentEvents = new Map();
  const document = {
    querySelector: (selector) => selector === '#videoPlayerPage video' ? video : null,
    createElement: (tag) => new Node(tag.toUpperCase()),
    addEventListener(type, listener) { documentEvents.set(type, listener); },
    removeEventListener(type) { documentEvents.delete(type); },
    activeElement: null,
  };
  const events = [];
  const localStorage = { getItem: (key) => key in saved ? JSON.stringify(saved[key]) : null, setItem: (key, value) => { events.push('persist'); saved[key] = JSON.parse(value); } };
  const window = { MangaReaderMediaAccess: { canReadProtectedData: () => true }, TestCodeGuest: { isActive: () => options.guest !== false }, MangaVaultPayload: { normalizeVideoMarkers: (value) => value, pointerPath: (...parts) => '/' + parts.join('/') }, dispatchEvent() {} };
  if (options.guest === false) {
    window.MangaVault = options.vault;
  }
  class CustomEvent { constructor(type) { this.type = type; } }
  vm.runInNewContext(controls, { window, document, location: { search: '?id=clip' }, localStorage, URLSearchParams, CustomEvent, crypto: { randomUUID: () => 'test-id' }, setTimeout: () => 1, clearTimeout() {} });
  const centerPlay = frame.children.find((node) => node.className === 'customVideoCenterPlay');
  const frameControls = frame.children.find((node) => node.className === 'customVideoControls');
  const seekWrap = frameControls.children.find((node) => node.className === 'customVideoSeekWrap');
  const markerToggle = frameControls.children.find((node) => node.textContent === '秒数登録');
  const panel = frame.children.find((node) => node.className === 'videoMarkerPanel');
  const choices = panel.children[0]; const add = panel.children[1];
  return { frame, video, centerPlay, frameControls, seekWrap, markerToggle, panel, choices, add, saved, documentEvents, events };
}

test('timestamp registration offers only the four canonical icons without name or seconds fields', () => {
  assert.match(controls, /\['water', 'triangle', 'toilet', 'hand'\]/);
  assert.match(controls, /choice\.dataset\.markerIcon = icon/);
  assert.doesNotMatch(controls, /videoMarkerSeconds|videoMarkerLabel/);
  assert.match(controls, /icon:\s*selectedMarkerIcon/);
});

test('saved timeline icons are positioned by duration and clicking one seeks to its marker', () => {
  assert.match(controls, /videoMarkerBubble/);
  assert.match(controls, /marker\.seconds\s*\/\s*playback\.duration/);
  assert.match(controls, /playback\.currentTime\s*=\s*marker\.seconds/);
  assert.match(controls, /manga-video-markers-changed/);
});

test('marker deletion journals its stable nested ID before persisting the local marker map', () => {
  assert.match(controls, /recordSyncDeletion\(deletedMarkers\.map\(\(marker\) => pointerPath\('videoMarkers', id, marker\.id\)\), persist\)/);
  assert.match(controls, /save\(next, \[marker\]\)/);
  assert.match(controls, /markLocalChangesPending\(\)/);
});

test('left and right arrows seek ten seconds and editable controls are ignored', () => {
  assert.match(controls, /ArrowLeft/);
  assert.match(controls, /ArrowRight/);
  assert.match(controls, /10/);
  assert.match(controls, /isContentEditable/);
  assert.match(controls, /preventDefault\(\)/);
});

test('player page renders accessible icon-only marker actions and migrates legacy marker labels', () => {
  assert.match(page, /normalizeVideoMarkers/);
  assert.match(page, /marker\.icon/);
  assert.match(page, /aria-label/);
  assert.doesNotMatch(page, /marker\.label/);
});

test('registers the selected icon at the current time, draws a proportional seek bubble, and jumps on click', async () => {
  const player = createPlayer();
  player.markerToggle.emit('click');
  assert.equal(player.panel.hidden, false);
  const toilet = player.choices.children.find((choice) => choice.dataset.markerIcon === 'toilet');
  toilet.emit('click');
  player.add.emit('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(player.saved.mangaReaderVideoMarkers.clip, [{ id: 'marker-test-id', seconds: 11.25, icon: 'toilet' }]);
  const bubble = player.seekWrap.children.find((node) => node.className === 'videoMarkerBubble');
  assert.equal(bubble.style.left, '18.75%');
  assert.equal(bubble.getAttribute('aria-label'), 'トイレマーク 0:11へ移動');
  player.video.currentTime = 0;
  bubble.emit('click', { stopPropagation() {} });
  assert.equal(player.video.currentTime, 11.25);
  assert.equal(player.video.paused, false);
});

test('marker deletion records the stable identity before local persistence and schedules sync', async () => {
  const calls = [];
  const vault = {
    markLocalChangesPending() { calls.push('pending'); return true; },
    async recordSyncDeletion(paths, mutate) { calls.push(['journal', paths]); await mutate(); },
    async saveLocalChanges() { calls.push('sync'); },
  };
  const player = createPlayer({ mangaReaderVideoMarkers: { clip: [{ id: 'm1', seconds: 15, icon: 'water' }] } }, { guest: false, vault });
  player.markerToggle.emit('click');
  const list = player.panel.children[3];
  const row = list.children[0];
  const remove = row.children[1];

  remove.emit('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['journal', ['/videoMarkers/clip/m1']]);
  assert.ok(player.events.includes('persist'));
  assert.ok(calls.includes('sync'));
  assert.deepEqual(player.saved.mangaReaderVideoMarkers, {});
});

test('left and right arrow keys seek ten seconds while editable controls retain their keys', () => {
  const player = createPlayer();
  const listener = player.documentEvents.get('keydown');
  let prevented = 0;
  listener({ key: 'ArrowLeft', target: { tagName: 'DIV' }, preventDefault() { prevented += 1; } });
  assert.equal(player.video.currentTime, 1.25);
  listener({ key: 'ArrowRight', target: { tagName: 'DIV' }, preventDefault() { prevented += 1; } });
  assert.equal(player.video.currentTime, 11.25);
  listener({ key: 'ArrowRight', target: { tagName: 'INPUT' }, preventDefault() { prevented += 1; } });
  assert.equal(player.video.currentTime, 11.25);
  assert.equal(prevented, 2);
});

test('center play/pause is the only playback toggle; video taps hide or show controls without pausing', () => {
  const player = createPlayer();
  const { frame, video, centerPlay, frameControls } = player;
  assert.ok(centerPlay);
  assert.ok(!frameControls.children.includes(centerPlay), 'play button must not be in the bottom bar');
  assert.equal(centerPlay.getAttribute('aria-label'), '再生');
  assert.equal(frame.classList.contains('controlsVisible'), true);

  centerPlay.emit('click', { stopPropagation() {} });
  assert.equal(video.paused, false);
  assert.equal(centerPlay.getAttribute('aria-label'), '一時停止');

  video.emit('click', { clientX: 100 });
  assert.equal(frame.classList.contains('controlsVisible'), false);
  assert.equal(video.paused, false, 'tapping the picture cannot pause playback');

  video.emit('click', { clientX: 100 });
  assert.equal(frame.classList.contains('controlsVisible'), true);
  assert.equal(video.paused, false, 'revealing the UI cannot restart or pause playback');

  centerPlay.emit('click', { stopPropagation() {} });
  assert.equal(video.paused, true);
  assert.equal(centerPlay.getAttribute('aria-label'), '再生');
  video.emit('click', { clientX: 100 });
  assert.equal(frame.classList.contains('controlsVisible'), false);
  assert.equal(video.paused, true, 'the UI can be dismissed even when paused');
});

test('the video overlay remains independent of seek and marker controls', () => {
  const player = createPlayer();
  player.centerPlay.emit('click', { stopPropagation() {} });
  player.markerToggle.emit('click');
  assert.equal(player.panel.hidden, false);
  assert.equal(player.video.paused, false);
  const seek = player.seekWrap.children.find((node) => node.className === 'customVideoSeek');
  seek.value = '33';
  seek.emit('input');
  assert.equal(player.video.currentTime, 33);
  assert.equal(player.video.paused, false);
});

test('the centered button and hidden-controls state have accessible responsive styles', () => {
  const css = fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
  assert.match(css, /\.customVideoPlayer\.controlsVisible \.customVideoCenterPlay/);
  assert.match(css, /\.customVideoPlayer:not\(\.controlsVisible\) \.customVideoControls/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.customVideoCenterPlay:focus-visible/);
  assert.match(html, /video-player-controls\.js\?v=20261026-video-privacy/);
});
