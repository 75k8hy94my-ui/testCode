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


test('the shared daily allowance applies to additions and clicks and resets the next day', async () => {
  const data = new Map([[Metadata.CONSENT_KEY, 'allow']]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return { ok: true, json: async () => ({ status: 'success', data: { title: 'Example video' } }) };
  };
  const dayOne = new Date('2026-10-26T10:00:00');
  for (let i = 0; i < Metadata.DAILY_LIMIT; i += 1) {
    const result = await Metadata.lookupWithConsent('https://example.com/video/' + i, {
      storage, fetchImpl, now: dayOne,
    });
    assert.equal(result.title, 'Example video');
    assert.equal(result.status, 'success');
  }
  assert.equal((await Metadata.lookupWithConsent('https://example.com/extra', {
    storage, fetchImpl, now: dayOne,
  })).status, 'quota');
  assert.equal(requests, Metadata.DAILY_LIMIT);
  const tomorrow = new Date('2026-10-27T10:00:00');
  assert.equal((await Metadata.lookupWithConsent('https://example.com/next', {
    storage, fetchImpl, now: tomorrow,
  })).status, 'success');
  assert.equal(requests, Metadata.DAILY_LIMIT + 1);
});

test('declining consent or private URLs never use the daily request allowance', async () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error('unexpected request'); };
  assert.equal((await Metadata.lookupWithConsent('https://example.com/watch', {
    storage, confirm: () => false, fetchImpl,
  })).status, 'declined');
  assert.equal((await Metadata.lookupWithConsent('http://localhost/private', {
    storage, fetchImpl,
  })).status, 'unsafe');
  assert.equal(calls, 0);
  assert.equal(data.has(Metadata.DAILY_KEY), false);
});

test('the click route is lazy: no bulk fetch on list render and one enrichment on an untitled click', async () => {
  const fs = await import('node:fs');
  const route = fs.readFileSync(new URL('../video-routing-fix.js', import.meta.url), 'utf8');
  const list = fs.readFileSync(new URL('../video-library.js', import.meta.url), 'utf8');
  assert.match(route, /startBookmarkLookup\(base, sourceUrl, openButton\.href\)/);
  assert.match(route, /!text\(saved\.title\) && !text\(base\.title\)/);
  assert.match(route, /lookup\.lookupWithConsent\(url\)/);
  assert.match(route, /saveOpenedBookmarkTitle\(id, url, result\.title\)/);
  assert.match(route, /text\(existing\.title\) \|\| text\(latest\.title\)/);
  assert.match(route, /window\.location\.href = href/);
  assert.match(list, /refreshFromStorage/);
  assert.doesNotMatch(list.slice(list.indexOf('function render('), list.indexOf('function renderSuggestedTags')), /lookupWithConsent/);
});
