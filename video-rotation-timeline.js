/* Video playback rotation keyframes: each time replaces the prior orientation. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TestCodeVideoRotationTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DIRECTIONS = new Set(['none', 'left', 'right', 'half']);
  function normalize(rows) {
    if (!Array.isArray(rows)) return [];
    const entries = [];
    for (const item of rows.slice(0, 200)) {
      if (!item || typeof item !== 'object') continue;
      const seconds = Number(item.seconds);
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 864000
        || !DIRECTIONS.has(item.direction)) continue;
      entries.push({ seconds, direction: item.direction });
    }
    entries.sort((a, b) => a.seconds - b.seconds);
    // Last entry at a timestamp wins.
    return entries.filter((item, index) => index === entries.length - 1
      || item.seconds !== entries[index + 1].seconds);
  }
  function directionAt(rows, seconds, initial = 'none') {
    let direction = DIRECTIONS.has(initial) ? initial : 'none';
    const at = Number(seconds);
    if (!Number.isFinite(at) || at < 0) return direction;
    for (const row of rows) {
      if (row.seconds > at) break;
      direction = row.direction;
    }
    return direction;
  }
  function attach(frame, video, rows, initial, Rotation) {
    const timeline = normalize(rows);
    if (!video || !Rotation || typeof Rotation.install !== 'function') return () => {};
    let current = null;
    let cleanup = () => {};
    let disposed = false;
    const refresh = () => {
      if (disposed) return;
      const next = directionAt(timeline, video.currentTime || 0, initial);
      if (next === current) return;
      cleanup();
      current = next;
      cleanup = Rotation.install(frame, video, next, { expandFrame: true });
    };
    for (const type of ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'emptied']) {
      video.addEventListener(type, refresh);
    }
    refresh();
    return () => {
      disposed = true;
      for (const type of ['timeupdate', 'seeking', 'seeked', 'loadedmetadata', 'emptied']) {
        video.removeEventListener(type, refresh);
      }
      cleanup();
    };
  }
  return { normalize, directionAt, attach };
});
