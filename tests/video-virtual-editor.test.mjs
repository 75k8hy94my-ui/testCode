import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Edit from '../video-virtual-edit.js';
import EditorState from '../video-virtual-editor-state.js';
import Playback from '../video-virtual-playback.js';

const source = fs.readFileSync(new URL('../video-virtual-editor.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../video-virtual-editor.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../video-virtual-editor.css', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
const playerHtml = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');
const playerVirtualHtml = fs.readFileSync(new URL('../video-virtual-player.html', import.meta.url), 'utf8');

test('editor route loads protected media dependencies and model before controller', () => {
  assert.ok(html.indexOf('guest-mode.js') >= 0 && html.indexOf('guest-mode.js') < html.indexOf('vault-session.js'));
  assert.match(html, /id="virtualVideoEditor"/);
  assert.match(html, /video-virtual-editor\.css/);
  assert.ok(html.indexOf('media-access-gate.js') < html.indexOf('video-virtual-editor.js'));
  assert.ok(html.indexOf('vault-payload.js') < html.indexOf('video-virtual-edit-store.js'));
  assert.ok(html.indexOf('video-virtual-edit.js') < html.indexOf('video-virtual-edit-store.js'));
  assert.ok(html.indexOf('video-virtual-edit-store.js') < html.indexOf('video-virtual-editor.js'));
  assert.ok(html.indexOf('video-virtual-editor-state.js') < html.indexOf('video-virtual-editor.js'));
  assert.ok(html.indexOf('video-virtual-playback.js') < html.indexOf('video-virtual-editor.js'));
  assert.ok(css.includes('@media(max-width:770px)'));
});

test('editor renders project toolbar, preview modes, searchable source library and virtual timeline', () => {
  const harness = startEditor({ allowed: true });
  assert.match(harness.root.innerHTML, /data-project-toolbar/);
  assert.match(harness.root.innerHTML, /data-preview-source/);
  assert.match(harness.root.innerHTML, /data-preview-edit/);
  assert.match(harness.root.innerHTML, /data-source-search/);
  assert.match(harness.root.innerHTML, /data-timeline-scroll/);
  assert.match(harness.root.innerHTML, /data-playhead/);
  assert.match(harness.root.innerHTML, /data-clip-details/);
  assert.match(harness.root.innerHTML, /data-save-status/);
});

test('virtual player route applies guest storage isolation before loading protected storage', () => {
  assert.ok(playerVirtualHtml.indexOf('guest-mode.js') >= 0);
  assert.ok(playerVirtualHtml.indexOf('guest-mode.js') < playerVirtualHtml.indexOf('vault-session.js'));
});

test('MP4-only virtual editor link is separate from existing video detail action', () => {
  assert.match(player, /const edit = document\.createElement\('a'\)/);
  assert.match(player, /edit\.href = 'video-edit\.html\?id='/);
  assert.match(player, /MangaReaderVideoVirtualEdit\.isMp4Url\(sourceUrl\)/);
  assert.match(player, /virtualEdit\.href = 'video-virtual-editor\.html\?id='/);
  assert.ok(playerHtml.indexOf('video-virtual-edit.js') < playerHtml.indexOf('video-player-page.js'));
});

function element(tag = 'div') {
  const listeners = {};
  const classes = new Set();
  return {
    tag, listeners, dataset: {}, children: [], style: {}, value: '', disabled: false, readyState: 0,
    duration: NaN, currentTime: 0, src: '', textContent: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    removeEventListener(type, handler) { listeners[type] = (listeners[type] || []).filter((item) => item !== handler); },
    matches(selector) { return selector === ':active' ? !!this.active : false; },
    classList: { toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }, add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 1000, height: 300 }; },
    setPointerCapture(id) { this.capturedPointer = id; },
    hasPointerCapture(id) { return this.capturedPointer === id; },
    releasePointerCapture(id) { if (this.capturedPointer === id) this.capturedPointer = null; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
    removeAttribute(name) { delete this[name]; },
    pause() { this.paused = true; },
    load() { this.loaded = true; },
    dispatch(type, event = {}) { let result; (listeners[type] || []).forEach((handler) => { result = handler(event); }); return result; },
    play() { this.playing = true; return Promise.resolve(); },
  };
}

function startEditor({ allowed = false, search = '?id=direct', data = null } = {}) {
  const all = {
    mangaReaderVideos: [
      { id: 'direct', title: '動画Ａ', url: 'https://cdn.test/a.mp4?token=abc', addedAt: 1 },
      { id: 'long', title: '長編動画B', url: 'https://cdn.test/b.mp4', durationSeconds: 7200, addedAt: 2 },
      { id: 'embedded', title: '埋め込み', url: 'https://www.example.com/watch?v=1', addedAt: 1 },
      { id: 'webm', title: 'WebM', url: 'https://cdn.test/x.webm', addedAt: 1 },
    ],
    mangaReaderVideoMeta: { direct: { title: '動画Ａ' } },
    ...data,
  };
  const root = element('main');
  const selectorMap = new Map();
  root.querySelector = (selector) => {
    if (!selectorMap.has(selector)) selectorMap.set(selector, element());
    return selectorMap.get(selector);
  };
  const documentListeners = {};
  const windowListeners = {};
  let reads = 0;
  const calls = [];
  const stored = [];
  const repo = {
    list: () => stored,
    get: (id) => stored.find((entry) => entry.id === id) || null,
    inspect: () => ({ usable: true }),
    save: async (params) => {
      calls.push(params);
      const p = { id: 've-0000000001', title: params.title, edit: params.edit, revision: 1,
        createdAt: 1000, updatedAt: 1000, sourceFingerprints: [] };
      stored.push(p);
      return { project: p, synced: true, localSaved: true };
    },
    remove: async () => true,
  };
  const window = {
    MangaReaderVideoVirtualEdit: Edit,
    MangaReaderVideoVirtualEditorState: EditorState,
    MangaReaderVideoVirtualPlayback: Playback,
    MangaReaderVideoVirtualEditStore: {
      VIDEO_KEY: 'mangaReaderVideos', META_KEY: 'mangaReaderVideoMeta',
      createRepository: () => repo,
    },
    MangaReaderVideoData: {
      normalizeVideo: (video) => video,
      formatMediaTime: (number) => String(number) + 's',
    },
    MangaReaderMediaAccess: {
      canReadProtectedData: () => allowed,
      syncUi: () => {},
    },
    addEventListener: (type, handler) => { windowListeners[type] = handler; },
  };
  const document = {
    getElementById: () => root,
    createElement: element,
    addEventListener: (type, handler) => { documentListeners[type] = handler; },
  };
  const location = { search, href: 'https://app.test/video-virtual-editor.html' + search };
  const history = { replaceState: () => {} };
  const localStorage = { getItem(key) { reads++; return JSON.stringify(all[key] ?? null); } };
  vm.runInNewContext(source, { window, document, location, history, localStorage, URL, URLSearchParams,
    confirm: () => true });
  return {
    root, selectorMap, calls, documentListeners, windowListeners,
    setAllowed(next) { allowed = next; },
    getReads() { return reads; },
    fireAccess() { documentListeners['manga-reader-vpn-status'](); },
  };
}

test('VPN gate prevents any protected storage reads until permission is granted', () => {
  const harness = startEditor({ allowed: false });
  assert.equal(harness.getReads(), 0);
  assert.equal(harness.root.children[0].children[0].textContent, 'VPN接続が必要です');
  harness.setAllowed(true);
  harness.fireAccess();
  assert.equal(harness.getReads(), 2);
  assert.match(harness.root.innerHTML, /区間を追加/);
});

test('editor exposes only registered MP4 sources and saves time ranges without editing source video records', async () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  const sources = nodes.get('[data-source-list]');
  assert.deepEqual(sources.children.map((item) => item.dataset.sourceId), ['direct', 'long']);
  assert.equal(sources.children[0].getAttribute('aria-pressed'), 'true');
  sources.children[0].dispatch('click');
  nodes.get('[data-start]').value = '12';
  nodes.get('[data-end]').value = '25';
  nodes.get('[data-add]').dispatch('click');
  assert.equal(nodes.get('[data-save]').disabled, false);
  await nodes.get('[data-save]').dispatch('click');
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].edit.clips[0].sourceVideoId, 'direct');
  assert.equal(harness.calls[0].edit.clips[0].startSeconds, 12);
  assert.equal(harness.calls[0].edit.clips[0].endSeconds, 25);
  assert.equal(harness.calls[0].title, '動画Ａ（編集版）');
  assert.equal(nodes.get('[data-status]').textContent, '保管庫へ保存しました。');
});

test('source library search filters registered MP4 choices without loading their URLs', () => {
  const harness = startEditor({ allowed: true });
  const search = harness.selectorMap.get('[data-source-search]');
  const options = harness.selectorMap.get('[data-source-list]');
  assert.equal(options.children.length, 2);
  search.value = '長編';
  search.dispatch('input');
  assert.deepEqual(options.children.map((item) => item.dataset.sourceId), ['long']);
  assert.equal(harness.selectorMap.get('[data-source]').value, 'direct');
});

test('trim pointer movement stays transient and pointer-up commits one expanded model boundary', async () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  nodes.get('[data-start]').value = '10';
  nodes.get('[data-end]').value = '20';
  nodes.get('[data-add]').dispatch('click');
  const clip = nodes.get('[data-clips]').children[0];
  const handle = clip.children.find((child) => child.dataset.trimBoundary === 'start');
  const timeline = nodes.get('[data-timeline]');
  const event = (target, clientX) => ({ target, clientX, pointerId: 7, button: 0, preventDefault() {} });
  timeline.dispatch('pointerdown', event(handle, 0));
  timeline.dispatch('pointermove', event(handle, -24));
  assert.equal(harness.calls.length, 0, 'pointer movement must not write a project');
  assert.equal(nodes.get('[data-clips]').children[0].dataset.clipIndex, '0');
  timeline.dispatch('pointerup', event(handle, -24));
  assert.equal(harness.calls.length, 0, 'committing a draft gesture must not save it');
  await nodes.get('[data-save]').dispatch('click');
  assert.equal(harness.calls[0].edit.clips[0].startSeconds, 9);
  assert.equal(harness.calls[0].edit.clips[0].endSeconds, 20);
});

test('pointer cancellation restores the original trim without changing the draft', async () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  nodes.get('[data-start]').value = '10';
  nodes.get('[data-end]').value = '20';
  nodes.get('[data-add]').dispatch('click');
  const clip = nodes.get('[data-clips]').children[0];
  const handle = clip.children.find((child) => child.dataset.trimBoundary === 'start');
  const timeline = nodes.get('[data-timeline]');
  const event = (target, clientX) => ({ target, clientX, pointerId: 9, button: 0, preventDefault() {} });
  timeline.dispatch('pointerdown', event(handle, 0));
  timeline.dispatch('pointermove', event(handle, -48));
  timeline.dispatch('pointercancel', event(handle, -48));
  await nodes.get('[data-save]').dispatch('click');
  assert.equal(harness.calls[0].edit.clips[0].startSeconds, 10);
});

test('dragging a clip body reorders the virtual sequence only on pointer-up', async () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  nodes.get('[data-start]').value = '1';
  nodes.get('[data-end]').value = '11';
  nodes.get('[data-add]').dispatch('click');
  nodes.get('[data-source-list]').children.find((item) => item.dataset.sourceId === 'long').dispatch('click');
  nodes.get('[data-start]').value = '0';
  nodes.get('[data-end]').value = '20';
  nodes.get('[data-add]').dispatch('click');
  const timeline = nodes.get('[data-timeline]');
  const firstBody = nodes.get('[data-clips]').children[0].children.find((child) => child.dataset.clipBody === '1');
  const event = (target, clientX) => ({ target, clientX, pointerId: 11, button: 0, preventDefault() {} });
  timeline.dispatch('pointerdown', event(firstBody, 30));
  timeline.dispatch('pointermove', event(firstBody, 24 * 29));
  assert.equal(harness.calls.length, 0);
  timeline.dispatch('pointerup', event(firstBody, 24 * 29));
  await nodes.get('[data-save]').dispatch('click');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].edit.clips.map((item) => item.sourceVideoId))), ['long', 'direct']);
});

test('draft undo and redo restore committed edits without saving and preserve native input shortcuts', async () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  nodes.get('[data-title]').value = 'Undo test';
  nodes.get('[data-source-list]').children[0].dispatch('click');
  nodes.get('[data-end]').value = '10';
  nodes.get('[data-add]').dispatch('click');
  nodes.get('[data-duplicate]').dispatch('click');
  const undo = harness.documentListeners.keydown;
  let prevented = false;
  undo({ key: 'z', ctrlKey: true, target: { tagName: 'INPUT' }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false, 'text editing keeps the browser undo shortcut');
  undo({ key: 'z', ctrlKey: true, target: { tagName: 'MAIN' }, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(harness.calls.length, 0, 'undo remains draft-only');
  nodes.get('[data-redo]').dispatch('click');
  await nodes.get('[data-save]').dispatch('click');
  assert.equal(harness.calls.length, 1, 'explicit save is the only persistence call: ' + nodes.get('[data-status]').textContent);
  assert.equal(harness.calls[0].edit.clips.length, 2);
});

test('edit preview reuses virtual playback and destroys its controller on source-mode exit', () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  nodes.get('[data-source-list]').children[0].dispatch('click');
  nodes.get('[data-end]').value = '10';
  nodes.get('[data-add]').dispatch('click');
  const preview = nodes.get('[data-preview]');
  preview.readyState = 1;
  nodes.get('[data-preview-edit]').dispatch('click');
  assert.equal(nodes.get('[data-edit-controls]').hidden, false);
  assert.equal(preview.controls, false);
  assert.equal(preview.src, 'https://cdn.test/a.mp4?token=abc');
  preview.dispatch('loadedmetadata');
  assert.match(nodes.get('[data-edit-time]').textContent, /0s \/ 10s/);
  nodes.get('[data-preview-source]').dispatch('click');
  assert.equal(nodes.get('[data-edit-controls]').hidden, true);
  assert.equal(preview.controls, true);
  assert.equal((preview.listeners.loadedmetadata || []).length, 1, 'destroy removes playback engine listeners');
});

test('selected clip can be duplicated, independently trimmed and precisely adjusted before save', async () => {
  const harness = startEditor({ allowed: true });
  const nodes = harness.selectorMap;
  nodes.get('[data-source]').value = 'direct';
  nodes.get('[data-start]').value = '10.1';
  nodes.get('[data-end]').value = '20';
  nodes.get('[data-add]').dispatch('click');
  nodes.get('[data-duplicate]').dispatch('click');
  assert.equal(nodes.get('[data-clips]').children.length, 2);
  assert.equal(nodes.get('[data-clips]').children[1].getAttribute('aria-current'), 'true');
  nodes.get('[data-start-plus-tenth]').dispatch('click');
  nodes.get('[data-end-minus-one]').dispatch('click');
  const video = nodes.get('[data-preview]');
  video.readyState = 1;
  video.currentTime = 15.25;
  nodes.get('[data-set-start]').dispatch('click');
  await nodes.get('[data-save]').dispatch('click');
  const clips = harness.calls[0].edit.clips;
  assert.deepEqual(JSON.parse(JSON.stringify(clips)), [
    { sourceVideoId: 'direct', startSeconds: 10.1, endSeconds: 20 },
    { sourceVideoId: 'direct', startSeconds: 15.25, endSeconds: 19 },
  ]);
  assert.equal(nodes.get('[data-start]').value, '15.25');
  assert.equal(nodes.get('[data-end]').value, '19');
  assert.equal(nodes.get('[data-dirty]').hidden, true);
});

test('access revocation releases MP4 preview and clears the protected editor', () => {
  const harness = startEditor({ allowed: true });
  const video = harness.selectorMap.get('[data-preview]');
  assert.equal(video.src, 'https://cdn.test/a.mp4?token=abc');
  harness.setAllowed(false);
  harness.fireAccess();
  assert.equal(video.src, undefined);
  assert.equal(video.paused, true);
  assert.equal(harness.root.children[0].children[0].textContent, 'VPN接続が必要です');
});

test('editor does not initialize a non-MP4 URL from the watch-page route', () => {
  const harness = startEditor({ allowed: true, search: '?id=webm' });
  assert.equal(harness.root.children[0].children[1].textContent.includes('MP4直リンク'), true);
});
