((root, factory) => {
  const payloadApi = root && root.MangaVaultPayload;
  const api = factory(payloadApi);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaVaultHistory = api;
})(typeof window !== 'undefined' ? window : globalThis, (initialPayloadApi) => {
  'use strict';

  const ENTITY_COLLECTIONS = new Set(['folders', 'items', 'videos', 'videoFolders']);
  const ENTITY_MAPS = ['mangaInfo', 'toc', 'lastPages', 'videoMeta', 'videoMarkers', 'videoPropertyValues'];
  const ENTITY_MAP_OWNERS = new Map([
    ['mangaInfo', 'items'], ['toc', 'items'], ['lastPages', 'items'],
    ['videoMeta', 'videos'], ['videoMarkers', 'videos'], ['videoPropertyValues', 'videos'],
  ]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const escapePointer = (value) => String(value).replace(/~/g, '~0').replace(/\//g, '~1');
  const unescapePointer = (value) => value.replace(/~1/g, '/').replace(/~0/g, '~');
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const normalizePayload = (value, normalize) => {
    const normalizeFn = normalize || initialPayloadApi?.normalize || (typeof window !== 'undefined' && window.MangaVaultPayload?.normalize);
    return clone(typeof normalizeFn === 'function' ? normalizeFn(value) : (value || {}));
  };

  function diffVaultSnapshots(before, after, normalize) {
    const left = normalizePayload(before, normalize);
    const right = normalizePayload(after, normalize);
    const changes = [];
    const walk = (a, b, path) => {
      if (same(a, b)) return;
      if (Array.isArray(a) && Array.isArray(b) && a.every((item) => isRecord(item) && typeof item.id === 'string')
          && b.every((item) => isRecord(item) && typeof item.id === 'string')) {
        const oldById = new Map(a.map((item) => [item.id, item]));
        const newById = new Map(b.map((item) => [item.id, item]));
        for (const id of new Set([...oldById.keys(), ...newById.keys()])) {
          const itemPath = path + '/' + escapePointer(id);
          if (!oldById.has(id)) changes.push({ type: 'add', path: itemPath, after: clone(newById.get(id)) });
          else if (!newById.has(id)) changes.push({ type: 'delete', path: itemPath, before: clone(oldById.get(id)) });
          else walk(oldById.get(id), newById.get(id), itemPath);
        }
        return;
      }
      if (isRecord(a) && isRecord(b)) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const childPath = path + '/' + escapePointer(key);
          if (!Object.hasOwn(a, key)) changes.push({ type: 'add', path: childPath, after: clone(b[key]) });
          else if (!Object.hasOwn(b, key)) changes.push({ type: 'delete', path: childPath, before: clone(a[key]) });
          else walk(a[key], b[key], childPath);
        }
        return;
      }
      changes.push({ type: 'change', path: path || '/', before: clone(a), after: clone(b) });
    };
    walk(left, right, '');
    return changes.sort((a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type));
  }

  function parseTombstone(pointer) {
    if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.length < 2) {
      throw new Error('削除履歴を安全に復元できないため、処理を停止しました。');
    }
    return pointer.slice(1).split('/').map(unescapePointer);
  }

  function remapEntityReferences(payload, idMap) {
    const mapped = (collection, id) => idMap.get(collection + ':' + id) || id;
    for (const collection of ENTITY_COLLECTIONS) {
      for (const entity of Array.isArray(payload[collection]) ? payload[collection] : []) {
        if (typeof entity.id === 'string') entity.id = mapped(collection, entity.id);
      }
    }
    for (const entity of Array.isArray(payload.items) ? payload.items : []) {
      if (typeof entity.folderId === 'string') entity.folderId = mapped('folders', entity.folderId);
    }
    for (const entity of Array.isArray(payload.videos) ? payload.videos : []) {
      if (typeof entity.folderId === 'string') entity.folderId = mapped('videoFolders', entity.folderId);
    }
    for (const key of ENTITY_MAPS) {
      const source = payload[key];
      if (!isRecord(source)) continue;
      const next = {};
      for (const [id, value] of Object.entries(source)) {
        const collection = key === 'mangaInfo' || key === 'toc' || key === 'lastPages' ? 'items' : 'videos';
        const nextId = mapped(collection, id);
        if (Object.hasOwn(next, nextId)) throw new Error('削除履歴を安全に復元できないため、処理を停止しました。');
        next[nextId] = value;
      }
      payload[key] = next;
    }
    for (const [id, meta] of Object.entries(isRecord(payload.videoMeta) ? payload.videoMeta : {})) {
      if (isRecord(meta) && typeof meta.folderId === 'string') meta.folderId = mapped('videoFolders', meta.folderId);
    }
    const shorts = payload.videoShortsState;
    if (isRecord(shorts)) {
      if (Array.isArray(shorts.queue)) shorts.queue.forEach((entry) => {
        if (isRecord(entry) && typeof entry.videoId === 'string') entry.videoId = mapped('videos', entry.videoId);
      });
      if (Array.isArray(shorts.knownVideoIds)) shorts.knownVideoIds = shorts.knownVideoIds.map((id) => mapped('videos', id));
    }
  }

  function mergeMonotonicCounters(target, current) {
    if (Array.isArray(target) && Array.isArray(current)) {
      const currentById = new Map(current.filter(isRecord).map((item) => [item.id, item]));
      target.forEach((item, index) => mergeMonotonicCounters(item, currentById.get(item?.id) || current[index]));
      return;
    }
    if (!isRecord(target) || !isRecord(current)) return;
    for (const [key, value] of Object.entries(current)) {
      if (Object.hasOwn(target, key)) continue;
      if (key.endsWith('ByClient') && isRecord(value)) {
        target[key] = Object.fromEntries(Object.entries(value).filter(([, count]) => Number.isSafeInteger(count) && count >= 0));
      } else if (/^(?:.*Count|.*Base|revision|generation)$/.test(key) && Number.isSafeInteger(value) && value >= 0) {
        target[key] = value;
      }
    }
    for (const [key, value] of Object.entries(target)) {
      const currentValue = current[key];
      if (key.endsWith('ByClient') && isRecord(value) && isRecord(currentValue)) {
        for (const [client, count] of Object.entries(currentValue)) {
          if (Number.isSafeInteger(count) && count >= 0) value[client] = Math.max(Number(value[client]) || 0, count);
        }
      } else if (/^(?:.*Count|.*Base|revision|generation)$/.test(key)
          && Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(currentValue) && currentValue >= 0) {
        target[key] = Math.max(value, currentValue);
      } else if (isRecord(value) || Array.isArray(value)) mergeMonotonicCounters(value, currentValue);
    }
    if (Object.hasOwn(target, 'playCountByClient')) {
      const base = Number.isSafeInteger(target.playCountBase) ? target.playCountBase : 0;
      target.playCount = Math.min(Number.MAX_SAFE_INTEGER, base + Object.values(target.playCountByClient).reduce((n, count) => n + count, 0));
    }
    if (Object.hasOwn(target, 'earlySwipeCountByClient')) {
      const base = Number.isSafeInteger(target.earlySwipeCountBase) ? target.earlySwipeCountBase : 0;
      target.earlySwipeCount = Math.min(Number.MAX_SAFE_INTEGER, base + Object.values(target.earlySwipeCountByClient).reduce((n, count) => n + count, 0));
    }
  }

  function prepareVaultHistoryRestore(targetSnapshot, currentPayload, createId, normalize) {
    if (typeof createId !== 'function') throw new TypeError('復元用ID生成関数が必要です。');
    const target = normalizePayload(targetSnapshot, normalize);
    const current = normalizePayload(currentPayload, normalize);
    const currentTombstones = Array.isArray(current.vaultSyncTombstones) ? current.vaultSyncTombstones : [];
    const tombstones = [...new Set([
      ...(Array.isArray(target.vaultSyncTombstones) ? target.vaultSyncTombstones : []),
      ...currentTombstones,
    ])];
    const targetIds = new Set();
    for (const collection of ENTITY_COLLECTIONS) {
      for (const entity of Array.isArray(target[collection]) ? target[collection] : []) {
        if (typeof entity.id === 'string') targetIds.add(entity.id);
      }
    }
    const idMap = new Map();
    const usedIds = new Set(targetIds);
    for (const pointer of currentTombstones) {
      const parts = parseTombstone(pointer);
      if (parts.length !== 2) {
        if (ENTITY_COLLECTIONS.has(parts[0])) {
          throw new Error('未対応の削除履歴を安全に復元できないため、処理を停止しました。');
        }
        continue;
      }
      const [collection, id] = parts;
      if (ENTITY_COLLECTIONS.has(collection)) {
        if (!(Array.isArray(target[collection]) ? target[collection] : []).some((entity) => entity && entity.id === id)) continue;
        const nextId = String(createId() || '');
        if (!nextId || nextId === id || usedIds.has(nextId) || currentTombstones.some((path) => parseTombstone(path).at(-1) === nextId)) {
          throw new Error('削除済みIDを安全に再割当てできないため、復元を停止しました。');
        }
        idMap.set(collection + ':' + id, nextId);
        usedIds.add(nextId);
      } else if (targetIds.has(id)) {
        const ownerCollection = ENTITY_MAP_OWNERS.get(collection);
        const mapsToTargetEntity = ownerCollection
          && (Array.isArray(target[ownerCollection]) ? target[ownerCollection] : []).some((entity) => entity && entity.id === id);
        if (!mapsToTargetEntity) throw new Error('未対応の削除履歴を安全に復元できないため、処理を停止しました。');
      }
    }
    remapEntityReferences(target, idMap);
    const remappedCurrent = clone(current);
    remapEntityReferences(remappedCurrent, idMap);
    mergeMonotonicCounters(target, remappedCurrent);
    target.vaultSyncTombstones = tombstones;
    return { payload: normalizePayload(target, normalize), idMap: Object.fromEntries(idMap) };
  }

  return { diffVaultSnapshots, prepareVaultHistoryRestore };
});
