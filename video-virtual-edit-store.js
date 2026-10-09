(function (root, factory) {
  const Edit = typeof module !== 'undefined' && module.exports
    ? require('./video-virtual-edit.js') : root.MangaReaderVideoVirtualEdit;
  const api = factory(Edit);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaReaderVideoVirtualEditStore = api;
}(typeof window !== 'undefined' ? window : globalThis, function (Edit) {
  'use strict';

  if (!Edit || typeof Edit.normalizeEdit !== 'function') throw new Error('Virtual MP4 edit model is required');
  const META_KEY = 'mangaReaderVideoMeta';
  const VIDEO_KEY = 'mangaReaderVideos';
  const PROJECTS_KEY = '__testCodeVirtualMp4ProjectsV1__';
  const SCHEMA_VERSION = 1;
  const MAX_PROJECTS = 500;
  const PROJECT_ID = /^ve-[a-zA-Z0-9_-]{8,80}$/;

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  function validateNumber(value, label, min = 0) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
      throw new TypeError('Invalid ' + label);
    }
    return value;
  }
  function validateProject(raw) {
    if (!isObject(raw) || !PROJECT_ID.test(raw.id || '')) throw new TypeError('Invalid project ID');
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 240) {
      throw new TypeError('A project title (1-240 characters) is required');
    }
    const edit = Edit.normalizeEdit(raw.edit);
    const sources = [...new Set(edit.clips.map((clip) => clip.sourceVideoId))];
    if (!Array.isArray(raw.sourceFingerprints) || raw.sourceFingerprints.length !== sources.length) {
      throw new TypeError('Source fingerprint metadata is incomplete');
    }
    const fingerprints = raw.sourceFingerprints.map((entry) => {
      if (!isObject(entry) || !sources.includes(entry.sourceVideoId)
        || typeof entry.fingerprint !== 'string' || !/^[0-9a-f]{16}-\d+$/.test(entry.fingerprint)) {
        throw new TypeError('Invalid source fingerprint');
      }
      return { sourceVideoId: entry.sourceVideoId, fingerprint: entry.fingerprint };
    });
    if (new Set(fingerprints.map((entry) => entry.sourceVideoId)).size !== sources.length) {
      throw new TypeError('Duplicate source fingerprint');
    }
    return {
      id: raw.id,
      title: raw.title.trim(),
      edit,
      sourceFingerprints: fingerprints,
      createdAt: validateNumber(raw.createdAt, 'createdAt'),
      updatedAt: validateNumber(raw.updatedAt, 'updatedAt'),
      revision: validateNumber(raw.revision, 'project revision', 1),
    };
  }
  function normalizeRegistry(value) {
    if (value == null) return { schemaVersion: SCHEMA_VERSION, revision: 0, projects: [] };
    if (!isObject(value) || value.schemaVersion !== SCHEMA_VERSION || !Array.isArray(value.projects)
      || value.projects.length > MAX_PROJECTS) throw new TypeError('Unsupported virtual edit registry');
    const projects = value.projects.map(validateProject);
    if (new Set(projects.map((project) => project.id)).size !== projects.length) {
      throw new TypeError('Duplicate project ID');
    }
    return { schemaVersion: SCHEMA_VERSION, revision: validateNumber(value.revision, 'registry revision'), projects };
  }

  // Detect URL replacement without duplicating signed MP4 URLs in project metadata.
  // Fingerprints are for accidental source changes, NOT cryptographic integrity.
  function sourceFingerprint(url) {
    if (typeof url !== 'string') throw new TypeError('Source URL is required');
    let first = 2166136261, second = 5381;
    for (let i = 0; i < url.length; i += 1) {
      const code = url.charCodeAt(i);
      first = Math.imul(first ^ code, 16777619);
      second = (Math.imul(second, 33) ^ code) >>> 0;
    }
    return (first >>> 0).toString(16).padStart(8, '0')
      + (second >>> 0).toString(16).padStart(8, '0') + '-' + url.length;
  }

  function effectiveSources(videos, meta) {
    if (!Array.isArray(videos)) throw new TypeError('Registered videos are unavailable');
    return videos.map((video) => {
      const id = video && String(video.id == null ? '' : video.id);
      const override = isObject(meta[id]) ? meta[id] : {};
      const url = typeof override.url === 'string' ? override.url : video && video.url;
      return { id, url };
    });
  }
  function diagnose(project, videos) {
    const sourceMap = new Map(videos.map((video) => [video.id, video.url]));
    const missingSourceIds = [], nonMp4SourceIds = [], changedSourceIds = [];
    for (const entry of project.sourceFingerprints) {
      const url = sourceMap.get(entry.sourceVideoId);
      if (url == null) missingSourceIds.push(entry.sourceVideoId);
      else if (!Edit.isMp4Url(url)) nonMp4SourceIds.push(entry.sourceVideoId);
      else if (sourceFingerprint(url) !== entry.fingerprint) changedSourceIds.push(entry.sourceVideoId);
    }
    return {
      usable: !missingSourceIds.length && !nonMp4SourceIds.length && !changedSourceIds.length,
      missingSourceIds, nonMp4SourceIds, changedSourceIds,
    };
  }

  function createRepository(options = {}) {
    const storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const canAccess = options.canAccess || (() =>
      typeof window !== 'undefined' && !!window.MangaReaderMediaAccess
      && window.MangaReaderMediaAccess.canReadProtectedData() === true);
    const now = options.now || Date.now;
    const generateId = options.generateId || (() => {
      if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== 'function') {
        throw new Error('A secure project ID generator is required');
      }
      return 've-' + globalThis.crypto.randomUUID();
    });
    const sync = options.sync || (async () => {
      if (typeof window === 'undefined' || !window.MangaVault || !window.MangaVaultPayload
        || !window.MangaVault.loadActive || !window.MangaVault.loadActive()) return false;
      await window.MangaVault.savePayload(window.MangaVaultPayload.buildFromLocalStorage());
      return true;
    });

    function requireAccess() {
      if (canAccess() !== true) {
        throw new Error('VPN接続の確認が必要です。仮想編集の読み書きを停止しました。');
      }
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        throw new Error('Protected storage is unavailable');
      }
    }
    function readJson(key, fallback) {
      requireAccess();
      const raw = storage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw); // Reject corrupt storage rather than overwriting it.
    }
    function readState() {
      const meta = readJson(META_KEY, {});
      if (!isObject(meta)) throw new TypeError('Invalid video metadata store');
      const videos = readJson(VIDEO_KEY, []);
      return { meta, videos, registry: normalizeRegistry(meta[PROJECTS_KEY]) };
    }
    async function persist(meta, registry) {
      requireAccess();
      // Re-read before writing to avoid overwriting unrelated video metadata
      // updated while the caller was preparing the project.
      const latest = readJson(META_KEY, {});
      if (!isObject(latest)) throw new TypeError('Invalid video metadata store');
      const latestRegistry = normalizeRegistry(latest[PROJECTS_KEY]);
      if (latestRegistry.revision !== registry.revision - 1) {
        const error = new Error('編集内容が別の操作で更新されています。再読み込みしてください。');
        error.code = 'VIRTUAL_EDIT_CONFLICT';
        throw error;
      }
      const output = { ...latest, [PROJECTS_KEY]: registry };
      storage.setItem(META_KEY, JSON.stringify(output));
      try {
        requireAccess();
        return await sync();
      } catch (cause) {
        const error = new Error('端末には保存しましたが、保管庫同期に失敗しました。');
        error.code = 'VIRTUAL_EDIT_SYNC_FAILED';
        error.localSaved = true;
        error.cause = cause;
        throw error;
      }
    }
    function list() {
      return readState().registry.projects;
    }
    function get(projectId) {
      return list().find((project) => project.id === projectId) || null;
    }
    function inspect(projectId) {
      const state = readState();
      const project = state.registry.projects.find((entry) => entry.id === projectId);
      if (!project) return null;
      return diagnose(project, effectiveSources(state.videos, state.meta));
    }
    async function save({ id, title, edit, expectedRevision } = {}) {
      const state = readState();
      const existing = id ? state.registry.projects.find((item) => item.id === id) : null;
      if (id && !existing) throw new Error('編集プロジェクトが見つかりません。');
      if (existing && (typeof expectedRevision !== 'number' || expectedRevision !== existing.revision)) {
        const error = new Error('編集内容が古いため更新できません。再読み込みしてください。');
        error.code = 'VIRTUAL_EDIT_CONFLICT';
        throw error;
      }
      if (!existing && state.registry.projects.length >= MAX_PROJECTS) throw new RangeError('Too many virtual edits');
      if (existing && !diagnose(existing, effectiveSources(state.videos, state.meta)).usable) {
        throw new Error('元動画のURLが変更・削除されています。編集プロジェクトを更新できません。');
      }
      const normalizedEdit = Edit.validateSources(edit, effectiveSources(state.videos, state.meta));
      const byId = new Map(effectiveSources(state.videos, state.meta).map((video) => [video.id, video.url]));
      const sourceFingerprints = [...new Set(normalizedEdit.clips.map((clip) => clip.sourceVideoId))]
        .map((sourceVideoId) => ({ sourceVideoId, fingerprint: sourceFingerprint(byId.get(sourceVideoId)) }));
      const timestamp = validateNumber(now(), 'timestamp');
      const project = validateProject({
        id: existing ? existing.id : generateId(),
        title, edit: normalizedEdit, sourceFingerprints,
        createdAt: existing ? existing.createdAt : timestamp,
        updatedAt: timestamp, revision: existing ? existing.revision + 1 : 1,
      });
      if (!existing && state.registry.projects.some((entry) => entry.id === project.id)) {
        throw new Error('Duplicate project ID');
      }
      const projects = existing
        ? state.registry.projects.map((entry) => entry.id === existing.id ? project : entry)
        : [...state.registry.projects, project];
      const synced = await persist(state.meta, { schemaVersion: SCHEMA_VERSION, revision: state.registry.revision + 1, projects });
      return { project, localSaved: true, synced: synced === true };
    }
    async function remove(id, expectedRevision) {
      const state = readState();
      const existing = state.registry.projects.find((entry) => entry.id === id);
      if (!existing) return false;
      if (typeof expectedRevision !== 'number' || expectedRevision !== existing.revision) {
        const error = new Error('編集内容が古いため削除できません。再読み込みしてください。');
        error.code = 'VIRTUAL_EDIT_CONFLICT';
        throw error;
      }
      await persist(state.meta, {
        schemaVersion: SCHEMA_VERSION, revision: state.registry.revision + 1,
        projects: state.registry.projects.filter((entry) => entry.id !== id),
      });
      return true;
    }
    return Object.freeze({ list, get, inspect, save, remove });
  }

  return Object.freeze({
    META_KEY, VIDEO_KEY, PROJECTS_KEY, SCHEMA_VERSION,
    normalizeRegistry, sourceFingerprint, createRepository,
  });
}));
