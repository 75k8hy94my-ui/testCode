import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../manga-list-navigation-events.js', import.meta.url), 'utf8');

function factory() {
  const self = {};
  Function('self', source)(self);
  return self.MangaListNavigationEventsFactory;
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

test('navigation factory exposes one frozen create API', () => {
  const value = factory();
  assert.ok(Object.isFrozen(value));
  assert.deepEqual(Object.keys(value), ['create']);
  const instance = value.create({ onBack() {} });
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance), ['bind']);
});

test('navigation back callback receives no event and only runs once per click', () => {
  const calls = [];
  const instance = factory().create({ onBack: (...args) => calls.push(args) });
  const backButton = button();
  instance.bind({ backButton });
  backButton.click();
  backButton.click();
  assert.deepEqual(calls, [[], []]);
});

test('navigation binding validates, cleans up, and cannot be reused', () => {
  const value = factory();
  assert.throws(() => value.create({}), (error) => error.name === 'TypeError' && error.message.includes('onBack'));
  const instance = value.create({ onBack() {} });
  const backButton = button();
  const cleanup = instance.bind({ backButton });
  assert.equal(backButton.size, 1);
  assert.throws(() => instance.bind({ backButton }), (error) => error.name === 'TypeError');
  cleanup();
  cleanup();
  assert.equal(backButton.size, 0);
  assert.throws(() => instance.bind({ backButton }), (error) => error.name === 'TypeError');
  assert.throws(() => instance.bind({}), (error) => error.name === 'TypeError');
});

test('navigation factory has no application or global listener dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|renderSavedList|currentFolderView|currentSeriesView|MangaVault|VPN|setTimeout|setInterval|requestAnimationFrame/);
});
