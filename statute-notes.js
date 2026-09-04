(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StatuteNotes = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STORAGE_KEY = 'mangaReaderStatuteNotes';
  const SYNC_DELAY_MS = 1200;
  let syncTimer = null;

  const text = (v) => String(v ?? '').trim();

  function sanitizeTags(value) {
    const rawList = Array.isArray(value) ? value : String(value || '').split(/[,、\s]+/);
    const seen = new Set();
    const result = [];
    rawList.forEach((item) => {
      const cleaned = text(item);
      if (!cleaned || seen.has(cleaned)) return;
      seen.add(cleaned);
      result.push(cleaned);
    });
    return result;
  }

  function normalizeNote(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const noteText = text(raw.text);
    if (!noteText) return null;
    const updatedAt = Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : Date.now();
    const tags = sanitizeTags(raw.tags);
    return { text: noteText, updatedAt, tags };
  }

  function normalizeNotes(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    Object.entries(value).forEach(([k, v]) => {
      const key = text(k);
      const normalized = normalizeNote(v);
      if (key && normalized) result[key] = normalized;
    });
    return result;
  }

  function getRaw(storage, key) {
    try {
      return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null);
    } catch (_) {
      return null;
    }
  }

  function setRaw(storage, key, value) {
    try {
      if (storage.setItem) storage.setItem(key, value);
      else storage.set(key, value);
    } catch (_) {}
  }

  function loadNotes(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    if (!storage) return {};
    try {
      const raw = getRaw(storage, STORAGE_KEY);
      return raw ? normalizeNotes(JSON.parse(raw)) : {};
    } catch (_) {
      return {};
    }
  }

  function saveNotes(notes, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const normalized = normalizeNotes(notes);
    if (storage) {
      setRaw(storage, STORAGE_KEY, JSON.stringify(normalized));
    }
    return normalized;
  }

  function getNote(key, storage) {
    const notes = loadNotes(storage);
    return notes[text(key)] || null;
  }

  function setNote(key, noteInput, storage) {
    const targetKey = text(key);
    if (!targetKey) return loadNotes(storage);
    const notes = loadNotes(storage);
    const body = text(noteInput && noteInput.text);

    if (!body) {
      delete notes[targetKey];
    } else {
      notes[targetKey] = {
        text: body,
        tags: sanitizeTags(noteInput && noteInput.tags),
        updatedAt: Date.now()
      };
    }
    return saveNotes(notes, storage);
  }

  function deleteNote(key, storage) {
    return setNote(key, null, storage);
  }

  function tagList(notes) {
    const seen = new Set();
    Object.values(notes || {}).forEach((note) => {
      if (note && Array.isArray(note.tags)) {
        note.tags.forEach((tag) => seen.add(tag));
      }
    });
    return [...seen].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  function notesCount(notes) {
    return Object.keys(notes || {}).length;
  }

  function scheduleSync(vault = (typeof window !== 'undefined' ? window.MangaVault : null), payloadApi = (typeof window !== 'undefined' ? window.MangaVaultPayload : null)) {
    if (!vault || !payloadApi || typeof vault.loadActive !== 'function' || !vault.loadActive() || !navigator.onLine) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await vault.savePayload(payloadApi.buildFromLocalStorage());
      } catch (error) {
        console.warn('Statute notes sync delayed or failed', error);
      }
    }, SYNC_DELAY_MS);
  }

  return {
    STORAGE_KEY,
    SYNC_DELAY_MS,
    sanitizeTags,
    normalizeNote,
    normalizeNotes,
    loadNotes,
    saveNotes,
    getNote,
    setNote,
    deleteNote,
    tagList,
    notesCount,
    scheduleSync
  };
}));
