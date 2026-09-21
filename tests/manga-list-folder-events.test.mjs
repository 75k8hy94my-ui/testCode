import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../manga-list-folder-events.js', import.meta.url), 'utf8');

function factory() {
  const self = {};
  Function('self', source)(self);
  return self.MangaListFolderEventsFactory;
}

function button() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
    click() { listeners.get('click')?.({ type: 'click' }); },
    get size() { return listeners.size; },
  };
}

test('folder factory exposes one frozen create API', () => {
  const value = factory();
  assert.ok(Object.isFrozen(value));
  assert.deepEqual(Object.keys(value), ['create']);
  const instance = value.create({ onCreateStart() {}, onCreateConfirm() {} });
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance), ['bind']);
});

test('folder factory maps each click to one callback without the event', () => {
  const calls = [];
  const instance = factory().create({ onCreateStart: (...args) => calls.push(['start', args]), onCreateConfirm: (...args) => calls.push(['confirm', args]) });
  const createButton = button();
  const confirmButton = button();
  instance.bind({ createButton, confirmButton });
  createButton.click();
  confirmButton.click();
  assert.deepEqual(calls, [['start', []], ['confirm', []]]);
});

test('folder factory validates, cleans up, and rejects reuse', () => {
  const value = factory();
  for (const key of ['onCreateStart', 'onCreateConfirm']) {
    const deps = { onCreateStart() {}, onCreateConfirm() {} };
    deps[key] = null;
    assert.throws(() => value.create(deps), (error) => error.name === 'TypeError' && error.message.includes(key));
  }
  const instance = value.create({ onCreateStart() {}, onCreateConfirm() {} });
  const createButton = button();
  const confirmButton = button();
  const cleanup = instance.bind({ createButton, confirmButton });
  assert.equal(createButton.size, 1);
  assert.equal(confirmButton.size, 1);
  assert.throws(() => instance.bind({ createButton, confirmButton }), (error) => error.name === 'TypeError');
  cleanup();
  cleanup();
  assert.equal(createButton.size, 0);
  assert.equal(confirmButton.size, 0);
  assert.throws(() => instance.bind({ createButton, confirmButton }), (error) => error.name === 'TypeError');
});

test('folder factory has no application, storage, or global listener dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|savedFolders|persistAll|renderSavedList|MangaVault|VPN|setTimeout|setInterval|requestAnimationFrame/);
});
