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
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /document|window|globalThis|localStorage|sessionStorage|MangaVault|Supabase|VPN|fetch|location|history|render|addEventListener\('(?:visibilitychange|pagehide|popstate|hashchange)'|setTimeout|setInterval|requestAnimationFrame/);
});


function touchSurface() {
  const listeners = new Map();
  return {
    addEventListener(name, handler, options) { listeners.set(name, { handler, options }); },
    removeEventListener(name, handler) {
      if (listeners.get(name)?.handler === handler) listeners.delete(name);
    },
    getBoundingClientRect() { return { left: 0, right: 400 }; },
    fire(name, { x = 180, y = 200, id = 1, target = null, fingers = 1, cancelable = true } = {}) {
      const point = { identifier: id, clientX: x, clientY: y };
      let prevented = false;
      const event = {
        target: target || { closest() { return null; } },
        touches: name === 'touchend' || name === 'touchcancel' ? [] :
          Array.from({ length: fingers }, (_, index) => ({ ...point, identifier: id + index })),
        changedTouches: [point],
        cancelable,
        preventDefault() { prevented = true; },
      };
      listeners.get(name)?.handler(event);
      return prevented;
    },
    count() { return listeners.size; },
    options(name) { return listeners.get(name)?.options; },
  };
}

function swipe(surface, x1, y1, x2, y2, target) {
  surface.fire('touchstart', { x: x1, y: y1, target });
  surface.fire('touchmove', { x: x2, y: y2, target });
  return surface.fire('touchend', { x: x2, y: y2, target });
}

test('left/right shelf gestures use the same page callback as pagination buttons', () => {
  const calls = [];
  const prev = button();
  const next = button();
  prev.disabled = false;
  next.disabled = false;
  const surface = touchSurface();
  const cleanup = loadFactory().create({ onPageChange(delta) { calls.push(delta); } }).bind({
    prevButton: prev, nextButton: next, swipeSurface: surface,
  });
  assert.equal(swipe(surface, 250, 110, 115, 116), true, 'left swipe should suppress synthetic click');
  assert.equal(swipe(surface, 110, 116, 250, 110), true, 'right swipe should suppress synthetic click');
  next.click();
  prev.click();
  assert.deepEqual(calls, [1, -1, 1, -1]);
  assert.equal(surface.options('touchstart').passive, true);
  assert.equal(surface.options('touchmove').passive, true);
  assert.equal(surface.options('touchend').passive, false);
  cleanup();
  assert.equal(surface.count(), 0);
  surface.fire('touchstart', { x: 250, y: 110 });
  surface.fire('touchend', { x: 110, y: 110 });
  assert.deepEqual(calls, [1, -1, 1, -1], 'cleanup must detach swipe listeners');
});

test('vertical scrolling, short or diagonal gestures, and taps do not turn shelf pages', () => {
  const calls = [];
  const surface = touchSurface();
  loadFactory().create({ onPageChange(delta) { calls.push(delta); } }).bind({
    prevButton: button(), nextButton: button(), swipeSurface: surface,
  });
  assert.equal(swipe(surface, 200, 120, 190, 280), false, 'vertical scroll remains native');
  assert.equal(swipe(surface, 210, 100, 164, 110), false, 'short swipe ignored');
  assert.equal(swipe(surface, 200, 110, 98, 210), false, 'diagonal motion ignored');
  assert.equal(swipe(surface, 180, 100, 180, 100), false, 'tap ignored');
  surface.fire('touchstart', { x: 250, y: 100 });
  surface.fire('touchmove', { x: 235, y: 160 });
  surface.fire('touchend', { x: 100, y: 160 });
  assert.deepEqual(calls, [], 'gesture initially identified as vertical scroll cannot turn into a swipe');
});

test('interactive card controls, multiple fingers and browser edge gestures are excluded', () => {
  const calls = [];
  const surface = touchSurface();
  const prev = button();
  const next = button();
  loadFactory().create({ onPageChange(delta) { calls.push(delta); } }).bind({
    prevButton: prev, nextButton: next, swipeSurface: surface,
  });
  for (const selector of ['button', 'input', 'a', '[contenteditable]']) {
    const interactive = { closest(value) { return value.includes(selector) ? {} : null; } };
    assert.equal(swipe(surface, 250, 110, 120, 110, interactive), false);
  }
  surface.fire('touchstart', { x: 220, y: 100, fingers: 2 });
  surface.fire('touchend', { x: 100, y: 100 });
  assert.equal(swipe(surface, 12, 100, 160, 100), false, 'edge navigation should remain available');
  assert.equal(swipe(surface, 392, 100, 240, 100), false, 'right edge also belongs to the browser');
  surface.fire('touchstart', { x: 240, y: 100 });
  surface.fire('touchcancel');
  surface.fire('touchend', { x: 100, y: 100 });
  assert.deepEqual(calls, []);
});

test('disabled page boundaries suppress accidental clicks without navigating past the end', () => {
  const calls = [];
  const surface = touchSurface();
  const prev = button();
  const next = button();
  prev.disabled = true;
  next.disabled = true;
  loadFactory().create({ onPageChange(delta) { calls.push(delta); } }).bind({
    prevButton: prev, nextButton: next, swipeSurface: surface,
  });
  assert.equal(swipe(surface, 260, 140, 120, 140), true);
  assert.equal(swipe(surface, 120, 140, 260, 140), true);
  assert.deepEqual(calls, []);
  next.disabled = false;
  swipe(surface, 260, 140, 120, 140);
  assert.deepEqual(calls, [1]);
});

test('bookshelf route binds swipe only inside its grid and loads the updated event module', () => {
  const route = fs.readFileSync('manga-list-route.js', 'utf8');
  const reader = fs.readFileSync('reader.html', 'utf8');
  assert.match(route, /manga-list-pagination-events\.js\?v=20261009-touch-swipe/);
  assert.match(route, /swipeSurface: elements\.savedListItems/);
  assert.doesNotMatch(reader, /manga-list-pagination-events/);
});
