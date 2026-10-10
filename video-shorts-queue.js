(function (root, factory) {
  const videoData = (root && root.MangaReaderVideoData)
    || (typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./video-data.js') : null);
  const api = factory(videoData);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoShortsQueue = api;
}(typeof window !== 'undefined' ? window : globalThis, function (VideoData) {
  'use strict';

  const MAX_SHORT_SECONDS = 30;
  const LONG_VIDEO_SECONDS = 25 * 60;
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const time = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  function randomValue(random) {
    const value = Number(random());
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1 - Number.EPSILON, value));
  }

  function createEntry(video, startSeconds, endSeconds, entryType, tier, generation, random) {
    return {
      videoId: String(video.id),
      startSeconds,
      endSeconds,
      entryType,
      tier,
      generation,
      _randomOrder: randomValue(random),
      _liked: video.shorts && video.shorts.liked === true,
      _playCount: Math.max(0, Math.trunc(Number(video.shorts && video.shorts.playCount) || 0)),
      _earlySwipeCount: Math.max(0, Math.trunc(Number(video.shorts && video.shorts.earlySwipeCount) || 0)),
    };
  }

  function randomClip(video, tier, generation, random) {
    const duration = time(video.durationSeconds);
    if (duration == null || duration <= 0) return null;
    const start = duration < MAX_SHORT_SECONDS ? 0 : randomValue(random) * (duration - MAX_SHORT_SECONDS);
    const end = duration < MAX_SHORT_SECONDS ? duration : start + MAX_SHORT_SECONDS;
    return createEntry(video, start, end, 'random-short', tier, generation, random);
  }

  function markerClips(video, markers, generation, random) {
    const duration = time(video.durationSeconds);
    if (duration == null || duration <= 0 || !Array.isArray(markers)) return [];
    const seconds = markers.map((marker) => time(isObject(marker) ? marker.seconds : marker))
      .filter((value) => value != null && value < duration)
      .sort((a, b) => a - b);
    const entries = [];
    let index = 0;
    while (index < seconds.length) {
      const start = seconds[index];
      let lastGrouped = start;
      let next = index + 1;
      while (next < seconds.length && seconds[next] - start < MAX_SHORT_SECONDS) {
        lastGrouped = seconds[next];
        next += 1;
      }
      const end = Math.min(duration, next === index + 1 ? start + MAX_SHORT_SECONDS : lastGrouped + 10);
      entries.push(createEntry(video, start, end, 'marker', 1, generation, random));
      const ignoredThrough = end + 10;
      while (next < seconds.length && seconds[next] <= ignoredThrough) next += 1;
      index = next;
    }
    return entries;
  }

  function compareShortEntries(a, b) {
    if (a._liked !== b._liked) return a._liked ? -1 : 1;
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 1) {
      const aLowCount = a._playCount <= 10;
      const bLowCount = b._playCount <= 10;
      if (aLowCount !== bLowCount) return aLowCount ? -1 : 1;
    }
    if (a._earlySwipeCount !== b._earlySwipeCount) return a._earlySwipeCount - b._earlySwipeCount;
    return a._randomOrder - b._randomOrder;
  }

  function compareOverflowEntries(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a._liked !== b._liked) return a._liked ? -1 : 1;
    if (a._earlySwipeCount !== b._earlySwipeCount) return a._earlySwipeCount - b._earlySwipeCount;
    return a._randomOrder - b._randomOrder;
  }

  function generate(videos, options = {}) {
    const settings = options && typeof options === 'object' ? options : {};
    const random = typeof settings.random === 'function' ? settings.random : Math.random;
    const generation = Number.isSafeInteger(settings.generation) && settings.generation >= 0 ? settings.generation : 0;
    const markersByVideo = isObject(settings.markersByVideo) ? settings.markersByVideo : {};
    const shortEntries = [];
    const landscapeEntries = [];
    const longEntries = [];

    (Array.isArray(videos) ? videos : []).forEach((video) => {
      if (!isObject(video) || video.id == null) return;
      const sourceUrl = String(video.url || (VideoData && typeof VideoData.legacyUrl === 'function' ? VideoData.legacyUrl(video.a, video.b) : ''));
      if (!VideoData || typeof VideoData.isDirectVideoUrl !== 'function' || !VideoData.isDirectVideoUrl(sourceUrl)) return;
      const duration = time(video.durationSeconds);
      if (duration == null || duration <= 0) return;
      const markers = markersByVideo[String(video.id)];
      const hasValidMarkers = Array.isArray(markers) && markers.some((marker) => {
        const value = time(isObject(marker) ? marker.seconds : marker);
        return value != null && value < duration;
      });

      if (duration >= LONG_VIDEO_SECONDS) {
        longEntries.push(createEntry(video, 0, duration, 'overflow-long', 5, generation, random));
        return;
      }
      if (hasValidMarkers) {
        shortEntries.push(...markerClips(video, markers, generation, random));
        return;
      }

      const dimensions = typeof VideoData.getDisplayDimensions === 'function'
        ? VideoData.getDisplayDimensions(video)
        : { width: time(video.videoWidth), height: time(video.videoHeight) };
      const width = time(dimensions && dimensions.width);
      const height = time(dimensions && dimensions.height);
      if (width == null || height == null || width <= 0 || height <= 0) return;
      if (height > width) {
        const tags = Array.isArray(video.tags) ? video.tags.filter((tag) => String(tag || '').trim()) : [];
        const title = String(video.title || '').trim();
        const tier = tags.length ? 1 : (title ? 2 : 3);
        const entry = randomClip(video, tier, generation, random);
        if (entry) shortEntries.push(entry);
        return;
      }
      landscapeEntries.push(createEntry(video, 0, duration, 'overflow-landscape', 4, generation, random));
    });

    const entries = shortEntries.sort(compareShortEntries)
      .concat(landscapeEntries.sort(compareOverflowEntries), longEntries.sort(compareOverflowEntries));
    return entries.map(({ _randomOrder, _liked, _playCount, _earlySwipeCount, ...entry }) => entry);
  }

  return Object.freeze({ MAX_SHORT_SECONDS, LONG_VIDEO_SECONDS, generate });
}));
