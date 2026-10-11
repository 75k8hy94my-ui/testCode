import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../video-card.js', import.meta.url), 'utf8');

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.hidden = false;
    this.className = '';
    this.textContent = '';
  }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type) {
    const event = { type, target: this, defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; } };
    let node = this;
    while (node) {
      for (const listener of node.listeners[type] || []) listener(event);
      if (event.propagationStopped) break;
      node = node.parentNode;
    }
    return event;
  }
}

function setup() {
  const window = {};
  vm.runInNewContext(source, { window });
  const documentRef = { createElement: (tag) => new Element(tag) };
  return { VideoCard: window.MangaReaderVideoCard, documentRef };
}

function byClass(root, className) {
  if (root.className.split(/\s+/).includes(className)) return root;
  for (const child of root.children) {
    const found = byClass(child, className);
    if (found) return found;
  }
  return null;
}

test('video card formats known durations without inventing one when absent', () => {
  const { VideoCard } = setup();
  assert.equal(VideoCard.formatDuration(0), '');
  assert.equal(VideoCard.formatDuration(65), '1:05');
  assert.equal(VideoCard.formatDuration(3661), '1:01:01');
});

test('card menu opens without invoking playback and links to the existing editor', () => {
  const { VideoCard, documentRef } = setup();
  let opens = 0;
  const card = VideoCard.create({ id: 'clip 1', title: 'A long title', tags: ['tag'] }, {
    documentRef, layout: 'related', openHref: 'video-player.html?id=clip%201',
    editHref: 'video-edit.html?id=clip%201&return=player',
    thumbnailRenderer: { render() {} },
    onOpen() { opens += 1; },
  });
  const toggle = byClass(card, 'videoCardMenuButton');
  const menu = byClass(card, 'videoCardMenu');
  const edit = byClass(card, 'videoCardMenuEdit');

  assert.ok(toggle);
  assert.ok(menu);
  assert.ok(edit);
  assert.equal(edit.href, 'video-edit.html?id=clip%201&return=player');
  const click = toggle.dispatch('click');
  assert.equal(click.defaultPrevented, true);
  assert.equal(click.propagationStopped, true);
  assert.equal(menu.hidden, false);
  assert.equal(opens, 0);
});

test('card open target keeps the requested player route and only real metadata is rendered', () => {
  const { VideoCard, documentRef } = setup();
  const card = VideoCard.create({ id: 'known', title: 'Known title', durationSeconds: 125, tags: ['one'], folderId: 'folder' }, {
    documentRef, layout: 'related', openHref: 'video-player.html?id=known', editHref: 'video-edit.html?id=known&return=player',
    thumbnailRenderer: { render() {} }, metadata: ['Actual folder'],
  });
  assert.equal(byClass(card, 'videoCardOpen').href, 'video-player.html?id=known');
  assert.equal(byClass(card, 'videoCardDuration').textContent, '2:05');
  assert.equal(byClass(card, 'videoCardMeta').textContent, 'Actual folder');
  assert.equal(byClass(card, 'videoCardTitle').textContent, 'Known title');
});
