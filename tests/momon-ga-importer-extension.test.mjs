import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const directory = new URL('../extensions/momon-ga-importer/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, directory), 'utf8');

test('manifest grants exact origins and minimal permissions', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab']);
  assert.deepEqual(manifest.host_permissions, ['https://momon-ga.com/*', 'https://75k8hy94my-ui.github.io/*']);
  assert.deepEqual(manifest.content_scripts.map(script => script.matches), [['https://momon-ga.com/fanzine/*'], ['https://75k8hy94my-ui.github.io/testCode/manga.html']]);
  assert.ok(!JSON.stringify(manifest).includes('<all_urls>'));
  assert.ok(!/unlimitedStorage|history|analytics/.test(JSON.stringify(manifest)));
});

test('extension manifest references existing local files and uses narrowly scoped hosts', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const localFiles = [manifest.background?.service_worker, manifest.action?.default_popup,
    ...(manifest.content_scripts || []).flatMap(script => script.js || [])].filter(Boolean);
  assert.ok(localFiles.length > 0);
  for (const file of localFiles) {
    assert.equal(path.isAbsolute(file), false, `manifest path must be local: ${file}`);
    assert.equal(file.split(/[\\/]/).includes('..'), false, `manifest path must stay in extension directory: ${file}`);
    assert.equal(fs.existsSync(new URL(file, directory)), true, `missing extension file: ${file}`);
  }
  assert.ok(manifest.permissions.every(permission => ['storage', 'activeTab'].includes(permission)));
  assert.ok(manifest.host_permissions.every(origin => origin === 'https://momon-ga.com/*' || origin === 'https://75k8hy94my-ui.github.io/*'));
  assert.ok(manifest.content_scripts.every(script => script.matches.every(match =>
    match === 'https://momon-ga.com/fanzine/*' || match === 'https://75k8hy94my-ui.github.io/testCode/manga.html')));
});

test('bridge only handles same-origin explicit request on manga.html and matches request IDs', async () => {
  const events = [];
  const sent = [];
  const location = { origin: 'https://75k8hy94my-ui.github.io', pathname: '/testCode/manga.html' };
  const window = { location, addEventListener: (_, fn) => events.push(fn), postMessage: message => sent.push(message) };
  const chrome = { runtime: { sendMessage: async message => ({ type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: message.requestId, items: [{ candidate: { title: 'T' } }] }) } };
  vm.runInNewContext(read('content-testcode.js'), { window, chrome, location });
  const fire = async (data, origin = location.origin, source = window) => { await events[0]({ data, origin, source }); };
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REQUEST', schemaVersion: 1, requestId: 'a' }, 'https://evil.example');
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REQUEST', schemaVersion: 1, requestId: 'a' }, location.origin, {});
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REQUEST', schemaVersion: 1 });
  assert.equal(sent.length, 0);
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REQUEST', schemaVersion: 1, requestId: 'a' });
  assert.equal(sent[0].requestId, 'a');
  chrome.runtime.sendMessage = async () => ({ type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: 'stale', items: [] });
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REQUEST', schemaVersion: 1, requestId: 'b' });
  assert.equal(sent.length, 1);
});

test('service worker refuses untrusted queue request and returns typed envelope', async () => {
  let listener;
  let items = [{ queueId: 'q', candidate: { title: 'T' } }];
  const chrome = { storage: { local: {} }, runtime: { onMessage: { addListener: fn => { listener = fn; } } } };
  const context = { chrome, importScripts: () => {}, MomonGaImportQueue: { create: () => ({ list: async () => items, add: async candidate => candidate, remove: async () => {}, clear: async () => { items = []; } }) } };
  vm.runInNewContext(read('service-worker.js'), context);
  function message(value, sender) { return new Promise(resolve => listener(value, sender, resolve)); }
  assert.equal((await message({ type: 'MOMON_QUEUE_REQUEST', schemaVersion: 1, requestId: 'r' }, { url: 'https://evil.example/' })).error, 'Unauthorized sender');
  const response = await message({ type: 'MOMON_QUEUE_REQUEST', schemaVersion: 1, requestId: 'r' }, { url: 'https://75k8hy94my-ui.github.io/testCode/manga.html' });
  assert.equal(response.type, 'TESTCODE_MOMON_IMPORT_RESPONSE');
  assert.equal(response.schemaVersion, 1);
  assert.equal(response.requestId, 'r');
  assert.equal(response.items.length, 1);
  assert.equal((await message({ type: 'OTHER', schemaVersion: 1 }, { url: 'https://momon-ga.com/fanzine/mo1/' })).error, 'Unknown message');
});

test('momon content queues valid pages with metadata warnings, rejects missing pages', async () => {
  let listener;
  const sent = [];
  let extracted = { candidate: { sourceUrl: 'https://momon-ga.com/fanzine/mo1/', pages: ['https://z1.momon-ga.me/galleries/1/1.webp'] }, errors: ['作者情報が見つかりません'] };
  const chrome = { runtime: { onMessage: { addListener: fn => { listener = fn; } }, sendMessage: async data => { sent.push(data); return { item: { queueId: 'q1' } }; } } };
  vm.runInNewContext(read('content-momon.js'), { chrome, MomonGaExtractor: { extract: () => extracted }, document: {}, location: { href: 'https://momon-ga.com/fanzine/mo1/' } });
  const message = () => new Promise(resolve => listener({ type: 'MOMON_EXTRACT_ACTIVE', schemaVersion: 1 }, {}, resolve));
  await message();
  assert.equal(sent[0].warnings[0], '作者情報が見つかりません');
  extracted = { ...extracted, candidate: { ...extracted.candidate, pages: [] }, errors: ['ページ画像が見つかりません'] };
  const rejected = await message();
  assert.equal(rejected.item, undefined);
  assert.equal(sent.length, 1);
});

test('bridge relays selected removal only with a matching request ID', async () => {
  let listener;
  const sent = [];
  const location = { origin: 'https://75k8hy94my-ui.github.io', pathname: '/testCode/manga.html' };
  const window = { location, addEventListener: (_, fn) => { listener = fn; }, postMessage: payload => sent.push(payload) };
  const chrome = { runtime: { sendMessage: async request => ({ type: 'TESTCODE_MOMON_IMPORT_REMOVE_RESPONSE', schemaVersion: 1, requestId: request.requestId, removedQueueIds: request.queueIds }) } };
  vm.runInNewContext(read('content-testcode.js'), { window, chrome, location });
  const fire = data => listener({ data, origin: location.origin, source: window });
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REMOVE_REQUEST', schemaVersion: 1, requestId: 'remove1', queueIds: ['q1'] });
  assert.equal(sent[0].removedQueueIds[0], 'q1');
  assert.equal(sent[0].requestId, 'remove1');
  chrome.runtime.sendMessage = async () => ({ type: 'TESTCODE_MOMON_IMPORT_REMOVE_RESPONSE', schemaVersion: 1, requestId: 'stale', removedQueueIds: ['q1'] });
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REMOVE_REQUEST', schemaVersion: 1, requestId: 'remove2', queueIds: ['q1'] });
  assert.equal(sent.length, 1);
  await fire({ type: 'TESTCODE_MOMON_IMPORT_REMOVE_REQUEST', schemaVersion: 1, requestId: 'remove3', queueIds: [] });
  assert.equal(sent.length, 1);
});

test('worker removes selected IDs for manga page and refuses another sender', async () => {
  let listener;
  const items = [{ queueId: 'q1' }, { queueId: 'q2' }];
  const calls = [];
  const chrome = { storage: { local: {} }, runtime: { onMessage: { addListener: fn => { listener = fn; } } } };
  vm.runInNewContext(read('service-worker.js'), { chrome, importScripts: () => {}, MomonGaImportQueue: { create: () => ({ list: async () => items, removeMany: async ids => { calls.push(ids); return ids; } }) } });
  const message = (payload, url) => new Promise(resolve => listener(payload, { url }, resolve));
  const request = { type: 'MOMON_QUEUE_REMOVE_SELECTED', schemaVersion: 1, requestId: 'remove1', queueIds: ['q1'] };
  assert.equal((await message(request, 'https://momon-ga.com/fanzine/mo1/')).error, 'Unauthorized sender');
  const result = await message(request, 'https://75k8hy94my-ui.github.io/testCode/manga.html');
  assert.equal(result.type, 'TESTCODE_MOMON_IMPORT_REMOVE_RESPONSE');
  assert.equal(result.requestId, 'remove1');
  assert.equal(JSON.stringify(calls), '[["q1"]]');
  assert.equal(JSON.stringify(result.removedQueueIds), '["q1"]');
});
