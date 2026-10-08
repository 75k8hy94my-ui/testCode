(function (root) {
  'use strict';

  function create(options) {
    if (!options || typeof options.onSingleTap !== 'function' || typeof options.onDoubleTap !== 'function') {
      throw new TypeError('single- and double-tap handlers are required');
    }
    const setTimer = options.setTimeoutRef || setTimeout;
    const clearTimer = options.clearTimeoutRef || clearTimeout;
    const delayMs = Number.isFinite(options.delayMs) && options.delayMs >= 0 ? options.delayMs : 300;
    let timer = null;
    let destroyed = false;

    function tap(event) {
      if (destroyed) return;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
        options.onDoubleTap(event);
        return;
      }
      timer = setTimer(() => {
        timer = null;
        if (!destroyed) options.onSingleTap(event);
      }, delayMs);
    }

    function destroy() {
      destroyed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    }

    return Object.freeze({ tap, destroy });
  }

  function actionAt(clientX, rect) {
    const width = Number(rect && rect.width) || 0;
    const ratio = width > 0 ? (Number(clientX) - (Number(rect.left) || 0)) / width : 0.5;
    if (ratio < 0.35) return 'seekBackward';
    if (ratio > 0.65) return 'seekForward';
    return 'fullscreen';
  }

  const api = Object.freeze({ create, actionAt });
  root.MangaReaderVideoGestures = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
