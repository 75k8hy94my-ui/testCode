import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Runtime = (() => { const context = { self: {}, console }; vm.runInNewContext(fs.readFileSync(new URL('../reader-runtime.js', import.meta.url), 'utf8'), context); return context.self.ReaderRuntimeFactory; })();
const Lifecycle = require('../reader-lifecycle.js');
const Transition = require('../reader-page-transition.js');

function node() {
  const events = new Map(); const classes = new Set();
  return { events, children: [], dataset: {}, style: {}, hidden: false, className: '', classList: {
    add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name), toggle: (name, force) => { const value = force ?? !classes.has(name); value ? classes.add(name) : classes.delete(name); return value; },
  }, addEventListener(type, callback) { (events.get(type) || events.set(type, new Set()).get(type)).add(callback); }, removeEventListener(type, callback) { events.get(type)?.delete(callback); }, setAttribute() {}, replaceChildren(...children) { this.children = children; }, querySelectorAll() { return []; }, appendChild(child) { this.children.push(child); child.parentNode = this; }, get firstChild() { return this.children[0] || null; } };
}

test('ReaderRuntime destroy removes key and scroll listeners and destroys the display loader', async () => {
  const nodes = new Map(); const getNode = (id) => nodes.get(id) || (nodes.set(id, node()), nodes.get(id));
  const doc = { body: node(), getElementById: getNode, createElement: () => node(), createDocumentFragment: () => node() };
  const windowEvents = new Map(); const local = new Map();
  const win = { ReaderLifecycleFactory: Lifecycle, ReaderPageTransitionFactory: Transition, innerWidth: 800, innerHeight: 800, location: { href: 'https://reader.test/reader.html?item=x' }, localStorage: { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) }, addEventListener(type, callback) { (windowEvents.get(type) || windowEvents.set(type, new Set()).get(type)).add(callback); }, removeEventListener(type, callback) { windowEvents.get(type)?.delete(callback); } };
  let rejectLoad; let destroyed = 0; let loadStarted = false;
  const loader = { load: () => { loadStarted = true; return new Promise((_, reject) => { rejectLoad = reject; }); }, retain() {}, scheduleWindow() {}, snapshot: () => ({}), destroy() { destroyed++; rejectLoad?.(new Error('destroyed')); } };
  const runtime = Runtime.create({
    repository: { loadItem: () => ({ id: 'x', title: 'X', pages: ['https://img.test/1.jpg'], pageManifest: { version: 1, pages: ['https://img.test/1.jpg'] } }), saveItem: (item) => item, updateItem: (id, patch) => ({ id, ...patch }), scheduleSync() {} },
    target: { itemResumeKey: (id) => `item:${id}` }, location: { replace() {} }, document: doc, window: win,
    imageLoader: loader, pageSource: { resolve: async (item) => ({ item, urls: item.pages }) }, progressRepository: { load: () => ({ page: 1, wasLast: false }), commit() {} },
  });
  const started = runtime.start('x');
  for (let i = 0; i < 8 && !loadStarted; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loadStarted, true);
  assert.ok(windowEvents.get('keydown')?.size);
  assert.ok(windowEvents.get('pagehide')?.size);
  assert.ok(getNode('viewer').events.get('scroll')?.size);
  runtime.destroy(); runtime.destroy();
  assert.equal(windowEvents.get('keydown')?.size || 0, 0);
  assert.equal(windowEvents.get('pagehide')?.size || 0, 0);
  assert.equal(getNode('viewer').events.get('scroll')?.size || 0, 0);
  assert.equal(destroyed, 1);
  await started;
});
