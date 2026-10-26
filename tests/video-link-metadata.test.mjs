import test from 'node:test';
import assert from 'node:assert/strict';
import Metadata from '../video-link-metadata.js';

test('only public-looking HTTP(S) bookmarks without embedded credentials are eligible', () => {
  assert.equal(Metadata.publicUrl('https://example.com/watch?v=123#part'), 'https://example.com/watch?v=123');
  assert.equal(Metadata.publicUrl('https://example.com/watch?token=private'), null);
  assert.equal(Metadata.publicUrl('https://me:secret@example.com/watch'), null);
  assert.equal(Metadata.publicUrl('http://localhost:8000/watch'), null);
  assert.equal(Metadata.publicUrl('http://192.168.0.5/watch'), null);
  assert.equal(Metadata.publicUrl('file:///tmp/watch'), null);
});

test('metadata lookup uses the public API and extracts normalized title', async () => {
  let requested = null;
  const info = await Metadata.fetchMetadata('https://example.com/watch?v=123#secret', {
    fetchImpl: async (url, init) => {
      requested = new URL(url);
      assert.equal(init.credentials, 'omit');
      assert.equal(init.referrerPolicy, 'no-referrer');
      return { ok: true, json: async () => ({
        status: 'success',
        data: { title: '  My   Video  ', description: 'Sample description', publisher: 'Example' },
      }) };
    },
  });
  assert.equal(requested.origin, 'https://api.microlink.io');
  assert.equal(requested.searchParams.get('url'), 'https://example.com/watch?v=123');
  assert.deepEqual(info, { title: 'My Video', description: 'Sample description' });
});

test('empty or unsuccessful title responses do not invent metadata', async () => {
  await assert.rejects(Metadata.fetchMetadata('https://example.com/watch', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'success', data: {} }) }),
  }), /タイトル/);
  await assert.rejects(Metadata.fetchMetadata('https://example.com/watch', {
    fetchImpl: async () => ({ ok: false }),
  }), /取得できません/);
});

test('URL change asks permission once and safely fills only an empty title', async () => {
  class Control extends EventTarget {
    constructor(value = '') { super(); this.value = value; this.disabled = false; this.hidden = false; this.textContent = ''; }
  }
  const storageMap = new Map();
  const storage = {
    getItem: key => storageMap.get(key) ?? null,
    setItem: (key, value) => storageMap.set(key, value),
  };
  const urlInput = new Control('https://example.com/video');
  const titleInput = new Control();
  const panel = new Control();
  const button = new Control();
  const message = new Control();
  let asks = 0;
  let fetches = 0;
  const detach = Metadata.attach({
    urlInput, titleInput, panel, button, message, storage, isBookmark: () => true,
    confirm: () => { asks++; return true; },
    fetchImpl: async () => {
      fetches++;
      return { ok: true, json: async () => ({ status: 'success', data: { title: 'Fetched title' } }) };
    },
  });
  urlInput.dispatchEvent(new Event('change'));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(asks, 1);
  assert.equal(fetches, 1);
  assert.equal(titleInput.value, 'Fetched title');
  assert.equal(panel.hidden, false);
  urlInput.value = 'https://example.com/other';
  urlInput.dispatchEvent(new Event('input'));
  titleInput.value = '';
  urlInput.dispatchEvent(new Event('change'));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(asks, 1);
  assert.equal(fetches, 2);
  titleInput.value = 'My manual title';
  urlInput.dispatchEvent(new Event('change'));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(titleInput.value, 'My manual title');
  assert.equal(fetches, 2);
  detach();
});

test('no third-party request is issued after declining consent', async () => {
  class Control extends EventTarget {
    constructor(value = '') { super(); this.value = value; this.disabled = false; this.hidden = false; this.textContent = ''; }
  }
  const storageMap = new Map();
  const urlInput = new Control('https://example.com/video');
  const titleInput = new Control();
  const panel = new Control();
  const button = new Control();
  const message = new Control();
  let fetches = 0;
  const detach = Metadata.attach({
    urlInput, titleInput, panel, button, message, isBookmark: () => true,
    storage: { getItem: key => storageMap.get(key), setItem: (key, val) => storageMap.set(key, val) },
    confirm: () => false,
    fetchImpl: async () => { fetches++; return { ok: true, json: async () => ({}) }; },
  });
  urlInput.dispatchEvent(new Event('change'));
  await Promise.resolve();
  assert.equal(fetches, 0);
  assert.equal(storageMap.get(Metadata.CONSENT_KEY), 'decline');
  detach();
});
