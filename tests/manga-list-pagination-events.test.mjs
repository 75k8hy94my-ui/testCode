import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-pagination-events.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-pagination-events.js' });
  return context.MangaListPaginationEventsFactory;
}

function button() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((candidate) => candidate !== handler));
    },
    click() {
      for (const handler of listeners.get('click') || []) handler({ type: 'click' });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

test('pagination events factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.ok(factory);
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  assert.equal(typeof factory.create, 'function');
});

test('create requires onPageChange and returns only a frozen bind API', () => {
  const factory = loadFactory();
  for (const deps of [undefined, null, {}, { onPageChange: null }, { onPageChange: 'bad' }]) {
    assert.throws(() => factory.create(deps), (error) => error.name === 'TypeError' && error.message.includes('onPageChange'));
  }
  const instance = factory.create({ onPageChange() {} });
  assert.deepEqual(Object.keys(instance), ['bind']);
  assert.equal(Object.isFrozen(instance), true);
});

test('bind validates buttons, maps clicks to deltas, and returns cleanup', () => {
  const factory = loadFactory();
  const instance = factory.create({ onPageChange(delta) { calls.push(delta); } });
  const prev = button();
  const next = button();
  const calls = [];
  const cleanup = instance.bind({ prevButton: prev, nextButton: next });
  assert.equal(typeof cleanup, 'function');
  prev.click();
  next.click();
  assert.deepEqual(calls, [-1, 1]);
  assert.equal(prev.listenerCount('click'), 1);
  assert.equal(next.listenerCount('click'), 1);
});

test('bind rejects invalid buttons and duplicate binding', () => {
  const factory = loadFactory();
  const instance = factory.create({ onPageChange() {} });
  const valid = button();
  for (const deps of [undefined, null, {}, { prevButton: valid }, { nextButton: valid }, { prevButton: {}, nextButton: valid }]) {
    assert.throws(() => instance.bind(deps), (error) => error.name === 'TypeError');
  }
  const next = button();
  instance.bind({ prevButton: valid, nextButton: next });
  assert.throws(() => instance.bind({ prevButton: button(), nextButton: button() }), (error) => error.name === 'TypeError');
  assert.equal(valid.listenerCount('click'), 1);
  assert.equal(next.listenerCount('click'), 1);
});

test('cleanup removes both handlers, is idempotent, and makes instance terminal', () => {
  const factory = loadFactory();
  const calls = [];
  const instance = factory.create({ onPageChange(delta) { calls.push(delta); } });
  const prev = button();
  const next = button();
  const cleanup = instance.bind({ prevButton: prev, nextButton: next });
  cleanup();
  cleanup();
  prev.click();
  next.click();
  assert.deepEqual(calls, []);
  assert.equal(prev.listenerCount('click'), 0);
  assert.equal(next.listenerCount('click'), 0);
  assert.throws(() => instance.bind({ prevButton: button(), nextButton: button() }), (error) => error.name === 'TypeError');
});

test('factory has no global, persistence, timer, route, or rendering dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|MangaVault|Supabase|VPN|fetch|location|history|render|addEventListener\('(?:visibilitychange|pagehide|popstate|hashchange)'|setTimeout|setInterval|requestAnimationFrame/);
});
