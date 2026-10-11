import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;

function request(action) {
  const result = { result: undefined, error: null, onsuccess: null, onerror: null };
  setTimeout(() => {
    try { result.result = action(); result.onsuccess?.(); }
    catch (error) { result.error = error; result.onerror?.(); }
  }, 0);
  return result;
}
class FakeStore {
  constructor(database) { this.database = database; }
  get(key) { return request(() => this.database.records.get(key)); }
  getAll() { this.database.getAllCalls++; return request(() => [...this.database.records.values()]); }
  put(record) { this.database.records.set(record.key, record); return request(() => undefined); }
  delete(key) { this.database.records.delete(key); return request(() => undefined); }
  clear() { this.database.records.clear(); return request(() => undefined); }
}
class FakeTransaction {
  constructor(database) { this.database = database; setTimeout(() => this.oncomplete?.(), 35); }
  objectStore() { return new FakeStore(this.database); }
}
class FakeDatabase {
  constructor() { this.records = new Map(); this.getAllCalls = 0; this.objectStoreNames = { contains: () => true }; }
  transaction() { return new FakeTransaction(this); }
  close() {}
}
class FakeIndexedDB {
  constructor({ failFirstOpen = false } = {}) { this.database = new FakeDatabase(); this.failFirstOpen = failFirstOpen; this.openCalls = 0; }
  open() {
    this.openCalls++;
    const result = { result: this.database, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      if (this.failFirstOpen && this.openCalls === 1) { result.error = new Error('open failed'); result.onerror?.(); return; }
      result.onupgradeneeded?.();
      result.onsuccess?.();
    }, 0);
    return result;
  }
}

function createCache({ idb = new FakeIndexedDB(), initialUser = 'user-a', access = () => true,
  key = new Uint8Array(32).fill(3), fetcher, remoteAccess } = {}) {
  const storage = new Map([['session', JSON.stringify({ user: { id: initialUser } })]]);
  const mediaAccess = { getStatus: () => access() ? 'allowed' : 'blocked', canReadExternalMedia: access, canReadProtectedData: access };
  const source = fs.readFileSync(new URL('../manga-list-image-cache.js', import.meta.url), 'utf8');
  const context = { self: {}, module: { exports: {} }, crypto: globalThis.crypto, Blob, URL };
  vm.runInNewContext(source, context);
  const factory = context.self.MangaListImageCacheFactory;
  const calls = [];
  const cache = factory.create({
    indexedDB: idb, urlApi: { createObjectURL: () => 'blob:image' }, fetch: fetcher || (async () => ({ ok: false })),
    readStorageItem(name) { return storage.get(name) || null; }, sessionKey: 'session',
    mediaAccess, crypto: globalThis.crypto, getEncryptionKey: () => key,
    remoteAccess: remoteAccess || { async runRemoteRead(options, operation) {
      calls.push(options);
      return operation({ signal: options.signal, recordObserved() {} });
    } },
  });
  return { cache, storage, idb, calls, setUser(userId) { storage.set('session', JSON.stringify({ user: { id: userId } })); }, setKey(value) { key = value; }, setAccess(value) { access = () => value; } };
}

function imageFetcher({ waitForImage } = {}) {
  return async (url, init) => {
    if (url.includes('/sign/')) return { ok: true, async json() { return { signedURL: 'https://storage.test/signed' }; } };
    if (waitForImage) return { ok: true, async blob() { return await waitForImage; } };
    return { ok: true, async blob() { return new Blob(['private image bytes'], { type: 'image/jpeg' }); } };
  };
}

test('cache miss goes through the shared quota/VPN gate and encrypts private image bytes before persistence', async () => {
  const harness = createCache({ fetcher: imageFetcher() });
  const url = await harness.cache.loadCachedLocalImage({ url: 'https://storage.test' }, 'access-token', 'user-a/books/cover.jpg', 19, 'user-a');
  assert.equal(url, 'blob:image');
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].estimatedBytes, 19);
  const stored = [...harness.idb.database.records.values()].find(row => row.userId === 'user-a');
  assert.ok(stored.encrypted);
  assert.equal(stored.blob, undefined);
  assert.doesNotMatch(JSON.stringify(stored), /private image bytes|access-token/);
});

test('account changes during a delayed fetch cannot cache or display the prior account image', async () => {
  let resolveImage;
  const pending = new Promise(resolve => { resolveImage = resolve; });
  const harness = createCache({ fetcher: imageFetcher({ waitForImage: pending }) });
  const loading = harness.cache.loadCachedLocalImage({ url: 'https://storage.test' }, 'token-a', 'user-a/books/cover.jpg', 100, 'user-a');
  await new Promise(resolve => setTimeout(resolve, 5));
  harness.setUser('user-b');
  resolveImage(new Blob(['account-a bytes'], { type: 'image/jpeg' }));
  await assert.rejects(loading, /account|session|protected/i);
  assert.equal([...harness.idb.database.records.values()].filter(row => row.userId === 'user-b').length, 0);
});

test('clearing one account cache preserves another account cache', async () => {
  const harness = createCache({ fetcher: imageFetcher() });
  await harness.cache.loadCachedLocalImage({ url: 'https://storage.test' }, 'token-a', 'user-a/books/a.jpg', 10, 'user-a');
  harness.setUser('user-b');
  await harness.cache.loadCachedLocalImage({ url: 'https://storage.test' }, 'token-b', 'user-b/books/b.jpg', 10, 'user-b');
  await harness.cache.clearUserCache('user-a');
  const remaining = [...harness.idb.database.records.values()].filter(row => row.userId);
  assert.deepEqual(remaining.map(row => row.userId), ['user-b']);
});

test('failed IndexedDB initialization is retryable instead of cached as a permanent rejection', async () => {
  const idb = new FakeIndexedDB({ failFirstOpen: true });
  const harness = createCache({ idb, fetcher: imageFetcher() });
  await harness.cache.loadCachedLocalImage({ url: 'https://storage.test' }, 'token-a', 'user-a/books/a.jpg', 10, 'user-a');
  await harness.cache.loadCachedLocalImage({ url: 'https://storage.test' }, 'token-a', 'user-a/books/b.jpg', 10, 'user-a');
  assert.ok(idb.openCalls >= 2);
});
