(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TestCodeVideoLoading = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // This is buffered *playback time*, not bytes downloaded. Merge disjoint
  // TimeRanges instead of treating the last range's end as a download count.
  function bufferedPercent(media) {
    const duration = Number(media && media.duration);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    let ranges;
    try { ranges = media.buffered; } catch (_) { return null; }
    if (!ranges || !ranges.length) return null;
    const spans = [];
    for (let i = 0; i < ranges.length; i += 1) {
      let start, end;
      try { start = Number(ranges.start(i)); end = Number(ranges.end(i)); }
      catch (_) { return null; }
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      start = Math.max(0, Math.min(duration, start));
      end = Math.max(0, Math.min(duration, end));
      if (end > start) spans.push([start, end]);
    }
    if (!spans.length) return null;
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0, from = spans[0][0], to = spans[0][1];
    for (let i = 1; i < spans.length; i += 1) {
      const [nextFrom, nextTo] = spans[i];
      if (nextFrom <= to) to = Math.max(to, nextTo);
      else { total += to - from; from = nextFrom; to = nextTo; }
    }
    total += to - from;
    return Math.max(0, Math.min(100, Math.floor(total / duration * 100)));
  }

  function attach(media, frame, documentRef) {
    if (!media || !frame || typeof media.addEventListener !== 'function') return () => {};
    const doc = documentRef || frame.ownerDocument || document;
    const badge = doc.createElement('div');
    badge.className = 'videoLoadingIndicator';
    badge.hidden = true;
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('aria-atomic', 'true');
    const label = doc.createElement('span');
    label.className = 'videoLoadingLabel';
    const detail = doc.createElement('small');
    detail.className = 'videoLoadingDetail';
    const track = doc.createElement('div');
    track.className = 'videoLoadingTrack';
    const fill = doc.createElement('span');
    fill.className = 'videoLoadingFill';
    track.append(fill);
    badge.append(label, detail, track);
    frame.append(badge);

    let state = 'loading';
    let destroyed = false;
    const titles = {
      loading: '読み込み中…',
      buffering: 'バッファリング中…',
      seeking: 'シーク先を読み込み中…',
      error: '動画を読み込めませんでした',
    };
    function render() {
      if (destroyed) return;
      badge.hidden = !state;
      if (!state) return;
      const percent = state === 'error' ? null : bufferedPercent(media);
      label.textContent = titles[state] + (percent == null ? '' : ' ' + percent + '%');
      detail.hidden = percent == null;
      detail.textContent = percent == null ? '' : '動画全体の先読み済み範囲';
      track.hidden = percent == null;
      if (percent != null) fill.style.width = percent + '%';
      badge.dataset.state = state;
    }
    const ready = () => { if (!media.error) { state = null; render(); } };
    const onLoadStart = () => { state = 'loading'; render(); };
    const onMetadata = () => {
      if (media.paused && !media.seeking) ready();
      else if (state) render();
    };
    const onPlay = () => {
      if (media.error) return;
      if (media.readyState < 3) {
        state = media.seeking ? 'seeking' : 'buffering';
        render();
      }
    };
    const onWaiting = () => {
      if (media.error || media.ended || media.readyState >= 3) return;
      state = media.seeking ? 'seeking' : 'buffering';
      render();
    };
    const onSeeking = () => { if (!media.error) { state = 'seeking'; render(); } };
    const onSeeked = () => {
      if (media.error) return;
      if (!media.paused && media.readyState < 3) { state = 'buffering'; render(); }
      else ready();
    };
    const onProgress = () => {
      if (!state || state === 'error') return;
      if (media.readyState >= 3 && !media.seeking) ready();
      else render();
    };
    const onPause = () => { if (media.readyState >= 1 && !media.seeking) ready(); };
    const onError = () => { state = 'error'; render(); };
    const onEmptied = () => { state = null; render(); };
    const listeners = [
      ['loadstart', onLoadStart], ['loadedmetadata', onMetadata],
      ['loadeddata', onMetadata], ['play', onPlay], ['waiting', onWaiting],
      ['stalled', onWaiting], ['seeking', onSeeking], ['seeked', onSeeked],
      ['progress', onProgress], ['canplay', ready], ['playing', ready],
      ['pause', onPause], ['error', onError], ['emptied', onEmptied],
    ];
    listeners.forEach(([name, fn]) => media.addEventListener(name, fn));
    render();
    return function destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.forEach(([name, fn]) => media.removeEventListener(name, fn));
      badge.remove();
    };
  }
  return Object.freeze({ bufferedPercent, attach });
});
