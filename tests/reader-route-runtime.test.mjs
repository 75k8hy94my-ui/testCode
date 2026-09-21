import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function loadFactory() {
  const context = { self: {}, console };
  vm.runInNewContext(fs.readFileSync(new URL('reader-route-runtime.js', root), 'utf8'), context);
  return context.self.ReaderRouteRuntimeFactory;
}

function dependencies(calls, generation = 1) {
  const target = {
    replaceChildren(...nodes) { calls.push(['replace', nodes]); },
    append(node) { calls.push(['append', node]); },
  };
  const document = { body: { children: [] } };
  const response = { ok: true, async text() { calls.push('response.text'); return '<html></html>'; } };
  const doc = { head: {}, body: { children: ['body-node'] }, querySelectorAll() { return ['script-a', 'script-b']; } };
  return {
    cleanup() { calls.push('cleanup'); },
    setTitle(route) { calls.push(['title', route]); },
    setEditing(value) { calls.push(['editing', value]); },
    getMount() { calls.push('mount'); return target; },
    createLoading() { calls.push('loading'); return 'loading-node'; },
    fetchReader() { calls.push('fetch'); return Promise.resolve(response); },
    parseHtml(html) { calls.push(['parse', html]); return doc; },
    installHeadAssets(value) { calls.push(['head', value]); },
    mountBody(nodes) { calls.push(['body', nodes]); },
    loadMediaGate() { calls.push('media'); return Promise.resolve(); },
    getScripts(value) { calls.push(['scripts', value]); return value.querySelectorAll('script'); },
    loadScript(source) { calls.push(['script', source]); return Promise.resolve(); },
    getGeneration() { return generation; },
    ensureVideoEntryEnhancement() { calls.push('video-enhancement'); return Promise.resolve(); },
    prune(route) { calls.push(['prune', route]); },
    activate(route) { calls.push(['activate', route]); },
    sync() { calls.push('sync'); },
    renderError(value) { calls.push(['error', value]); },
    target,
    document,
  };
}

test('reader route runtime exposes a frozen factory and preserves manga/video bootstrap order', async () => {
  const factory = loadFactory();
  assert.deepEqual(Object.keys(factory), ['create']);
  assert.ok(Object.isFrozen(factory));
  const calls = [];
  const deps = dependencies(calls);
  const runtime = factory.create(deps);
  assert.deepEqual(Object.keys(runtime), ['render']);
  assert.ok(Object.isFrozen(runtime));

  await runtime.render('manga', 1);
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call), [
    'mount', 'cleanup', 'title', 'editing', 'replace', 'loading', 'append',
    'fetch', 'response.text', 'parse', 'head', 'body', 'media', 'scripts',
    'script', 'script', 'prune', 'activate', 'sync',
  ]);

  calls.length = 0;
  await runtime.render('video', 1);
  assert.equal(calls.filter((call) => call === 'video-enhancement').length, 1);
  assert.deepEqual(calls.slice(-5).map((call) => Array.isArray(call) ? call[0] : call), [
    'script', 'video-enhancement', 'prune', 'activate', 'sync',
  ]);
});

test('reader route runtime rejects missing callbacks and stale generations without postprocessing', async () => {
  const factory = loadFactory();
  const deps = dependencies([]);
  for (const key of ['cleanup', 'fetchReader', 'loadScript', 'prune', 'sync']) {
    const missing = { ...deps };
    delete missing[key];
    assert.throws(() => factory.create(missing), (error) => error.name === 'TypeError' && error.message.includes(key));
  }
  const calls = [];
  const stale = factory.create(dependencies(calls, 2));
  await stale.render('manga', 1);
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call), ['mount']);
  assert.equal(calls.some((call) => Array.isArray(call) && ['script', 'prune', 'activate', 'sync'].includes(call[0])), false);
});

test('reader route runtime stops stale work after media and video initialization awaits', async () => {
  const factory = loadFactory();
  let currentGeneration = 1;
  const calls = [];
  const mediaStale = dependencies(calls);
  mediaStale.getGeneration = () => currentGeneration;
  mediaStale.loadMediaGate = () => {
    calls.push('media');
    currentGeneration = 2;
    return Promise.resolve();
  };
  await factory.create(mediaStale).render('manga', 1);
  assert.equal(calls.includes('scripts'), false);
  assert.equal(calls.some((call) => Array.isArray(call) && ['prune', 'activate', 'sync'].includes(call[0])), false);

  calls.length = 0;
  currentGeneration = 1;
  const videoStale = dependencies(calls);
  videoStale.getGeneration = () => currentGeneration;
  videoStale.ensureVideoEntryEnhancement = () => {
    calls.push('video-enhancement');
    currentGeneration = 2;
    return Promise.resolve();
  };
  await factory.create(videoStale).render('video', 1);
  assert.equal(calls.filter((call) => call === 'video-enhancement').length, 1);
  assert.equal(calls.some((call) => Array.isArray(call) && ['prune', 'activate', 'sync'].includes(call[0])), false);
});
