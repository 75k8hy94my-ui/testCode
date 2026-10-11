(function (root, factory) {
  const api = factory(root.MangaReaderVideoCustomProperties);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoCustomPropertyStore = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Properties) {
  'use strict';

  if (!Properties) throw new Error('video custom property model must load before its store');
  const DEFINITIONS_KEY = 'mangaReaderVideoPropertyDefinitions';
  const VALUES_KEY = 'mangaReaderVideoPropertyValues';
  let localQueue = Promise.resolve();
  const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => !!value && Object.prototype.hasOwnProperty.call(value, key);
  const stableJson = (value) => {
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    if (isRecord(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };

  function getRaw(storage, key) {
    if (storage && typeof storage.getItem === 'function') return storage.getItem(key);
    if (storage && typeof storage.get === 'function') return storage.get(key) ?? null;
    return storage && typeof storage === 'object' && own(storage, key) ? storage[key] : null;
  }

  function setRaw(storage, key, value) {
    if (storage && typeof storage.setItem === 'function') return storage.setItem(key, value);
    if (storage && typeof storage.set === 'function') return storage.set(key, value);
    if (storage && typeof storage === 'object') { storage[key] = value; return; }
    throw new TypeError('保存領域を利用できません。');
  }

  function removeRaw(storage, key) {
    if (storage && typeof storage.removeItem === 'function') return storage.removeItem(key);
    if (storage && typeof storage.delete === 'function') return storage.delete(key);
    if (storage && typeof storage === 'object') delete storage[key];
  }

  function decode(storage, key, fallback) {
    const raw = getRaw(storage, key);
    if (raw == null) return { raw, value: fallback, validJson: true };
    try { return { raw, value: JSON.parse(raw), validJson: true }; }
    catch (_) { return { raw, value: fallback, validJson: false }; }
  }

  function stateFrom(storage) {
    const definitions = decode(storage, DEFINITIONS_KEY, { schemaVersion: 1, properties: {} });
    const values = decode(storage, VALUES_KEY, {});
    return {
      state: {
        definitions: Properties.normalizeDefinitions(definitions.value),
        values: Properties.normalizeValues(values.value),
      },
      raw: { definitions, values },
    };
  }

  function read(storage = globalThis.localStorage) {
    return stateFrom(storage).state;
  }

  function runLocked(work) {
    const locks = globalThis.navigator && globalThis.navigator.locks;
    if (locks && typeof locks.request === 'function') {
      return locks.request('manga-reader-video-custom-properties', { mode: 'exclusive' }, work);
    }
    const next = localQueue.catch(() => {}).then(work);
    localQueue = next.catch(() => {});
    return next;
  }

  function rootIsValid(entry, kind) {
    if (!entry.validJson) return false;
    if (entry.raw == null) return true;
    if (!isRecord(entry.value)) return false;
    return kind !== 'definitions' || isRecord(entry.value.properties);
  }

  function restoreSnapshot(storage, snapshots) {
    for (const [key, raw] of snapshots) {
      try { if (raw == null) removeRaw(storage, key); else setRaw(storage, key, raw); } catch (_) {}
    }
  }

  async function mutate({ storage = globalThis.localStorage, guest = false, vault, recipe } = {}) {
    if (typeof recipe !== 'function') throw new TypeError('recipe must be a function');
    const outcome = await runLocked(async () => {
      const current = stateFrom(storage);
      const proposed = await recipe(current.state);
      if (!isRecord(proposed)) throw new TypeError('recipe must return property state');
      const definitions = proposed.definitions === undefined ? current.state.definitions : Properties.normalizeDefinitions(proposed.definitions);
      const values = proposed.values === undefined ? current.state.values : Properties.normalizeValues(proposed.values);
      const definitionsChanged = stableJson(definitions) !== stableJson(current.state.definitions);
      const valuesChanged = stableJson(values) !== stableJson(current.state.values);
      if (!definitionsChanged && !valuesChanged) return { state: current.state, changed: false };
      if (definitionsChanged && !rootIsValid(current.raw.definitions, 'definitions')) throw new Error('プロパティ定義データが破損しているため、変更を保存できません。元データは保持しました。');
      if (valuesChanged && !rootIsValid(current.raw.values, 'values')) throw new Error('動画プロパティデータが破損しているため、変更を保存できません。元データは保持しました。');

      if (!guest) {
        if (!vault || typeof vault.markLocalChangesPending !== 'function' || vault.markLocalChangesPending() !== true) {
          throw new Error('未同期状態を記録できないため、変更を保存しませんでした。');
        }
      }

      const keys = [];
      if (definitionsChanged) keys.push([DEFINITIONS_KEY, current.raw.definitions.raw, definitions]);
      if (valuesChanged) keys.push([VALUES_KEY, current.raw.values.raw, values]);
      const snapshots = keys.map(([key, raw]) => [key, raw]);
      try {
        for (const [key, , value] of keys) setRaw(storage, key, JSON.stringify(value));
      } catch (error) {
        restoreSnapshot(storage, snapshots);
        throw error;
      }
      return { state: { definitions, values }, changed: true };
    });

    if (!outcome.changed) return { localSaved: true, synced: guest ? null : true, guest, state: outcome.state };
    if (guest) return { localSaved: true, synced: null, guest: true, state: outcome.state };
    try {
      await vault.saveLocalChanges();
      return { localSaved: true, synced: true, guest: false, state: outcome.state };
    } catch (error) {
      return { localSaved: true, synced: false, guest: false, syncError: error && error.message ? error.message : 'クラウド同期に失敗しました。', state: outcome.state };
    }
  }

  async function removeVideoValues({ storage = globalThis.localStorage, videoId, guest = false, vault, pointerPath, alreadyJournaled = false } = {}) {
    if (videoId == null || String(videoId) === '') throw new TypeError('videoId is required');
    const id = String(videoId);
    const remove = () => runLocked(async () => {
      const current = stateFrom(storage);
      if (!rootIsValid(current.raw.values, 'values')) throw new Error('動画プロパティデータが破損しているため、削除を保存できません。元データは保持しました。');
      if (!own(current.state.values, id)) return false;
      const next = { ...current.state.values };
      delete next[id];
      const previous = current.raw.values.raw;
      try { setRaw(storage, VALUES_KEY, JSON.stringify(next)); }
      catch (error) { restoreSnapshot(storage, [[VALUES_KEY, previous]]); throw error; }
      return true;
    });

    if (guest || alreadyJournaled) return { removed: await remove(), journaled: alreadyJournaled, guest };
    if (!vault || typeof vault.recordSyncDeletion !== 'function' || typeof pointerPath !== 'function') {
      throw new Error('保管庫を開いてからプロパティ値を削除してください。');
    }
    let removed = false;
    const path = pointerPath('videoPropertyValues', id);
    await vault.recordSyncDeletion(path, async () => { removed = await remove(); });
    return { removed, journaled: true, guest: false, path };
  }

  return Object.freeze({ DEFINITIONS_KEY, VALUES_KEY, read, mutate, removeVideoValues });
}));
