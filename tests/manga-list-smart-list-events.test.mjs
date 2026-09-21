import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../manga-list-smart-list-events.js', import.meta.url), 'utf8');

function loadFactory() {
  const context = { self: {}, console };
  Function('self', source)(context.self);
  return context.self.MangaListSmartListEventsFactory;
}

function button() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    click() { listeners.get('click')?.({ type: 'click' }); },
    get size() { return listeners.size; },
  };
}

test('smart list factory exposes only a frozen create API', () => {
  const factory = loadFactory();
  assert.ok(factory);
  assert.ok(Object.isFrozen(factory));
  assert.deepEqual(Object.keys(factory), ['create']);
  const instance = factory.create({ onHistory() {}, onUnread() {} });
  assert.ok(Object.isFrozen(instance));
  assert.deepEqual(Object.keys(instance), ['bind']);
});

test('smart list callbacks are required and receive no event', () => {
  const factory = loadFactory();
  for (const key of ['onHistory', 'onUnread']) {
    assert.throws(() => factory.create({ onHistory() {}, onUnread() {}, [key]: null }), (error) => error.name === 'TypeError' && error.message.includes(key));
  }
  const calls = [];
  const instance = factory.create({ onHistory: (...args) => calls.push(['history', args]), onUnread: (...args) => calls.push(['unread', args]) });
  const historyButton = button();
  const unreadButton = button();
  instance.bind({ historyButton, unreadButton });
  historyButton.click();
  unreadButton.click();
  assert.deepEqual(calls, [['history', []], ['unread', []]]);
});

test('smart list binding validates, cleans up, and cannot be reused', () => {
  const factory = loadFactory();
  const instance = factory.create({ onHistory() {}, onUnread() {} });
  const historyButton = button();
  const unreadButton = button();
  const cleanup = instance.bind({ historyButton, unreadButton });
  assert.equal(historyButton.size, 1);
  assert.equal(unreadButton.size, 1);
  assert.throws(() => instance.bind({ historyButton, unreadButton }), (error) => error.name === 'TypeError');
  cleanup();
  cleanup();
  assert.equal(historyButton.size, 0);
  assert.equal(unreadButton.size, 0);
  assert.throws(() => instance.bind({ historyButton, unreadButton }), (error) => error.name === 'TypeError');
  assert.throws(() => factory.create({ onHistory() {} }), (error) => error.name === 'TypeError' && error.message.includes('onUnread'));
  assert.throws(() => factory.create({ onUnread() {} }), (error) => error.name === 'TypeError' && error.message.includes('onHistory'));
});

test('smart list factory has no application, DOM-search, or global-listener dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|renderSavedList|addEventListener\(['"](?:visibilitychange|pagehide|popstate|hashchange)/);
  assert.doesNotMatch(source, /currentFolderView|currentSeriesView|currentAuthorView|bookshelfPage|savedItems|savedFolders|MangaVault|VPN|setTimeout|setInterval|requestAnimationFrame/);
});
