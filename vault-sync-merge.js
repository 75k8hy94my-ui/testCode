(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MangaVaultSyncMerge = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MISSING = Symbol('missing');

  function stableJson(value) {
    if (value === MISSING) return '"<missing>"';
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  const equal = (left, right) => stableJson(left) === stableJson(right);
  const isRecord = (value) => value !== MISSING && value && typeof value === 'object' && !Array.isArray(value);
  const pathJoin = (path, key) => path ? path + '.' + key : String(key);

  function mergeVaultPayload(base, local, remote) {
    const conflicts = [];
    let merged = mergeValue(base, local, remote, '', conflicts);
    if (merged === MISSING) merged = {};
    recomputeMonotonicCounters(merged);
    return { payload: merged, conflicts };
  }

  function retainUnknownProperties(base, local) {
    if (Array.isArray(base) && Array.isArray(local)
        && [...base, ...local].every((item) => isRecord(item) && typeof item.id === 'string' && item.id)) {
      const baseById = asMap(base);
      return local.map((item) => baseById.has(item.id) ? retainUnknownProperties(baseById.get(item.id), item) : item);
    }
    if (!isRecord(base) || !isRecord(local)) return local;
    const result = { ...local };
    for (const [key, baseValue] of Object.entries(base)) {
      if (!Object.prototype.hasOwnProperty.call(local, key)) result[key] = baseValue;
      else if ((isRecord(baseValue) && isRecord(local[key])) || (Array.isArray(baseValue) && Array.isArray(local[key]))) {
        result[key] = retainUnknownProperties(baseValue, local[key]);
      }
    }
    return result;
  }

  function addConflict(conflicts, type, path, base, local, remote) {
    conflicts.push({ type, path, base: base === MISSING ? undefined : base, local: local === MISSING ? undefined : local, remote: remote === MISSING ? undefined : remote,
      basePresent: base !== MISSING, localPresent: local !== MISSING, remotePresent: remote !== MISSING });
  }

  function mergeValue(base, local, remote, path, conflicts) {
    if (equal(local, base)) return remote;
    if (equal(remote, base) || equal(local, remote)) return local;

    if (/\.(?:playCountByClient|earlySwipeCountByClient)$/.test(path)
        && isRecord(base) && isRecord(local) && isRecord(remote)) {
      return mergeCounterVector(base, local, remote, path, conflicts);
    }

    if (isRecord(base) && isRecord(local) && isRecord(remote)) {
      const result = {};
      const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
      for (const key of keys) {
        const value = mergeValue(
          Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING,
          Object.prototype.hasOwnProperty.call(local, key) ? local[key] : MISSING,
          Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING,
          pathJoin(path, key), conflicts,
        );
        if (value !== MISSING) result[key] = value;
      }
      return result;
    }

    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)
        && [...base, ...local, ...remote].every((item) => isRecord(item) && typeof item.id === 'string' && item.id)) {
      return mergeEntityArray(base, local, remote, path, conflicts);
    }

    if (base === MISSING || local === MISSING || remote === MISSING) {
      addConflict(conflicts, 'delete-edit', path, base, local, remote);
      return base;
    }

    addConflict(conflicts, 'value', path, base, local, remote);
    return base;
  }

  function mergeCounterVector(base, local, remote, path, conflicts) {
    const result = {};
    const clients = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const client of clients) {
      const values = [base[client] ?? 0, local[client] ?? 0, remote[client] ?? 0];
      if (!values.every((value) => Number.isSafeInteger(value) && value >= 0)) {
        addConflict(conflicts, 'counter', pathJoin(path, client), values[0], values[1], values[2]);
        result[client] = values[0];
        continue;
      }
      // Each tab gets a unique client id and advances only its own component.
      // Component-wise max merges retryable operation sequences, not totals.
      result[client] = Math.max(...values);
    }
    return result;
  }

  function recomputeMonotonicCounters(value) {
    if (Array.isArray(value)) { value.forEach(recomputeMonotonicCounters); return; }
    if (!isRecord(value)) return;
    for (const child of Object.values(value)) recomputeMonotonicCounters(child);
    const sum = (map) => Object.values(isRecord(map) ? map : {}).reduce((total, count) => Number.isSafeInteger(count) && count >= 0
      ? Math.min(Number.MAX_SAFE_INTEGER, total + count) : total, 0);
    if (Object.prototype.hasOwnProperty.call(value, 'playCountByClient')) {
      const base = Number.isSafeInteger(value.playCountBase) && value.playCountBase >= 0 ? value.playCountBase : 0;
      value.playCount = Math.min(Number.MAX_SAFE_INTEGER, base + sum(value.playCountByClient));
    }
    if (Object.prototype.hasOwnProperty.call(value, 'earlySwipeCountByClient')) {
      const base = Number.isSafeInteger(value.earlySwipeCountBase) && value.earlySwipeCountBase >= 0 ? value.earlySwipeCountBase : 0;
      value.earlySwipeCount = Math.min(Number.MAX_SAFE_INTEGER, base + sum(value.earlySwipeCountByClient));
    }
  }

  function asMap(items) {
    return new Map(items.map((item) => [item.id, item]));
  }

  function projectOrder(order, allowed) {
    return order.filter((id) => allowed.has(id));
  }

  function insertNewIds(order, sourceOrder, allowed) {
    for (const id of sourceOrder) {
      if (!allowed.has(id) || order.includes(id)) continue;
      const sourceIndex = sourceOrder.indexOf(id);
      let previous = null;
      for (let i = sourceIndex - 1; i >= 0; i -= 1) {
        if (order.includes(sourceOrder[i])) { previous = sourceOrder[i]; break; }
      }
      if (previous == null) order.unshift(id);
      else order.splice(order.indexOf(previous) + 1, 0, id);
    }
  }

  function mergeEntityArray(base, local, remote, path, conflicts) {
    const baseMap = asMap(base), localMap = asMap(local), remoteMap = asMap(remote);
    const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
    const resultMap = new Map();

    for (const id of ids) {
      const merged = mergeValue(baseMap.has(id) ? baseMap.get(id) : MISSING,
        localMap.has(id) ? localMap.get(id) : MISSING,
        remoteMap.has(id) ? remoteMap.get(id) : MISSING,
        pathJoin(path, id), conflicts);
      if (merged !== MISSING) resultMap.set(id, merged);
    }

    const surviving = new Set(resultMap.keys());
    const baseIds = base.map((item) => item.id);
    const localIds = local.map((item) => item.id);
    const remoteIds = remote.map((item) => item.id);
    const baseCommon = new Set(baseIds.filter((id) => surviving.has(id)));
    const baseOrder = projectOrder(baseIds, baseCommon);
    const localOrder = projectOrder(localIds, baseCommon);
    const remoteOrder = projectOrder(remoteIds, baseCommon);
    const localReordered = !equal(baseOrder, localOrder);
    const remoteReordered = !equal(baseOrder, remoteOrder);

    let order;
    if (localReordered && remoteReordered && !equal(localOrder, remoteOrder)) {
      addConflict(conflicts, 'order', path + '.[order]', baseOrder, localOrder, remoteOrder);
      order = localIds.filter((id) => surviving.has(id));
    } else if (localReordered) order = localIds.filter((id) => surviving.has(id));
    else if (remoteReordered) order = remoteIds.filter((id) => surviving.has(id));
    else order = baseIds.filter((id) => surviving.has(id));

    insertNewIds(order, localIds, surviving);
    insertNewIds(order, remoteIds, surviving);
    for (const id of surviving) if (!order.includes(id)) order.push(id);
    return order.map((id) => resultMap.get(id));
  }

  function setPath(root, path, value, present) {
    const parts = path.replace(/\.\[order\]$/, '').split('.').filter(Boolean);
    let parent = root;
    for (const key of parts.slice(0, -1)) {
      if (Array.isArray(parent)) {
        const index = parent.findIndex((item) => item && item.id === key);
        if (index < 0) return;
        parent = parent[index];
      } else {
        if (!parent || typeof parent !== 'object') return;
        parent = parent[key];
      }
    }
    const key = parts[parts.length - 1];
    if (!key || !parent || typeof parent !== 'object') return;
    if (Array.isArray(parent)) {
      const index = parent.findIndex((item) => item && item.id === key);
      if (present && index < 0 && isRecord(value)) parent.push(value);
      else if (!present && index >= 0) parent.splice(index, 1);
      else if (index >= 0) parent[index] = value;
    } else if (present) parent[key] = value;
    else delete parent[key];
  }

  function applyConflictChoices(payload, conflicts, choices) {
    const result = JSON.parse(JSON.stringify(payload));
    for (const conflict of conflicts || []) {
      const choice = choices && choices[conflict.path];
      if (choice !== 'local' && choice !== 'remote') throw new Error('すべての競合に端末またはクラウドの選択が必要です。');
      const side = choice === 'local' ? 'local' : 'remote';
      const value = conflict[side];
      const present = conflict[side + 'Present'] !== false;
      if (conflict.type === 'order') {
        const path = conflict.path.replace(/\.\[order\]$/, '');
        const parts = path.split('.'); let parent = result;
        for (const key of parts.slice(0, -1)) parent = Array.isArray(parent) ? parent.find((item) => item && item.id === key) : parent && parent[key];
        const array = parent && parent[parts[parts.length - 1]];
        if (Array.isArray(array)) {
          const order = value || [];
          array.sort((a, b) => { const ai = order.indexOf(a.id), bi = order.indexOf(b.id); return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi); });
        }
      } else setPath(result, conflict.path, value, present);
    }
    return result;
  }

  return { mergeVaultPayload, retainUnknownProperties, applyConflictChoices };
}));
