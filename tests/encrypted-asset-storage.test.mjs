import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import storageApi from '../encrypted-asset-storage.js';

const calls = [];
function response(status, body = new Uint8Array(), errorBody = null) {
  return { status, ok: status >= 200 && status < 300, async arrayBuffer() { return body.buffer; }, async json() { if (errorBody) return errorBody; throw new Error('no json'); }, clone() { return response(status, body, errorBody); } };
}
function transport(fetchImpl = async (url, options) => { calls.push({ url, options }); return response(201); }) {
  calls.length = 0;
  return storageApi.createStorageTransport({ baseUrl: 'https://example.test/', publishableKey: 'publishable', fetchImpl });
}

test('upload encodes each path segment and sends raw create-only binary', async () => {
  const storage = transport();
  const body = new Uint8Array([1, 2, 3]);
  const result = await storage.upload('user/asset/1/L0_0_0.mrae', 'token', body);
  assert.deepEqual(result, { created: true, exists: false });
  assert.equal(calls[0].url, 'https://example.test/storage/v1/object/vault-assets/user/asset/1/L0_0_0.mrae');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.apikey, 'publishable');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/octet-stream');
  assert.equal(calls[0].options.headers['x-upsert'], 'false');
  assert.deepEqual(calls[0].options.body, body);
});

test('409 is an existing object, other HTTP errors throw with status', async () => {
  assert.deepEqual(await transport(async () => response(409, new Uint8Array(), { code: 'ResourceAlreadyExists' })).upload('u/a/1/preview.mrae', 't', new Uint8Array()), { created: false, exists: true });
  assert.deepEqual(await transport(async () => response(409, new Uint8Array(), { code: 'already_exists' })).upload('u/a/1/preview.mrae', 't', new Uint8Array()), { created: false, exists: true });
  assert.deepEqual(await transport(async () => response(400, new Uint8Array(), { message: 'Asset Already Exists' })).upload('u/a/1/preview.mrae', 't', new Uint8Array()), { created: false, exists: true });
  await assert.rejects(transport(async () => response(400, new Uint8Array(), { code: 'InvalidRequest' })).upload('u/a/1/preview.mrae', 't', new Uint8Array()), error => error.status === 400);
  await assert.rejects(transport(async () => response(500)).upload('u/a/1/preview.mrae', 't', new Uint8Array()), error => error.status === 500);
});

test('authenticated download returns bytes and maps 404 to null', async () => {
  const body = Uint8Array.from([9, 8]);
  const storage = transport(async (url, options) => { calls.push({ url, options }); return response(200, body); });
  assert.deepEqual(await storage.download('u/a/1/preview.mrae', 'token'), body);
  assert.equal(calls[0].url, 'https://example.test/storage/v1/object/authenticated/vault-assets/u/a/1/preview.mrae');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
  assert.equal(calls[0].options.headers.apikey, 'publishable');
  assert.equal(await transport(async () => response(404)).download('u/a/1/preview.mrae', 't'), null);
});

test('AbortSignal propagates and no delete or signed URL API exists', async () => {
  const controller = new AbortController();
  let received;
  const storage = transport(async (_url, options) => { received = options.signal; return response(201); });
  await storage.upload('u/a/1/preview.mrae', 't', new Uint8Array(), controller.signal);
  assert.equal(received, controller.signal);
  assert.equal(typeof storage.delete, 'undefined');
  assert.equal(typeof storage.signedUrl, 'undefined');
  assert.doesNotMatch(fs.readFileSync(new URL('../encrypted-asset-storage.js', import.meta.url), 'utf8'), /service_role|signed.?url|DELETE|x-upsert\s*:\s*true|PUT/i);
});

test('classic script parse and required constructor validation', () => {
  assert.throws(() => storageApi.createStorageTransport({ baseUrl: '', publishableKey: 'x' }));
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(new URL('../encrypted-asset-storage.js', import.meta.url), 'utf8')));
});
