(function (root, factory) {
  const Edit = typeof module !== 'undefined' && module.exports
    ? require('./video-virtual-edit.js') : root.MangaReaderVideoVirtualEdit;
  const api = factory(Edit);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoVirtualEditorState = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Edit) {
  'use strict';
  const DEFAULT_ZOOM = 24;
  const MIN_ZOOM = 2;
  const MAX_ZOOM = 512;
  const MAX_HISTORY = 100;

  function cloneEdit(edit) {
    if (edit === null) return null;
    const normalized = Edit.normalizeEdit(edit);
    normalized.clips.forEach(Object.freeze);
    Object.freeze(normalized.clips);
    return Object.freeze(normalized);
  }

  function snapshot(edit, selectedIndex = null) {
    const copy = cloneEdit(edit);
    const index = copy && Number.isInteger(selectedIndex)
      && selectedIndex >= 0 && selectedIndex < copy.clips.length ? selectedIndex : null;
    return Object.freeze({ edit: copy, selectedIndex: index });
  }

  function history(past, current, future, limit) {
    return Object.freeze({
      past: Object.freeze(past.slice(-limit)), current, future: Object.freeze(future.slice()), limit,
    });
  }

  function createHistory(initialEdit, limit = MAX_HISTORY) {
    const boundedLimit = Number.isInteger(limit) ? Math.max(1, Math.min(MAX_HISTORY, limit)) : MAX_HISTORY;
    return history([], snapshot(initialEdit), [], boundedLimit);
  }

  function sameSnapshot(left, right) {
    return left.selectedIndex === right.selectedIndex
      && JSON.stringify(left.edit) === JSON.stringify(right.edit);
  }

  function push(currentHistory, edit, selectedIndex) {
    const next = snapshot(edit, selectedIndex);
    if (sameSnapshot(currentHistory.current, next)) return currentHistory;
    return history([...currentHistory.past, currentHistory.current], next, [], currentHistory.limit);
  }

  function undo(currentHistory) {
    if (!currentHistory.past.length) return Object.freeze({ history: currentHistory, snapshot: currentHistory.current });
    const past = currentHistory.past.slice();
    const current = past.pop();
    const next = history(past, current, [currentHistory.current, ...currentHistory.future], currentHistory.limit);
    return Object.freeze({ history: next, snapshot: next.current });
  }

  function redo(currentHistory) {
    if (!currentHistory.future.length) return Object.freeze({ history: currentHistory, snapshot: currentHistory.current });
    const future = currentHistory.future.slice();
    const current = future.shift();
    const next = history([...currentHistory.past, currentHistory.current], current, future, currentHistory.limit);
    return Object.freeze({ history: next, snapshot: next.current });
  }

  function mapClientXToVirtualTime({ clientX, rectLeft, scrollLeft, pixelsPerSecond, totalSeconds } = {}) {
    const values = [clientX, rectLeft, scrollLeft, pixelsPerSecond, totalSeconds];
    if (!values.every(Number.isFinite) || scrollLeft < 0 || pixelsPerSecond <= 0 || totalSeconds < 0) {
      throw new TypeError('Timeline coordinates must be finite with a positive scale and non-negative range');
    }
    const seconds = (clientX - rectLeft + scrollLeft) / pixelsPerSecond;
    return Math.max(0, Math.min(totalSeconds, seconds));
  }

  function clipOffsets(edit) {
    const normalized = Edit.normalizeEdit(edit);
    const offsets = [];
    let totalSeconds = 0;
    normalized.clips.forEach((clip) => {
      offsets.push(totalSeconds);
      totalSeconds += clip.endSeconds - clip.startSeconds;
    });
    return Object.freeze({ offsets: Object.freeze(offsets), totalSeconds });
  }

  function clampZoom(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ZOOM;
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  return Object.freeze({
    DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, MAX_HISTORY,
    createHistory, push, undo, redo, mapClientXToVirtualTime, clipOffsets, clampZoom,
  });
}));
