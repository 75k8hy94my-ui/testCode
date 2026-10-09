(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoVirtualEdit = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // An edit is an ordered list of time ranges from existing MP4 links.
  // Neither this module nor its data format reads, transforms or uploads media bytes.
  const EDIT_TYPE = 'virtual-mp4-edit';
  const SCHEMA_VERSION = 1;
  const MAX_CLIPS = 200;

  function isMp4Url(value) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value.trim());
      return (url.protocol === 'http:' || url.protocol === 'https:') && /\.mp4$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function normalizeClip(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Invalid clip');
    const sourceVideoId = typeof raw.sourceVideoId === 'string' ? raw.sourceVideoId.trim() : '';
    const startSeconds = raw.startSeconds;
    const endSeconds = raw.endSeconds;
    if (!sourceVideoId || sourceVideoId.length > 256) throw new TypeError('A source video ID is required');
    if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds) || startSeconds < 0) {
      throw new RangeError('Clip start must be a non-negative finite number');
    }
    if (typeof endSeconds !== 'number' || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
      throw new RangeError('Clip end must be greater than clip start');
    }
    return { sourceVideoId, startSeconds, endSeconds };
  }

  function createEdit(clips) {
    if (!Array.isArray(clips) || clips.length === 0 || clips.length > MAX_CLIPS) {
      throw new RangeError('An edit must have 1 to ' + MAX_CLIPS + ' clips');
    }
    return { type: EDIT_TYPE, version: SCHEMA_VERSION, clips: clips.map(normalizeClip) };
  }

  function normalizeEdit(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || raw.type !== EDIT_TYPE || raw.version !== SCHEMA_VERSION) {
      throw new TypeError('Unsupported virtual MP4 edit schema');
    }
    return createEdit(raw.clips);
  }

  // Source videos live in the existing mangaReaderVideos collection. The edit
  // keeps only IDs, avoiding duplicate URLs and retaining the original records.
  // Validate against current sources before saving or playing an edit.
  function validateSources(edit, sourceVideos) {
    const normalized = normalizeEdit(edit);
    if (!Array.isArray(sourceVideos)) throw new TypeError('Video collection is required');
    const sources = new Map(sourceVideos.map((video) => [
      video && String(video.id == null ? '' : video.id),
      video && video.url,
    ]));
    normalized.clips.forEach((clip) => {
      if (!sources.has(clip.sourceVideoId) || !isMp4Url(sources.get(clip.sourceVideoId))) {
        throw new TypeError('Clip source is missing or is not a direct MP4 URL: ' + clip.sourceVideoId);
      }
    });
    return normalized;
  }

  function checkedIndex(index, length) {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new RangeError('Clip index is out of bounds');
    }
    return index;
  }

  function splitClip(edit, index, sourceSeconds) {
    const value = normalizeEdit(edit);
    const clip = value.clips[checkedIndex(index, value.clips.length)];
    if (typeof sourceSeconds !== 'number' || !Number.isFinite(sourceSeconds)
      || sourceSeconds <= clip.startSeconds || sourceSeconds >= clip.endSeconds) {
      throw new RangeError('Split point must be strictly inside the source range');
    }
    const result = value.clips.slice();
    result.splice(index, 1,
      { ...clip, endSeconds: sourceSeconds },
      { ...clip, startSeconds: sourceSeconds });
    return createEdit(result);
  }

  function joinEdits(first, second) {
    const a = normalizeEdit(first);
    const b = normalizeEdit(second);
    return createEdit([...a.clips, ...b.clips]);
  }

  function trimClip(edit, index, startSeconds, endSeconds) {
    const value = normalizeEdit(edit);
    const clip = value.clips[checkedIndex(index, value.clips.length)];
    if (typeof startSeconds !== 'number' || typeof endSeconds !== 'number'
      || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)
      || startSeconds < clip.startSeconds || endSeconds > clip.endSeconds || endSeconds <= startSeconds) {
      throw new RangeError('Trim range must stay inside the original clip');
    }
    const result = value.clips.slice();
    result[index] = { ...clip, startSeconds, endSeconds };
    return createEdit(result);
  }

  function moveClip(edit, from, to) {
    const value = normalizeEdit(edit);
    checkedIndex(from, value.clips.length);
    checkedIndex(to, value.clips.length);
    const result = value.clips.slice();
    result.splice(to, 0, result.splice(from, 1)[0]);
    return createEdit(result);
  }

  function removeClip(edit, index) {
    const value = normalizeEdit(edit);
    checkedIndex(index, value.clips.length);
    const result = value.clips.slice();
    result.splice(index, 1);
    return createEdit(result);
  }

  function totalDuration(edit) {
    return normalizeEdit(edit).clips.reduce((sum, clip) => sum + (clip.endSeconds - clip.startSeconds), 0);
  }

  // Timeline seeks use seconds in the virtual edit, not the original media.
  // At an exact boundary the next clip wins; past the end returns null.
  function locateTime(edit, timelineSeconds) {
    const value = normalizeEdit(edit);
    if (typeof timelineSeconds !== 'number' || !Number.isFinite(timelineSeconds) || timelineSeconds < 0) return null;
    let elapsed = 0;
    for (let index = 0; index < value.clips.length; index += 1) {
      const clip = value.clips[index];
      const duration = clip.endSeconds - clip.startSeconds;
      if (timelineSeconds < elapsed + duration) {
        return { clipIndex: index, sourceVideoId: clip.sourceVideoId,
          sourceSeconds: clip.startSeconds + (timelineSeconds - elapsed) };
      }
      elapsed += duration;
    }
    return null;
  }

  return Object.freeze({
    EDIT_TYPE, SCHEMA_VERSION, MAX_CLIPS, isMp4Url, createEdit, normalizeEdit,
    validateSources, splitClip, joinEdits, trimClip, moveClip, removeClip,
    totalDuration, locateTime,
  });
}));
