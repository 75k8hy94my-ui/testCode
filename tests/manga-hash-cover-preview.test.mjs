import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const classifier = require('../manga-source-type.js');

function loadFactory() {
  const context = { self: { MangaSourceType: classifier }, console };
  vm.runInNewContext(fs.readFileSync(new URL('../manga-hash-cover-preview.js', import.meta.url), 'utf8'), context);
  return context.self.MangaHashCoverPreview;
}

function node(tag = 'div') {
  const listeners = new Map();
  const n = {
    tag, children: [], parentNode: null, attributes: {}, className: '', hidden: false,
    style: {}, alt: '', src: '', title: '', inert: false,
    addEventListener(type, callback) { listeners.set(type, callback); },
    dispatch(type) { listeners.get(type)?.(); },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    get isConnected() { return this.connectedRoot === true || !!this.parentNode?.isConnected; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children.length = 0; for (const child of children) this.appendChild(child); },
    remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; } },
  };
  return n;
}

function fixture({ intersection = true } = {}) {
  const body = node('body');
  body.connectedRoot = true;
  const documentEvents = new Map();
  const documentRef = {
    body, createElement: node,
    addEventListener(type, cb) { documentEvents.set(type, cb); },
    removeEventListener(type) { documentEvents.delete(type); },
  };
  let visibleObserver, mutationObserver, allowed = true;
  class IntersectionObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); this.disconnected = false; visibleObserver = this; }
    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    emit(target, isIntersecting) { this.callback([{ target, isIntersecting }]); }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; mutationObserver = this; }
    observe() { this.observing = true; }
    disconnect() { this.disconnected = true; }
    emit() { this.callback([]); }
  }
  const windowRef = { MutationObserver, ...(intersection ? { IntersectionObserver } : {}) };
  const runtime = loadFactory().create({ documentRef, windowRef, canReadProtectedData: () => allowed });
  return {
    body, runtime, documentRef,
    get visibleObserver() { return visibleObserver; },
    get mutationObserver() { return mutationObserver; },
    setAllowed(next) { allowed = next; documentEvents.get('manga-reader-vpn-status')?.(); },
    card() {
      const cover = node();
      const img = node('img'); img.alt = 'Sample book'; cover.appendChild(img);
      return { cover, img };
    },
  };
}

test('hash #1 has a lazy, inert first-page preview, and offscreen cards unload it', () => {
  const f = fixture();
  const { cover, img } = f.card();
  assert.equal(f.runtime.attach(img, 'https://manga.example.test/work.html#1'), true);
  assert.equal(cover.children.length, 2);
  const host = cover.children[1];
  assert.equal(host.className, 'book-cover-hash-preview');
  assert.equal(host.hidden, true);
  assert.equal(host.style.pointerEvents, 'none');
  assert.equal(f.visibleObserver.observed.has(img), true);
  assert.equal(host.children.length, 0, 'detached cards do not load iframes');

  f.body.appendChild(cover);
  f.mutationObserver.emit();
  f.visibleObserver.emit(img, true);
  assert.equal(host.children.length, 1);
  const iframe = host.children[0];
  assert.equal(iframe.src, 'https://manga.example.test/work.html#1');
  assert.equal(iframe.loading, 'lazy');
  assert.equal(iframe.attributes.sandbox, 'allow-scripts allow-same-origin');
  assert.equal(iframe.attributes.tabindex, '-1');
  assert.equal(iframe.attributes['aria-hidden'], 'true');
  assert.equal(iframe.inert, true);
  assert.equal(iframe.style.pointerEvents, 'none');
  iframe.dispatch('load');
  assert.equal(host.hidden, false);

  f.visibleObserver.emit(img, false);
  assert.equal(host.children.length, 0, 'off-screen frame must be removed');
  assert.equal(host.hidden, true);
  f.visibleObserver.emit(img, true);
  assert.equal(host.children.length, 1, 'returning card can load its first page again');

  cover.remove();
  f.mutationObserver.emit();
  assert.equal(f.visibleObserver.observed.has(img), false);
  assert.equal(host.parentNode, null, 'removed cards cannot retain a frame');
  f.runtime.destroy();
  assert.equal(f.visibleObserver.disconnected, true);
  assert.equal(f.mutationObserver.disconnected, true);
});

test('thumbnail previews refuse other URLs and respect VPN access revocation', () => {
  const f = fixture();
  const { cover, img } = f.card();
  f.body.appendChild(cover);
  for (const url of [
    'https://manga.example.test/work.html#2',
    'https://manga.example.test/work.html#01',
    'javascript:alert(1)#1',
  ]) {
    assert.equal(f.runtime.attach(img, url), false);
  }
  f.setAllowed(false);
  assert.equal(f.runtime.attach(img, 'https://manga.example.test/work.html#1'), false);
  f.setAllowed(true);
  assert.equal(f.runtime.attach(img, 'https://manga.example.test/work.html#1'), true);
  const host = cover.children[1];
  f.visibleObserver.emit(img, true);
  assert.equal(host.children.length, 1);
  f.setAllowed(false);
  assert.equal(host.children.length, 0);
  assert.equal(host.hidden, true);
  f.setAllowed(true);
  assert.equal(f.visibleObserver.observed.has(img), true);
  f.visibleObserver.emit(img, true);
  assert.equal(host.children.length, 1);
  f.runtime.destroy();
  assert.equal(cover.children.length, 1);
});

test('fallback browser without intersection observer still uses lazy iframe loading', () => {
  const f = fixture({ intersection: false });
  const { cover, img } = f.card();
  assert.equal(f.runtime.attach(img, 'https://manga.example.test/work.html#1'), true);
  assert.equal(cover.children[1].children[0].src, 'https://manga.example.test/work.html#1');
  assert.equal(cover.children[1].children[0].loading, 'lazy');
  f.body.appendChild(cover);
  f.runtime.destroy();
});

test('bookshelf wires hash previews without loading numbered image URLs', () => {
  const host = fs.readFileSync(new URL('../manga-list-host-runtime.js', import.meta.url), 'utf8');
  const route = fs.readFileSync(new URL('../manga-list-route.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../manga-list.css', import.meta.url), 'utf8');
  assert.match(host, /getHashPageBase\(sourceItem\)/);
  assert.match(host, /mountHashCover\?\.\(imgEl, root\.MangaSourceType\.hashPageUrl\(hashBase, 1\)\)/);
  assert.match(route, /manga-hash-cover-preview\.js\?v=/);
  assert.match(route, /mountHashCover: \(img, url\) => hashCoverPreview\?\.attach/);
  assert.match(route, /hashCoverPreview\?\.destroy\(\)/);
  assert.match(css, /book-cover-hash-preview iframe/);
  assert.match(css, /pointer-events: none !important/);
});
