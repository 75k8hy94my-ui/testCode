import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-search-events.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-search-events.js' });
  return context.MangaListSearchEventsFactory;
}

function input(value = '') {
  const listeners = new Map();
  return {
    value,
    addEventListener(type, handler) {
      const list = listeners.get(type) || [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((candidate) => candidate !== handler));
    },
    emitInput() {
      for (const handler of listeners.get('input') || []) handler({ target: this });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

test('search events factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.ok(factory);
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  assert.equal(typeof factory.create, 'function');
});

test('create requires onSearchChange and returns only a frozen bind API', () => {
  const factory = loadFactory();
  for (const deps of [undefined, null, {}, { onSearchChange: null }, { onSearchChange: 'bad' }]) {
    assert.throws(() => factory.create(deps), (error) => error.name === 'TypeError' && error.message.includes('onSearchChange'));
  }
  const instance = factory.create({ onSearchChange() {} });
  assert.deepEqual(Object.keys(instance), ['bind']);
  assert.equal(Object.isFrozen(instance), true);
});

test('bind forwards the current input value once without changing it', () => {
  const factory = loadFactory();
  const values = [];
  const instance = factory.create({ onSearchChange(value) { values.push(value); } });
  const searchInput = input('  Title  ');
  const cleanup = instance.bind({ searchInput });
  assert.equal(typeof cleanup, 'function');
  searchInput.emitInput();
  searchInput.value = 'Case MIX';
  searchInput.emitInput();
  assert.deepEqual(values, ['  Title  ', 'Case MIX']);
  assert.equal(searchInput.value, 'Case MIX');
  assert.equal(searchInput.listenerCount('input'), 1);
});

test('bind rejects invalid inputs and duplicate binding', () => {
  const factory = loadFactory();
  const instance = factory.create({ onSearchChange() {} });
  const valid = input();
  for (const deps of [undefined, null, {}, { searchInput: {} }]) {
    assert.throws(() => instance.bind(deps), (error) => error.name === 'TypeError');
  }
  instance.bind({ searchInput: valid });
  assert.throws(() => instance.bind({ searchInput: input() }), (error) => error.name === 'TypeError');
  assert.equal(valid.listenerCount('input'), 1);
});

test('cleanup removes the handler, is idempotent, and makes the instance terminal', () => {
  const factory = loadFactory();
  const values = [];
  const instance = factory.create({ onSearchChange(value) { values.push(value); } });
  const searchInput = input('query');
  const cleanup = instance.bind({ searchInput });
  cleanup();
  cleanup();
  searchInput.emitInput();
  assert.deepEqual(values, []);
  assert.equal(searchInput.listenerCount('input'), 0);
  assert.throws(() => instance.bind({ searchInput: input() }), (error) => error.name === 'TypeError');
});

test('factory has no global, persistence, timer, route, rendering, or normalization dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|MangaVault|Supabase|VPN|fetch|location|history|render|trim|toLowerCase|toUpperCase|addEventListener\('(?:click|change|visibilitychange|pagehide|popstate|hashchange)'|setTimeout|setInterval|requestAnimationFrame/);
});
