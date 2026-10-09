import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Edit from '../video-virtual-edit.js';

const code = fs.readFileSync(new URL('../video-virtual-player-page.js', import.meta.url), 'utf8');
const SOURCE_URL = 'https://cdn.example.test/clip.mp4?key=abc';
const saved = {
  id: 've-12345678', title: 'Edited take',
  edit: Edit.createEdit([{sourceVideoId: 'first', startSeconds: 3, endSeconds: 8}]),
  sourceFingerprints: [{sourceVideoId: 'first', fingerprint: 'fingerprint'}],
};
function node(tag = 'div') {
  const handlers = {};
  return {
    tag, handlers, textContent: '', value: '', href: '', dataset: {}, children: [],
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(kind, fn) { handlers[kind] = fn; },
    setAttribute(key, value) { this[key] = value; },
    trigger(kind, event) { handlers[kind]?.(event); },
  };
}
function start({ initialPermission = false, sourceValid = true } = {}) {
  const elements = new Map();
  const page = node('main');
  page.querySelector = (sel) => {
    if (!elements.has(sel)) elements.set(sel, node());
    return elements.get(sel);
  };
  const documentEvents = {};
  const windowEvents = {};
  let permission = initialPermission;
  let reads = 0;
  let destroys = 0;
  let playerCreations = 0;
  const seeks = [];
  let playCalls = 0;
  const window = {
    MangaReaderVideoVirtualEdit: Edit,
    MangaReaderVideoVirtualEditStore: {
      VIDEO_KEY: 'mangaReaderVideos', META_KEY: 'mangaReaderVideoMeta',
      sourceFingerprint: () => sourceValid ? 'fingerprint' : 'other',
      createRepository: () => ({
        get: (id) => id === saved.id ? saved : null,
        inspect: () => ({ usable: true }),
      }),
    },
    MangaReaderVideoVirtualPlayback: {
      createController({ onState }) {
        playerCreations++;
        onState({
          phase: 'idle', requestedPlay: false, clipIndex: -1,
          virtualSeconds: 0, totalSeconds: 5, message: '', error: '',
        });
        return {
          snapshot: () => ({ requestedPlay: false, totalSeconds: 5 }),
          seek(value) { seeks.push(value); },
          play() { playCalls++; },
          pause() {},
          destroy() { destroys++; },
        };
      },
    },
    MangaReaderVideoData: {normalizeVideo: x => x},
    MangaReaderMediaAccess: {canReadProtectedData: () => permission, syncUi() {}},
    addEventListener(kind, fn) { windowEvents[kind] = fn; },
  };
  const document = {
    getElementById: () => page,
    createElement: node,
    addEventListener(kind, fn) { documentEvents[kind] = fn; },
    title: '',
  };
  const storage = {
    getItem(name) {
      reads++;
      return JSON.stringify(name === 'mangaReaderVideos'
        ? [{id: 'first', title: 'Source MP4', url: SOURCE_URL, addedAt: 10}]
        : {});
    },
  };
  vm.runInNewContext(code, {
    window, document, localStorage: storage, URLSearchParams,
    location: {search: '?project=ve-12345678'},
  });
  return {
    page, elements, documentEvents, windowEvents,
    allow(value) { permission = value; documentEvents['manga-reader-vpn-status'](); },
    triggerStorage(key) { windowEvents.storage({key}); },
    firePagehide() { windowEvents.pagehide(); },
    firePageshow() { windowEvents.pageshow(); },
    get reads() { return reads; },
    get destroys() { return destroys; },
    get creations() { return playerCreations; },
    get seeks() { return seeks; },
    get playCalls() { return playCalls; },
  };
}

test('virtual player never reads protected storage or constructs media while VPN gate is closed', () => {
  const ui = start();
  assert.equal(ui.reads, 0);
  assert.equal(ui.creations, 0);
  assert.equal(ui.page.children[0].children[0].textContent, 'VPN接続が必要です');
  ui.allow(true);
  assert.equal(ui.creations, 1);
  assert.equal(ui.reads, 2);
  assert.match(ui.page.innerHTML, /data-media/);
  assert.equal(ui.elements.get('[data-title]').textContent, 'Edited take');
  assert.equal(ui.elements.get('[data-seek]').max, '5');
});

test('virtual controls use total-timeline positions and pagehide releases media resources', () => {
  const ui = start({initialPermission: true});
  ui.elements.get('[data-play]').trigger('click');
  assert.equal(ui.playCalls, 1);
  ui.elements.get('[data-seek]').value = '3.5';
  ui.elements.get('[data-seek]').trigger('input');
  assert.equal(ui.elements.get('[data-time]').textContent, '0:03 / 0:05');
  ui.elements.get('[data-seek]').trigger('change');
  assert.equal(ui.seeks[0], 3.5);
  ui.firePagehide();
  assert.equal(ui.destroys, 1);
  ui.firePageshow();
  assert.equal(ui.creations, 2);
});

test('VPN loss and cross-tab edits destroy the player and require a fresh validation', () => {
  const ui = start({initialPermission: true});
  ui.allow(false);
  assert.equal(ui.destroys, 1);
  assert.equal(ui.page.children[0].children[0].textContent, 'VPN接続が必要です');
  ui.allow(true);
  assert.equal(ui.creations, 2);
  ui.triggerStorage('mangaReaderVideos');
  assert.equal(ui.destroys, 2);
  assert.equal(ui.page.children[0].children[0].textContent, '動画情報が更新されました');
});

test('replaced MP4 URL is detected and never assigned to the video', () => {
  const ui = start({initialPermission: true, sourceValid: false});
  assert.equal(ui.creations, 0);
  assert.equal(ui.page.children[0].children[0].textContent, '動画を再生できません');
});
