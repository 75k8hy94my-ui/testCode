import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function load(path) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const self = {};
  Function('self', source)(self);
  return { source, self };
}

test('state runtime preserves injected initialization order and returns manga state', async () => {
  const { source, self } = await load('manga-list-state-runtime.js');
  const calls = [];
  const state = { items: [], folders: [], authorCards: [] };
  const instance = self.MangaListStateRuntimeFactory.create({
    load: () => { calls.push('load'); return state; },
    migrate: value => { calls.push('migrate'); return value; },
    removeHistoryFolder: value => { calls.push('history'); return value; },
    synchronizeAuthors: value => { calls.push('authors'); return value; },
  });
  assert.deepEqual(instance.initialize(), state);
  assert.deepEqual(calls, ['load', 'migrate', 'history', 'authors']);
  assert.throws(() => instance.initialize(), (error) => error.name === 'TypeError');
  assert.ok(Object.isFrozen(self.MangaListStateRuntimeFactory));
  assert.ok(Object.isFrozen(instance));
  assert.doesNotMatch(source, /localStorage|sessionStorage|document|window|MangaVault|VPN|renderSavedList|savedVideos/);
});

test('render runtime forwards current state and elements without retaining them', async () => {
  const { source, self } = await load('manga-list-render-runtime.js');
  const state = { items: [] };
  const elements = { savedListItems: {} };
  const calls = [];
  const instance = self.MangaListRenderRuntimeFactory.create({
    getState: () => state,
    getElements: () => elements,
    deriveViewModel: input => { calls.push(['derive', input]); return { page: 1 }; },
    render: input => { calls.push(['render', input]); return input; },
  });
  assert.deepEqual(instance.render(), { state, elements, viewModel: { page: 1 } });
  assert.equal(calls[0][0], 'derive');
  assert.equal(calls[1][0], 'render');
  assert.ok(Object.isFrozen(self.MangaListRenderRuntimeFactory));
  assert.ok(Object.isFrozen(instance));
  assert.doesNotMatch(source, /localStorage|sessionStorage|document|window|MangaVault|VPN|Overlay|savedVideos|addEventListener/);
});

test('bootstrap composes mount, controller, initialization, events, activation, render and cleanup', async () => {
  const { source, self } = await load('manga-list-bootstrap.js');
  const calls = [];
  const cleanup = () => calls.push('cleanup');
  const mountResult = { root: {}, elements: {} };
  const instance = self.MangaListBootstrapFactory.create({
    mount: element => { calls.push(['mount', element]); return mountResult; },
    createController: elements => { calls.push(['controller', elements]); return { id: 1 }; },
    initialize: () => calls.push('initialize'),
    bindEvents: (elements, controller) => { calls.push(['bind', elements, controller]); return cleanup; },
    activate: () => calls.push('activate'),
    render: () => calls.push('render'),
  });
  const result = instance.bootstrap({ mountElement: {} });
  assert.deepEqual(calls.slice(0, 6).map(value => Array.isArray(value) ? value[0] : value), ['mount', 'controller', 'initialize', 'bind', 'activate', 'render']);
  assert.deepEqual(Object.keys(result), ['root', 'elements', 'controller', 'cleanup']);
  assert.ok(Object.isFrozen(result));
  result.cleanup();
  result.cleanup();
  assert.deepEqual(calls.at(-1), 'cleanup');
  assert.throws(() => instance.bootstrap({ mountElement: {} }), (error) => error.name === 'TypeError');
  assert.ok(Object.isFrozen(self.MangaListBootstrapFactory));
  assert.doesNotMatch(source, /localStorage|sessionStorage|document|window|MangaVault|VPN|Overlay|video|history/);
});
