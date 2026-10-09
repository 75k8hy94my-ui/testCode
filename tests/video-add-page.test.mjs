import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Data = require('../video-data.js');
const source = fs.readFileSync(new URL('../video-edit-page.js', import.meta.url), 'utf8');
const VIDEO_KEY = 'mangaReaderVideos';
const META_KEY = 'mangaReaderVideoMeta';

function startEditor({ mode = 'add', allowed = true, videos = [], meta = {} } = {}) {
  const stored = new Map([[VIDEO_KEY, JSON.stringify(videos)], [META_KEY, JSON.stringify(meta)]]);
  let reads = 0;
  const localStorage = {
    getItem(key) { reads += 1; return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, value); },
  };
  const nodes = new Map();
  function element(tag) {
    const node = {
      tag, children: [], dataset: {}, className: '', hidden: false, value: '', textContent: '',
      replaceChildren(...children) { this.children = children; },
      append(...children) { this.children.push(...children); },
      prepend(...children) { this.children.unshift(...children); },
      addEventListener(type, callback) { (this.events ||= {})[type] = callback; },
      focus() { this.focused = true; },
    };
    if (tag === 'form') {
      const fields = ['url', 'title', 'folder', 'status', 'tags', 'memo', 'favorite', 'hidden', 'rotate', 'service', 'legacyId', 'thumbnail', 'thumbnailTime'];
      node.elements = Object.fromEntries(fields.map((key) => [key, element('input')]));
      node.querySelector = (selector) => {
        if (!nodes.has(selector)) nodes.set(selector, element('control'));
        return nodes.get(selector);
      };
    }
    return node;
  }
  const page = element('main');
  const shellTitle = element('h1');
  const document = {
    getElementById(id) { return id === 'videoEditPage' ? page : id === 'shellTitle' ? shellTitle : null; },
    createElement: element,
    addEventListener() {},
  };
  const gate = { canReadProtectedData: () => allowed, syncUi() {} };
  const window = { MangaReaderVideoData: Data, MangaReaderMediaAccess: gate, crypto: { randomUUID: () => 'added-uuid' } };
  const location = { search: mode === 'add' ? '?mode=add&return=list' : '?id=existing&return=list', href: 'video-edit.html' };
  vm.runInNewContext(source, { window, document, localStorage, location, URLSearchParams, Date, Math, confirm: () => true });
  const form = page.children.find((child) => child.tag === 'form');
  return { page, form, nodes, location, localStorage, stored, shellTitle, get reads() { return reads; } };
}

test('video-add screen is a full-page, unlocked form without a delete action', async () => {
  const app = startEditor();
  assert.equal(app.shellTitle.textContent, '動画を追加');
  assert.ok(app.form, 'form should be rendered in the route');
  assert.equal(app.form.elements.url.readOnly, false);
  assert.equal(app.nodes.get('[data-edit-url]').hidden, true);
  assert.equal(app.nodes.get('[data-delete]').hidden, true);
  assert.equal(app.nodes.get('button[type="submit"]').textContent, '追加');
  app.form.elements.url.value = 'https://example.com/clip.mp4';
  app.form.elements.title.value = 'Clip';
  app.form.elements.tags.value = 'study, demo';
  app.form.elements.favorite.checked = true;
  await app.form.events.submit({ preventDefault() {} });
  const videos = JSON.parse(app.stored.get(VIDEO_KEY));
  const meta = JSON.parse(app.stored.get(META_KEY));
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, 'v-added-uuid');
  assert.equal(videos[0].url, 'https://example.com/clip.mp4');
  assert.deepEqual([...meta['v-added-uuid'].tags], ['study', 'demo']);
  assert.equal(meta['v-added-uuid'].favorite, true);
  assert.equal(app.location.href, 'video.html');
});

test('add screen rejects duplicate URLs and invalid URLs without a write', async () => {
  const existing = Data.normalizeVideo({ id: 'other', url: 'https://example.com/clip.mp4', a: 'url', b: '123' });
  const app = startEditor({ videos: [existing] });
  app.form.elements.url.value = 'https://example.com/clip.mp4';
  await app.form.events.submit({ preventDefault() {} });
  assert.match(app.nodes.get('.videoEditError').textContent, /すでに登録/);
  assert.equal(JSON.parse(app.stored.get(VIDEO_KEY)).length, 1);
  app.form.elements.url.value = 'javascript:alert(1)';
  await app.form.events.submit({ preventDefault() {} });
  assert.match(app.nodes.get('.videoEditError').textContent, /有効な動画URL/);
  assert.equal(JSON.parse(app.stored.get(VIDEO_KEY)).length, 1);
});

test('VPN-blocked add route never reads local protected data', () => {
  const app = startEditor({ allowed: false });
  assert.equal(app.form, undefined);
  assert.equal(app.reads, 0);
  assert.match(app.page.children[0].children[0].textContent, /VPN接続/);
});

test('edit route still updates the existing video without adding a new record', async () => {
  const existing = Data.normalizeVideo({ id: 'existing', title: 'Before', url: 'https://example.com/a.mp4', a: 'url', b: '12' });
  const app = startEditor({ mode: 'edit', videos: [existing] });
  assert.equal(app.shellTitle.textContent, '動画を編集');
  assert.equal(app.form.elements.url.readOnly, undefined);
  app.form.elements.title.value = 'After';
  await app.form.events.submit({ preventDefault() {} });
  const videos = JSON.parse(app.stored.get(VIDEO_KEY));
  assert.equal(videos.length, 1);
  assert.equal(videos[0].title, 'After');
  assert.equal(app.location.href, 'video.html');
});
