(function (root, factory) {
  const Edit = typeof module !== 'undefined' && module.exports
    ? require('./video-virtual-edit.js') : root.MangaReaderVideoVirtualEdit;
  const Store = typeof module !== 'undefined' && module.exports
    ? require('./video-virtual-edit-store.js') : root.MangaReaderVideoVirtualEditStore;
  const api = factory(Edit, Store);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoVirtualPublish = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Edit, Store) {
  'use strict';
  const VIDEO_KEY = 'mangaReaderVideos';
  const META_KEY = 'mangaReaderVideoMeta';
  const FIELD = 'virtualPublishedEdit';
  const VERSION = 1;
  const MAX_PUBLICATIONS = 200;
  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const titleText = (value) => String(value == null ? '' : value).trim().slice(0, 240);

  function validatePublication(raw) {
    if (!isObject(raw) || raw.version !== VERSION || !['new','split','overwrite'].includes(raw.kind)) {
      throw new TypeError('Unsupported published virtual video');
    }
    const edit = Edit.normalizeEdit(raw.edit);
    const sourceIds = [...new Set(edit.clips.map((clip) => clip.sourceVideoId))];
    if (!Array.isArray(raw.fingerprints) || raw.fingerprints.length !== sourceIds.length) {
      throw new TypeError('Missing published video source fingerprints');
    }
    const entries = new Map();
    for (const entry of raw.fingerprints) {
      if (!isObject(entry) || !sourceIds.includes(entry.sourceVideoId) || entries.has(entry.sourceVideoId)
          || typeof entry.fingerprint !== 'string' || !/^[0-9a-f]{16}-\d+$/.test(entry.fingerprint)) {
        throw new TypeError('Invalid source fingerprint');
      }
      entries.set(entry.sourceVideoId, entry.fingerprint);
    }
    return { version: VERSION, kind: raw.kind, edit, fingerprints: [...entries].map(([sourceVideoId, fingerprint]) => ({ sourceVideoId, fingerprint })),
      publishedAt: Number.isSafeInteger(raw.publishedAt) ? raw.publishedAt : 0 };
  }

  function effectiveSources(videos, meta) {
    return videos.map((video) => {
      const override = isObject(meta[video.id]) ? meta[video.id] : {};
      return { id: String(video.id), url: typeof override.url === 'string' ? override.url : video.url,
        title: titleText(override.title || video.title) };
    });
  }

  function readPublication(meta, videoId) {
    const entry = meta && meta[String(videoId)];
    if (!isObject(entry) || !isObject(entry[FIELD])) return null;
    return validatePublication(entry[FIELD]);
  }

  function verifyPublication(publication, videos, meta) {
    const entry = validatePublication(publication);
    const sources = effectiveSources(videos, meta);
    Edit.validateSources(entry.edit, sources);
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    for (const item of entry.fingerprints) {
      if (Store.sourceFingerprint(sourceById.get(item.sourceVideoId).url) !== item.fingerprint) {
        throw new Error('元動画のURLが変更されています。編集版を安全に再生できません。');
      }
    }
    return entry;
  }

  function createPublisher(options = {}) {
    const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const canAccess = options.canAccess || (() => typeof window !== 'undefined'
      && !!window.MangaReaderMediaAccess && window.MangaReaderMediaAccess.canReadProtectedData() === true);
    const isGuest = options.isGuest || (() => typeof window !== 'undefined'
      && !!window.TestCodeGuest && window.TestCodeGuest.isActive() === true);
    const markPending = options.markPending || (() => {
      if (isGuest()) return true;
      const vault = typeof window !== 'undefined' && window.MangaVault;
      if (!vault || !vault.loadSession?.()?.user?.id) return true;
      return typeof vault.markLocalChangesPending === 'function' && vault.markLocalChangesPending() === true;
    });
    const sync = options.sync || (async () => {
      if (isGuest()) return true;
      const vault = typeof window !== 'undefined' && window.MangaVault;
      if (!vault || !vault.loadActive?.() || typeof vault.saveLocalChanges !== 'function') return false;
      await vault.saveLocalChanges();
      return true;
    });
    const now = options.now || Date.now;
    const idFactory = options.generateId || (() => {
      if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== 'function') {
        throw new Error('安全な動画IDを作成できません。');
      }
      return 'v-' + globalThis.crypto.randomUUID();
    });
    const routeBase = options.routeBase || (typeof location !== 'undefined' ? location.href : '');
    function requireAccess() {
      if (!canAccess() || !storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        throw new Error('動画の保存には保管庫へのアクセスが必要です。');
      }
    }
    function readState() {
      requireAccess();
      const videoRaw = storage.getItem(VIDEO_KEY), metaRaw = storage.getItem(META_KEY);
      const videos = videoRaw == null ? [] : JSON.parse(videoRaw);
      const meta = metaRaw == null ? {} : JSON.parse(metaRaw);
      if (!Array.isArray(videos) || !isObject(meta)) throw new TypeError('動画一覧のデータが不正です。');
      return { videos, meta, videoRaw, metaRaw };
    }
    function listOverwriteTargets() {
      const { videos, meta } = readState();
      return effectiveSources(videos, meta).filter((source) => {
        const base = videos.find((video) => String(video.id) === source.id);
        // Existing videos need not themselves be MP4s: only the edit sources do.
        // A previously published virtual item is also valid if its snapshot survives.
        return base && typeof base.url === 'string' && /^https?:\/\//i.test(base.url)
          && (Edit.isMp4Url(base.url) || !/video-virtual-player\.html\?video=/.test(base.url)
            || !!readPublication(meta, source.id));
      }).map(({ id, title }) => ({ id, title: title || id }));
    }
    function get(videoId) {
      const { videos, meta } = readState();
      if (!videos.some((video) => String(video.id) === String(videoId))) return null;
      return readPublication(meta, videoId);
    }
    function inspect(videoId) {
      const { videos, meta } = readState();
      const publication = readPublication(meta, videoId);
      if (!publication) return null;
      return verifyPublication(publication, videos, meta);
    }
    function commit(state, nextVideos, nextMeta) {
      // Mark before data writes: never produce a local revision that looks synced.
      requireAccess();
      if (!markPending()) throw new Error('保管庫の未同期マーカーを記録できません。何も変更していません。');
      // A different tab may have changed the local collection since the preview.
      if (storage.getItem(VIDEO_KEY) !== state.videoRaw || storage.getItem(META_KEY) !== state.metaRaw) {
        throw new Error('別の画面で動画情報が変更されました。再読み込みしてやり直してください。');
      }
      try {
        storage.setItem(VIDEO_KEY, JSON.stringify(nextVideos));
        storage.setItem(META_KEY, JSON.stringify(nextMeta));
      } catch (error) {
        try {
          state.videoRaw == null ? storage.removeItem(VIDEO_KEY) : storage.setItem(VIDEO_KEY, state.videoRaw);
          state.metaRaw == null ? storage.removeItem(META_KEY) : storage.setItem(META_KEY, state.metaRaw);
        } catch (_) {}
        throw error;
      }
    }
    async function finish(ids) {
      try {
        const synced = await sync();
        return { ids, count: ids.length, localSaved: true, synced: synced === true };
      } catch (error) {
        return { ids, count: ids.length, localSaved: true, synced: false, syncError: String(error && error.message || 'クラウド同期失敗') };
      }
    }
    async function publish({ mode, edit, title, targetId } = {}) {
      if (!['new','split','overwrite'].includes(mode)) throw new Error('保存方法を選択してください。');
      const state = readState(), { videos, meta } = state;
      const sourceList = effectiveSources(videos, meta);
      const normalized = Edit.validateSources(edit, sourceList);
      const caption = titleText(title) || '編集済み動画';
      const clips = mode === 'split' ? normalized.clips.map((clip) => Edit.createEdit([clip])) : [normalized];
      if (clips.length > MAX_PUBLICATIONS) throw new RangeError('一度に保存できる動画数を超えています。');
      const publishedAt = now();
      if (!Number.isSafeInteger(publishedAt) || publishedAt < 0) throw new TypeError('Invalid publication timestamp');
      const sourceById = new Map(sourceList.map((source) => [source.id, source.url]));
      const nextVideos = videos.slice(), nextMeta = { ...meta }, ids = [];
      if (mode === 'overwrite') {
        const id = String(targetId || '');
        const original = videos.find((video) => String(video.id) === id);
        if (!original || !listOverwriteTargets().some((item) => item.id === id)) {
          throw new Error('動画一覧に存在する上書き可能な動画を指定してください。');
        }
        ids.push(id);
      } else if (!routeBase || !/^https?:/.test(new URL(routeBase).protocol)) {
        throw new Error('動画一覧への登録URLを作成できません。');
      }
      for (let index = 0; index < clips.length; index++) {
        const current = clips[index], id = mode === 'overwrite' ? ids[0] : idFactory();
        if (mode !== 'overwrite') {
          if (nextVideos.some((video) => String(video.id) === id)) throw new Error('動画IDが重複しています。');
          ids.push(id);
          const label = mode === 'split' ? caption.slice(0, 210) + '（分割' + (index + 1) + '／' + clips.length + '）' : caption;
          const sourceVideo = videos.find((v) => String(v.id) === current.clips[0].sourceVideoId);
          // Unique ?video= IDs prevent identical-source clips from being merged by URL migration.
          const url = new URL('video-virtual-player.html?video=' + encodeURIComponent(id), routeBase).href;
          nextVideos.unshift({ id, title: label, url, a: '', b: '', addedAt: publishedAt + index, updatedAt: publishedAt });
          // Carry the original thumbnail when provided, while leaving all source records untouched.
          nextMeta[id] = { ...(sourceVideo && isObject(meta[sourceVideo.id]) && meta[sourceVideo.id].thumbnailUrl
            ? { thumbnailUrl: meta[sourceVideo.id].thumbnailUrl } : {}), durationSeconds: Edit.totalDuration(current) };
        }
        const fingerprintIds = [...new Set(current.clips.map((clip) => clip.sourceVideoId))];
        const publication = {
          version: VERSION, kind: mode, edit: current,
          fingerprints: fingerprintIds.map((sourceVideoId) =>
            ({ sourceVideoId, fingerprint: Store.sourceFingerprint(sourceById.get(sourceVideoId)) })),
          publishedAt,
        };
        const oldMeta = isObject(nextMeta[id]) ? nextMeta[id] : {};
        // When overwriting an already published virtual item, retain its previous
        // playable snapshot: the synthetic URL is not a raw MP4 fallback.
        const previous = mode === 'overwrite'
          ? (oldMeta.virtualPublishedPrevious || (
            isObject(oldMeta[FIELD]) && oldMeta[FIELD].kind !== 'overwrite' ? oldMeta[FIELD] : null))
          : null;
        nextMeta[id] = {
          ...oldMeta, [FIELD]: publication,
          ...(mode === 'overwrite' ? { virtualPublishedPrevious: previous } : {}),
          updatedAt: publishedAt,
        };
      }
      commit(state, nextVideos, nextMeta);
      return finish(ids);
    }
    async function restore(videoId) {
      const state = readState(), id = String(videoId || '');
      const original = state.videos.find((video) => String(video.id) === id);
      const publication = readPublication(state.meta, id);
      if (!original || !publication || publication.kind !== 'overwrite') {
        throw new Error('元動画に戻せる上書き編集が見つかりません。');
      }
      const previous = isObject(state.meta[id]) && isObject(state.meta[id].virtualPublishedPrevious)
        ? validatePublication(state.meta[id].virtualPublishedPrevious) : null;
      if (!previous && /video-virtual-player\.html\?video=/.test(original.url)) {
        throw new Error('元に戻すための編集版が見つかりません。上書き前のデータを確認してください。');
      }
      const nextMeta = {
        ...state.meta,
        [id]: {
          ...(state.meta[id] || {}), [FIELD]: previous,
          virtualPublishedPrevious: null, updatedAt: now(),
        },
      };
      commit(state, state.videos, nextMeta);
      return finish([id]);
    }
    return Object.freeze({ publish, restore, get, inspect, listOverwriteTargets });
  }

  return Object.freeze({ VIDEO_KEY, META_KEY, FIELD, VERSION, validatePublication, verifyPublication, readPublication, createPublisher });
}));