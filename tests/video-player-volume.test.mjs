import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../video-player-controls.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../home-profile-shell.css', import.meta.url), 'utf8');

function createPlayer() {
  class Node {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.events = new Map();
      this.attributes = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.hidden = false;
      this.value = '';
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = [...children]; }
    addEventListener(type, listener) {
      if (!this.events.has(type)) this.events.set(type, []);
      this.events.get(type).push(listener);
    }
    emit(type) { for (const listener of this.events.get(type) || []) listener({ type, target: this }); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    querySelector(name) {
      if (!this.elements) this.elements = new Map();
      if (!this.elements.has(name)) this.elements.set(name, new Node());
      return this.elements.get(name);
    }
    contains(child) { return child === this || this.children.includes(child); }
    remove() { this.removed = true; }
  }
  const frame = new Node();
  const video = new Node();
  video.volume = 0.8;
  video.muted = false;
  video.currentTime = 0;
  video.duration = 120;
  video.paused = true;
  video.controls = true;
  video.closest = () => frame;
  video.pause = () => { video.paused = true; };
  let allowed = true;
  const document = {
    querySelector: (selector) => selector === '#videoPlayerPage video' ? video : null,
    createElement: () => new Node(),
    addEventListener() {},
    activeElement: null,
  };
  const window = {
    MangaReaderMediaAccess: { canReadProtectedData: () => allowed },
    dispatchEvent() {},
  };
  const context = {
    window, document, location: { search: '?id=movie-1' },
    URLSearchParams, localStorage: { getItem: () => null },
    setTimeout: () => 1, clearTimeout() {},
  };
  vm.runInNewContext(source, context);
  const controls = frame.children.find((item) => item.className === 'customVideoControls');
  const volumeGroup = controls?.children.find((item) => item.className === 'customVideoVolumeGroup');
  const mute = volumeGroup?.children.find((item) => item.className === 'customVideoButton customVideoMute');
  const slider = volumeGroup?.children.find((item) => item.className === 'customVideoVolume');
  return { video, frame, controls, slider, mute, window, setAllowed(value) { allowed = value; } };
}

test('player exposes an accessible volume slider and mute control', () => {
  const { slider, mute } = createPlayer();
  assert.ok(slider);
  assert.ok(mute);
  assert.equal(slider.type, 'range');
  assert.equal(slider.min, '0');
  assert.equal(slider.max, '100');
  assert.equal(slider.getAttribute('aria-label'), '音量');
  assert.equal(slider.value, '80');
  assert.equal(mute.getAttribute('aria-label'), 'ミュート');
  const icon = mute.children.find((node) => node.className === 'customVideoMuteIcon');
  assert.ok(icon, 'image icon must replace the emoji');
  assert.equal(icon.getAttribute('src'), 'assets/volume-on.png');
  assert.equal(icon.getAttribute('aria-hidden'), 'true');
  assert.doesNotMatch(source, /🔊|🔇/);
  assert.match(css, /\.customVideoMuteIcon\{/);
  for (const file of ['volume-on.png', 'volume-muted.png']) {
    const bytes = fs.readFileSync(new URL('../assets/' + file, import.meta.url));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file + ' must be a PNG image');
    assert.equal(bytes.readUInt32BE(16), 48);
    assert.equal(bytes.readUInt32BE(20), 48);
  }
  assert.match(css, /customVideoVolumeGroup/);
  assert.match(css, /max-width:620px/);
  assert.match(html, /video-player-controls\.js\?v=20261009-generated-volume-icons/);
});

test('slider sets volume; mute restores prior audible level; outside volumechange updates UI', () => {
  const { video, slider, mute, window } = createPlayer();
  slider.value = '35';
  slider.emit('input');
  assert.equal(video.volume, 0.35);
  assert.equal(video.muted, false);
  assert.equal(slider.getAttribute('aria-valuetext'), '35%');
  mute.emit('click');
  assert.equal(video.muted, true);
  assert.equal(slider.value, '0');
  assert.equal(mute.getAttribute('aria-pressed'), 'true');
  assert.equal(mute.children[0].getAttribute('src'), 'assets/volume-muted.png');
  mute.emit('click');
  assert.equal(video.muted, false);
  assert.equal(video.volume, 0.35);
  assert.equal(slider.value, '35');
  assert.equal(mute.children[0].getAttribute('src'), 'assets/volume-on.png');
  slider.value = '0';
  slider.emit('input');
  assert.equal(video.volume, 0);
  assert.equal(video.muted, true);
  mute.emit('click');
  assert.equal(video.volume, 0.35);
  assert.equal(video.muted, false);
  video.volume = 0.62;
  video.emit('volumechange');
  assert.equal(slider.value, '62');
  assert.equal(mute.getAttribute('aria-label'), 'ミュート');
  window.MangaReaderVideoPlayerControls.destroy();
  assert.equal(slider.removed, undefined);
});

test('player control cleanup removes volume UI on access loss', () => {
  const { video, controls, window, setAllowed } = createPlayer();
  assert.equal(video.dataset.customControlsReady, '1');
  setAllowed(false);
  window.MangaReaderVideoPlayerControls.destroy();
  assert.equal(controls.removed, true);
  assert.equal(video.dataset.customControlsReady, undefined);
});
