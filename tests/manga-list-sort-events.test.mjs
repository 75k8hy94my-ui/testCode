import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync('manga-list-sort-events.js', 'utf8');

function loadFactory() {
  const context = {};
  vm.runInNewContext(source, context, { filename: 'manga-list-sort-events.js' });
  return context.MangaListSortEventsFactory;
}

function select(value = 'added-desc') {
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
    change() {
      for (const handler of listeners.get('change') || []) handler({ target: this });
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    },
  };
}

test('sort events factory exposes one frozen create API', () => {
  const factory = loadFactory();
  assert.ok(factory);
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.equal(Object.isFrozen(factory), true);
  assert.equal(typeof factory.create, 'function');
});

test('create requires onSortChange and returns only a frozen bind API', () => {
  const factory = loadFactory();
  for (const deps of [undefined, null, {}, { onSortChange: null }, { onSortChange: 'bad' }]) {
    assert.throws(() => factory.create(deps), (error) => error.name === 'TypeError' && error.message.includes('onSortChange'));
  }
  const instance = factory.create({ onSortChange() {} });
  assert.deepEqual(Object.keys(instance), ['bind']);
  assert.equal(Object.isFrozen(instance), true);
});

test('bind forwards the current select value once without the event object', () => {
  const factory = loadFactory();
  const values = [];
  const instance = factory.create({ onSortChange(value) { values.push(value); } });
  const sortSelect = select('title-asc');
  const cleanup = instance.bind({ sortSelect });
  assert.equal(typeof cleanup, 'function');
  sortSelect.change();
  sortSelect.value = 'oldest';
  sortSelect.change();
  assert.deepEqual(values, ['title-asc', 'oldest']);
  assert.equal(sortSelect.listenerCount('change'), 1);
});

test('bind rejects invalid select elements and duplicate binding', () => {
  const factory = loadFactory();
  const instance = factory.create({ onSortChange() {} });
  const valid = select();
  for (const deps of [undefined, null, {}, { sortSelect: {} }]) {
    assert.throws(() => instance.bind(deps), (error) => error.name === 'TypeError');
  }
  instance.bind({ sortSelect: valid });
  assert.throws(() => instance.bind({ sortSelect: select() }), (error) => error.name === 'TypeError');
  assert.equal(valid.listenerCount('change'), 1);
});

test('cleanup removes the handler, is idempotent, and makes the instance terminal', () => {
  const factory = loadFactory();
  const values = [];
  const instance = factory.create({ onSortChange(value) { values.push(value); } });
  const sortSelect = select('title-desc');
  const cleanup = instance.bind({ sortSelect });
  cleanup();
  cleanup();
  sortSelect.change();
  assert.deepEqual(values, []);
  assert.equal(sortSelect.listenerCount('change'), 0);
  assert.throws(() => instance.bind({ sortSelect: select() }), (error) => error.name === 'TypeError');
});

test('factory has no global, persistence, timer, route, or rendering dependencies', () => {
  assert.doesNotMatch(source, /document|window|globalThis|localStorage|sessionStorage|MangaVault|Supabase|VPN|fetch|location|history|render|addEventListener\('(?:click|input|visibilitychange|pagehide|popstate|hashchange)'|setTimeout|setInterval|requestAnimationFrame/);
});
