const test = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, createStore } = require('../video-playback-privacy.js');

function setup() {
  const values = new Map();
  const attributes = {};
  const listeners = {};
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const doc = { documentElement: { setAttribute: (key, value) => { attributes[key] = value; } } };
  const events = {
    addEventListener: (type, handler) => { listeners[type] = handler; },
    dispatchEvent: () => {},
  };
  return { values, attributes, listeners, storage, doc, events };
}

test('privacy switches default to off and are independent', () => {
  const env = setup();
  const privacy = createStore(env.storage, env.doc, env.events);
  assert.deepEqual(privacy.getSettings(), { maskMetadata: false, maskVideo: false });
  privacy.setSetting('maskMetadata', true);
  assert.deepEqual(privacy.getSettings(), { maskMetadata: true, maskVideo: false });
  assert.equal(env.attributes['data-video-mask-metadata'], '1');
  assert.equal(env.attributes['data-video-mask-video'], '0');
  privacy.setSetting('maskVideo', true);
  assert.deepEqual(privacy.getSettings(), { maskMetadata: true, maskVideo: true });
  privacy.setSetting('maskMetadata', false);
  assert.deepEqual(privacy.getSettings(), { maskMetadata: false, maskVideo: true });
});

test('privacy settings persist, reload and follow other-tab storage changes', () => {
  const env = setup();
  const first = createStore(env.storage, env.doc, env.events);
  first.setSetting('maskVideo', true);
  const reloaded = createStore(env.storage, env.doc, env.events);
  assert.equal(reloaded.getSettings().maskVideo, true);
  env.values.set(STORAGE_KEY, '{"maskMetadata":true,"maskVideo":false}');
  env.listeners.storage({ key: STORAGE_KEY });
  assert.equal(env.attributes['data-video-mask-metadata'], '1');
  assert.equal(env.attributes['data-video-mask-video'], '0');
});

test('invalid values never enable privacy; invalid keys are rejected', () => {
  const env = setup();
  env.values.set(STORAGE_KEY, '{"maskMetadata":"true","maskVideo":1}');
  const privacy = createStore(env.storage, env.doc, env.events);
  assert.deepEqual(privacy.getSettings(), { maskMetadata: false, maskVideo: false });
  assert.throws(() => privacy.setSetting('other', true), TypeError);
  env.values.set(STORAGE_KEY, '{invalid json');
  assert.deepEqual(privacy.getSettings(), { maskMetadata: false, maskVideo: false });
});

test('failed writes do not claim the switch is saved', () => {
  const env = setup();
  env.storage.setItem = () => { throw new Error('storage denied'); };
  const privacy = createStore(env.storage, env.doc, env.events);
  assert.throws(() => privacy.setSetting('maskVideo', true), /storage denied/);
  assert.equal(env.attributes['data-video-mask-video'], '0');
});
