import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Edit from '../video-virtual-edit.js';

const source = fs.readFileSync(new URL('../video-virtual-editor.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../video-virtual-editor.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../video-virtual-editor.css', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../video-player-page.js', import.meta.url), 'utf8');
const playerHtml = fs.readFileSync(new URL('../video-player.html', import.meta.url), 'utf8');

test('editor route loads protected media dependencies and model before controller', () => {
  assert.match(html, /id="virtualVideoEditor"/);
  assert.match(html, /video-virtual-editor\.css/);
  assert.ok(html.indexOf('media-access-gate.js') < html.indexOf('video-virtual-editor.js'));
  assert.ok(html.indexOf('vault-payload.js') < html.indexOf('video-virtual-edit-store.js'));
  assert.ok(html.indexOf('video-virtual-edit.js') < html.indexOf('video-virtual-edit-store.js'));
  assert.ok(html.indexOf('video-virtual-edit-store.js') < html.indexOf('video-virtual-editor.js'));
  assert.ok(css.includes('@media(max-width:770px)'));
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
  return {
    tag, listeners, dataset: {}, children: [], value: '', disabled: false, readyState: 0,
    duration: NaN, currentTime: 0, src: '', textContent: '',
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(type, handler) { listeners[type] = handler; },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
    removeAttribute(name) { delete this[name]; },
    pause() { this.paused = true; },
    load() { this.loaded = true; },
    dispatch(type) { return listeners[type] && listeners[type](); },
  };
}

function startEditor({ allowed = false, search = '?id=direct', data = null } = {}) {
  const all = {
    mangaReaderVideos: [
      { id: 'direct', title: '動画Ａ', url: 'https://cdn.test/a.mp4?token=abc', addedAt: 1 },
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
  const select = nodes.get('[data-source]');
  assert.equal(select.children.length, 1);
  assert.equal(select.children[0].value, 'direct');
  select.value = 'direct';
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
