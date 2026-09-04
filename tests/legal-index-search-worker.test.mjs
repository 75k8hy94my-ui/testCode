import test from 'node:test';
import assert from 'node:assert/strict';
import Search from '../legal-index-search.js';
import WorkerApi from '../legal-index-search-worker.js';
import Client from '../index-search-worker-client.js';

const books = [{
  type: 'index-book', version: 1, bookId: 'book-a', chunkId: 'chunk-a',
  book: { title: '民法教材', subjects: ['民法'] },
  matterEntries: [
    { term: '債権者代位権', pages: ['123'] },
    { term: '債権者代位権 転用', pages: ['124'] }
  ],
  caseEntries: [], statuteEntries: []
}];

test('pure worker handler returns exactly the same results and ordering as direct search', () => {
  const messages = [];
  const handle = WorkerApi.createWorkerHandler(Search, (message) => messages.push(message));
  handle({ type: 'build', generation: 3, books });
  handle({ type: 'search', requestId: 9, query: '債権者代位権', options: { kind: 'all', matchModes: { exact: true, partial: true, and: true, fuzzy: true } } });
  const result = messages.find((message) => message.type === 'results');
  const direct = Search.search(Search.buildIndex(books), '債権者代位権', { kind: 'all', matchModes: { exact: true, partial: true, and: true, fuzzy: true } });
  assert.deepEqual(result.results, direct);
  assert.deepEqual(messages[0], { type: 'built', generation: 3 });
});

class FakeWorker {
  constructor() { this.listeners = new Map(); this.sent = []; FakeWorker.instance = this; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  postMessage(message) { this.sent.push(structuredClone(message)); }
  terminate() { this.terminated = true; }
  emit(message) { this.listeners.get('message')?.({ data: structuredClone(message) }); }
  fail(error = new Error('worker failed')) { this.listeners.get('error')?.(error); }
}

test('worker client ignores stale search responses and resolves only the latest normally', async () => {
  const executor = Client.createSearchExecutor({ WorkerCtor: FakeWorker, workerUrl: 'worker.js', directApi: Search });
  const buildPromise = executor.build(books);
  FakeWorker.instance.emit({ type: 'built', generation: 1 });
  await buildPromise;
  const first = executor.search('債権', { kind: 'all' });
  const second = executor.search('債権者代位権', { kind: 'all' });
  const requests = FakeWorker.instance.sent.filter((message) => message.type === 'search');
  FakeWorker.instance.emit({ type: 'results', requestId: requests[0].requestId, results: [{ display: 'old' }] });
  FakeWorker.instance.emit({ type: 'results', requestId: requests[1].requestId, results: [{ display: 'new' }] });
  assert.deepEqual(await first, { stale: true, results: [] });
  assert.deepEqual(await second, { stale: false, results: [{ display: 'new' }] });
});

test('worker construction failure falls back to direct search without changing semantics', async () => {
  class BrokenWorker { constructor() { throw new Error('unsupported'); } }
  const diagnostics = [];
  const executor = Client.createSearchExecutor({ WorkerCtor: BrokenWorker, workerUrl: 'worker.js', directApi: Search, onDiagnostic: (error) => diagnostics.push(error.message) });
  assert.equal(executor.mode, 'direct');
  await executor.build(books);
  const response = await executor.search('債権者代位権', { kind: 'all', matchModes: { exact: true, partial: true, and: true, fuzzy: true } });
  assert.equal(response.stale, false);
  assert.deepEqual(response.results, Search.search(Search.buildIndex(books), '債権者代位権', { kind: 'all', matchModes: { exact: true, partial: true, and: true, fuzzy: true } }));
  assert.equal(diagnostics.length, 1);
});

test('worker runtime error switches subsequent searches to direct mode', async () => {
  const executor = Client.createSearchExecutor({ WorkerCtor: FakeWorker, workerUrl: 'worker.js', directApi: Search });
  const buildPromise = executor.build(books);
  FakeWorker.instance.emit({ type: 'built', generation: 1 });
  await buildPromise;
  FakeWorker.instance.fail(new Error('boom'));
  assert.equal(executor.mode, 'direct');
  const response = await executor.search('債権者代位権', { kind: 'all' });
  assert.equal(response.stale, false);
  assert.ok(response.results.length >= 1);
});
