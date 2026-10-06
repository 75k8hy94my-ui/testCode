import test from 'node:test';
import assert from 'node:assert/strict';
import '../manga-import-bridge.js';

function setup() {
  const listeners = new Set(); const sent = [];
  const windowRef = { addEventListener: (_type, fn) => listeners.add(fn), removeEventListener: (_type, fn) => listeners.delete(fn), postMessage: (data, origin) => sent.push({ data, origin }) };
  const bridge = globalThis.MangaImportBridge.create({ windowRef, origin: 'https://test.example', timeoutMs: 100, createRequestId: (() => { let n = 0; return () => `req-${++n}`; })() });
  return { bridge, listeners, sent, respond: (data, extra = {}) => [...listeners][0]({ data, origin: 'https://test.example', source: windowRef, ...extra }) };
}
const item = { queueId: 'q1', candidate: { schemaVersion: 1 }, addedAt: 1, warnings: ['review me'] };
test('requests queued candidates once with a request ID and preserves wrappers and warnings', async () => {
  const ctx = setup(); const promise = ctx.bridge.requestQueuedCandidates();
  assert.equal(ctx.sent.length, 1); assert.equal(ctx.sent[0].data.type, 'TESTCODE_MOMON_IMPORT_REQUEST');
  ctx.respond({ type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: 'req-1', items: [item] });
  assert.deepEqual(await promise, [item]);
});
test('rejects spoofed source, wrong origin, response type, schema, and stale request IDs', async () => {
  for (const [label, envelope, extra] of [
    ['source', { type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: 'req-1', items: [] }, { source: {} }],
    ['origin', { type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: 'req-1', items: [] }, { origin: 'https://evil.example' }],
    ['type', { type: 'NOPE', schemaVersion: 1, requestId: 'req-1', items: [] }, {}],
    ['schema', { type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 9, requestId: 'req-1', items: [] }, {}],
    ['request ID', { type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: 'stale', items: [] }, {}],
  ]) {
    const ctx = setup(); const promise = ctx.bridge.requestQueuedCandidates();
    ctx.respond(envelope, extra);
    await assert.rejects(promise, new RegExp(label === 'request ID' ? 'request' : label, 'i'));
  }
});
test('rejects malformed queue wrappers, failed responses, and times out', async () => {
  let ctx = setup(); let promise = ctx.bridge.requestQueuedCandidates();
  ctx.respond({ type: 'TESTCODE_MOMON_IMPORT_RESPONSE', schemaVersion: 1, requestId: 'req-1', items: [{ ...item, queueId: '' }] });
  await assert.rejects(promise, /queue/i);
  ctx = setup(); promise = ctx.bridge.requestQueuedCandidates();
  ctx.respond({ type: 'TESTCODE_MOMON_IMPORT_ERROR', schemaVersion: 1, requestId: 'req-1', error: 'worker failed' });
  await assert.rejects(promise, /worker failed/);
  ctx = setup(); await assert.rejects(ctx.bridge.requestQueuedCandidates(), /timed out/i);
});
test('removes only explicitly requested queue IDs and checks the removal response', async () => {
  const ctx = setup(); const promise = ctx.bridge.removeQueuedCandidates(['q1']);
  assert.deepEqual(ctx.sent[0].data.queueIds, ['q1']);
  ctx.respond({ type: 'TESTCODE_MOMON_IMPORT_REMOVE_RESPONSE', schemaVersion: 1, requestId: 'req-1', removedQueueIds: ['q1'] });
  assert.deepEqual(await promise, ['q1']);
});
