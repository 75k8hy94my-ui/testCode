// Adapt non-destructive MP4 sequences to the ordinary video detail player's
// time/play API. The physical video element continues to own volume, mute,
// fullscreen, display, and network decoding.
(function (root, factory) {
  const Playback = typeof module !== 'undefined' && module.exports
    ? require('./video-virtual-playback.js') : root.MangaReaderVideoVirtualPlayback;
  const api = factory(Playback);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoVirtualAdapter = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Playback) {
  'use strict';
  function attach({ video, edit, sources } = {}) {
    if (!video || !Playback || typeof Playback.createController !== 'function') {
      throw new Error('動画の編集結果を再生できません。');
    }
    let controller;
    let last = { virtualSeconds: 0, totalSeconds: 0, requestedPlay: false, phase: 'idle' };
    let alive = true;
    const onState = (snapshot) => {
      if (!alive) return;
      last = snapshot;
      // Do not synthesize 'timeupdate': it is an input to the playback
      // controller itself and would cause recursive event handling.
      if (video.dispatchEvent && typeof CustomEvent === 'function') {
        video.dispatchEvent(new CustomEvent('virtual-edit-state', { detail: snapshot }));
      }
    };
    controller = Playback.createController({ video, edit, sources, onState });
    const adapter = {
      get currentTime() { return last.virtualSeconds; },
      set currentTime(value) {
        if (!alive) return;
        const num = Number(value);
        if (Number.isFinite(num)) controller.seek(Math.max(0, Math.min(last.totalSeconds, num)));
      },
      get duration() { return last.totalSeconds; },
      get paused() { return !last.requestedPlay; },
      get ended() { return last.phase === 'finished'; },
      play() { if (alive) controller.play(); },
      pause() { if (alive) controller.pause(); },
      snapshot() { return controller.snapshot(); },
      destroy() { if (!alive) return; alive = false; controller.destroy(); },
    };
    video.__virtualPlaybackAdapter = adapter;
    video.dataset.virtualEdited = '1';
    video.controls = false;
    return adapter;
  }
  return Object.freeze({ attach });
}));