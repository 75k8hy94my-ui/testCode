(function (root, factory) {
  const Edit = typeof module !== 'undefined' && module.exports
    ? require('./video-virtual-edit.js') : root.MangaReaderVideoVirtualEdit;
  const api = factory(Edit);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoVirtualPlayback = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Edit) {
  'use strict';
  const SEEK_EPSILON = 0.06;
  const END_EPSILON = 0.04;
  const LOAD_TIMEOUT_MS = 30000;

  // Reuses one <video> element. Only URLs/time ranges are changed; no media
  // bytes are downloaded/processed by application code or saved.
  function createController({ video, edit, sources, onState = () => {},
    schedule = setTimeout, cancelSchedule = clearTimeout } = {}) {
    if (!video || typeof video.addEventListener !== 'function') throw new TypeError('A video element is required');
    const normalized = Edit.validateSources(edit, sources);
    const sourceMap = new Map(sources.map((item) => [item.id, item.url]));
    const offsets = [];
    let total = 0;
    normalized.clips.forEach((clip) => {
      offsets.push(total);
      total += clip.endSeconds - clip.startSeconds;
    });
    let destroyed = false;
    let phase = 'idle';
    let error = '';
    let message = '';
    let activeIndex = -1;
    let requestedSeconds = 0;
    let sourceTime = null;
    let currentUrl = '';
    let wantsPlay = false;
    let pendingSeek = null;
    let timer = null;
    let revision = 0;

    function snapshot() {
      return {
        phase, error, message, clipIndex: activeIndex, clipCount: normalized.clips.length,
        virtualSeconds: requestedSeconds, totalSeconds: total, playing: wantsPlay && phase === 'ready',
        sourceVideoId: activeIndex < 0 ? null : normalized.clips[activeIndex].sourceVideoId,
      };
    }
    function emit() { if (!destroyed) onState(snapshot()); }
    function clearTimer() {
      if (timer !== null) cancelSchedule(timer);
      timer = null;
    }
    function armTimer(expected) {
      clearTimer();
      const token = revision;
      timer = schedule(() => {
        if (!destroyed && token === revision && phase === expected) {
          fail('MP4の読み込みまたはシークが完了しません。通信状況や配信元のRange対応を確認してください。');
        }
      }, LOAD_TIMEOUT_MS);
    }
    function fail(reason) {
      clearTimer();
      wantsPlay = false;
      phase = 'error';
      error = reason;
      message = reason;
      try { video.pause(); } catch (_) {}
      emit();
    }
    function finish() {
      clearTimer();
      revision++;
      wantsPlay = false;
      phase = 'finished';
      requestedSeconds = total;
      message = '再生が終了しました。';
      try { video.pause(); } catch (_) {}
      emit();
    }
    function beginPlaying() {
      if (!wantsPlay || destroyed || phase !== 'ready') return;
      const token = revision;
      let promise;
      try { promise = video.play(); }
      catch (_) {
        wantsPlay = false;
        message = 'ブラウザが再生を許可しませんでした。再生ボタンを押してください。';
        emit();
        return;
      }
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          if (destroyed || token !== revision || phase !== 'ready' || !wantsPlay) return;
          wantsPlay = false;
          message = 'ブラウザが自動再生を許可しませんでした。再生ボタンを押してください。';
          emit();
        });
      }
      emit();
    }
    function ready() {
      if (destroyed || phase !== 'seeking') return;
      clearTimer();
      phase = 'ready';
      error = '';
      message = '';
      const clip = normalized.clips[activeIndex];
      // Ignore timeupdate values from before the media seek settled.
      const actual = video.currentTime;
      if (Number.isFinite(actual)) {
        requestedSeconds = Math.min(total, offsets[activeIndex]
          + Math.max(0, Math.min(clip.endSeconds - clip.startSeconds, actual - clip.startSeconds)));
      }
      pendingSeek = null;
      emit();
      beginPlaying();
    }
    function setMediaPosition() {
      if (destroyed || phase !== 'loading' && phase !== 'seeking') return;
      const clip = normalized.clips[activeIndex];
      if (Number.isFinite(video.duration) && clip.endSeconds > video.duration + SEEK_EPSILON) {
        fail('保存された終了位置が元MP4の長さを超えています。編集画面で区間を修正してください。');
        return;
      }
      phase = 'seeking';
      message = '再生位置を移動中…';
      armTimer('seeking');
      const target = pendingSeek;
      try {
        if (Math.abs(video.currentTime - target) <= SEEK_EPSILON && !video.seeking) {
          ready();
        } else video.currentTime = target;
      } catch (_) {
        fail('このMP4は指定位置へシークできません。配信元のHTTP Range対応などを確認してください。');
        return;
      }
      emit();
    }
    function goTo(seconds, continuePlaying, forceReload = false) {
      if (destroyed) return;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > total) {
        throw new RangeError('仮想再生位置が範囲外です。');
      }
      revision++;
      clearTimer();
      wantsPlay = !!continuePlaying;
      error = '';
      if (seconds === total) return finish();
      const found = Edit.locateTime(normalized, seconds);
      const url = sourceMap.get(found.sourceVideoId);
      activeIndex = found.clipIndex;
      requestedSeconds = seconds;
      sourceTime = found.sourceSeconds;
      pendingSeek = found.sourceSeconds;
      const switchingSource = forceReload || url !== currentUrl;
      try { video.pause(); } catch (_) {}
      if (switchingSource) {
        currentUrl = url;
        phase = 'loading';
        message = 'MP4を読み込み中…';
        armTimer('loading');
        try {
          video.src = url;
          video.load();
        } catch (_) {
          fail('MP4を読み込めません。URLの期限や配信元を確認してください。');
          return;
        }
        emit();
      } else if (video.readyState >= 1) {
        phase = 'seeking';
        setMediaPosition();
      } else {
        phase = 'loading';
        message = 'MP4を読み込み中…';
        armTimer('loading');
        emit();
      }
    }
    function advance() {
      if (destroyed || phase !== 'ready') return;
      if (activeIndex + 1 >= normalized.clips.length) {
        finish();
      } else goTo(offsets[activeIndex + 1], wantsPlay);
    }
    function onMetadata() {
      if (destroyed || phase !== 'loading') return;
      setMediaPosition();
    }
    function onSeeked() {
      if (destroyed || phase !== 'seeking') return;
      // This event must correspond to the latest requested time.
      if (video.seeking || Math.abs(video.currentTime - pendingSeek) > SEEK_EPSILON) return;
      ready();
    }
    function onTime() {
      if (destroyed || phase !== 'ready') return;
      const clip = normalized.clips[activeIndex];
      if (!clip) return;
      const current = video.currentTime;
      if (!Number.isFinite(current)) return;
      if (current >= clip.endSeconds - END_EPSILON) {
        advance();
        return;
      }
      if (current < clip.startSeconds - SEEK_EPSILON) return;
      requestedSeconds = offsets[activeIndex] + Math.max(0, current - clip.startSeconds);
      requestedSeconds = Math.min(requestedSeconds, total);
      emit();
    }
    function onEnded() {
      if (destroyed || phase !== 'ready') return;
      const clip = normalized.clips[activeIndex];
      if (video.currentTime + SEEK_EPSILON < clip.endSeconds) {
        fail('MP4が保存された終了位置より前に終了しました。元動画を確認してください。');
        return;
      }
      advance();
    }
    function onMediaError() {
      if (destroyed || (phase !== 'loading' && phase !== 'seeking' && phase !== 'ready')) return;
      fail('MP4を再生できません。URLの期限、対応コーデック、ネットワーク接続を確認してください。');
    }
    function onWait() {
      if (destroyed || phase !== 'ready') return;
      message = '通信待ちです。読み込みが続く場合は接続先を確認してください。';
      emit();
    }
    function onPlaying() {
      if (destroyed || phase !== 'ready') return;
      message = '';
      emit();
    }
    const listeners = [
      ['loadedmetadata', onMetadata], ['seeked', onSeeked], ['timeupdate', onTime],
      ['ended', onEnded], ['error', onMediaError], ['waiting', onWait],
      ['stalled', onWait], ['playing', onPlaying],
    ];
    listeners.forEach(([name, handler]) => video.addEventListener(name, handler));
    function play() {
      if (destroyed) return;
      if (phase === 'idle' || phase === 'finished') return goTo(0, true);
      if (phase === 'error') return goTo(requestedSeconds, true, true);
      wantsPlay = true;
      if (phase === 'ready') beginPlaying();
      else emit();
    }
    function pause() {
      if (destroyed) return;
      wantsPlay = false;
      try { video.pause(); } catch (_) {}
      emit();
    }
    function seek(seconds) {
      if (destroyed) return;
      goTo(seconds, wantsPlay);
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      revision++;
      clearTimer();
      wantsPlay = false;
      listeners.forEach(([name, handler]) => video.removeEventListener(name, handler));
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
      currentUrl = '';
      activeIndex = -1;
      pendingSeek = null;
    }
    emit();
    return Object.freeze({ snapshot, play, pause, seek, destroy });
  }
  return Object.freeze({ createController });
}));
