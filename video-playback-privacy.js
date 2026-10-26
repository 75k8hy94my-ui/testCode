(function (root) {
  'use strict';

  // A device-only display preference. It must not be part of the encrypted
  // video library or its cloud-sync payload.
  const STORAGE_KEY = 'testCode.videoPlaybackPrivacy.v1';
  const FIELDS = ['maskMetadata', 'maskVideo'];

  function createStore(storage, documentRef, events) {
    function normalize(value) {
      const input = value && typeof value === 'object' ? value : {};
      return {
        maskMetadata: input.maskMetadata === true,
        maskVideo: input.maskVideo === true,
      };
    }

    function getSettings() {
      try {
        return normalize(JSON.parse(storage && storage.getItem(STORAGE_KEY) || 'null'));
      } catch (_) {
        return normalize(null);
      }
    }

    function apply(settings = getSettings()) {
      const next = normalize(settings);
      const html = documentRef && documentRef.documentElement;
      if (html) {
        html.setAttribute('data-video-mask-metadata', next.maskMetadata ? '1' : '0');
        html.setAttribute('data-video-mask-video', next.maskVideo ? '1' : '0');
      }
      if (events && typeof events.dispatchEvent === 'function' && typeof events.CustomEvent === 'function') {
        events.dispatchEvent(new events.CustomEvent('testcode-video-playback-privacy-change', { detail: next }));
      }
      return next;
    }

    function setSetting(field, enabled) {
      if (!FIELDS.includes(field)) throw new TypeError('Unknown video playback privacy setting');
      const updated = { ...getSettings(), [field]: enabled === true };
      // Never show a switch as saved when local storage rejected the write.
      if (!storage) throw new Error('端末に設定を保存できません。');
      storage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return apply(updated);
    }

    if (events && typeof events.addEventListener === 'function') {
      events.addEventListener('storage', (event) => {
        if (!event || event.key === STORAGE_KEY || event.key === null) apply();
      });
    }
    apply();
    return Object.freeze({ getSettings, setSetting, apply });
  }

  let storage = null;
  try { storage = root.localStorage; } catch (_) { /* Storage may be disabled. */ }
  const api = createStore(storage, root.document, root);
  root.TestCodeVideoPlaybackPrivacy = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { STORAGE_KEY, createStore };
  }
})(typeof window !== 'undefined' ? window : globalThis);
