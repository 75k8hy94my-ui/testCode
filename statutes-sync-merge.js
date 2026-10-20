/* Three-way, item-level merge for the independently encrypted statutes vault. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.StatutesSyncMerge = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MISSING = Symbol('missing');
  const FIELDS = [
    'testCode.statutes.definitions.v1',
    'testCode.statutes.articleNotes.v1',
    'testCode.statutes.articleNoteHistory.v1',
    'testCode.statutes.definitionReviews.v1',
    'testCode.statutes.definitionFSRSWeights.v1',
    'testCode.statutes.definitionRetention.v1',
    'testCode.statutes.manualCards.v1'
  ];
  const record = v => v !== MISSING && v !== null && typeof v === 'object' && !Array.isArray(v);
  function stableJson(v) {
    if (v === MISSING) return '"<missing>"';
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    if (record(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
    return JSON.stringify(v);
  }
  const equal = (a,b) => a === MISSING || b === MISSING ? a === b : stableJson(a) === stableJson(b);
  const own = (obj,key) => Object.prototype.hasOwnProperty.call(obj,key);
  const at = (obj,key) => own(obj,key) ? obj[key] : MISSING;

  // Review records are coherent FSRS state machines: merging individual schedule
  // fields would produce a record that never existed on either device.
  function mergeValue(base, local, remote, path, conflicts, atomic = false) {
    if (equal(local,base)) return remote;
    if (equal(remote,base) || equal(local,remote)) return local;
    if (!atomic && record(base) && record(local) && record(remote)) {
      const out = {};
      const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
      for (const key of keys) {
        const merged = mergeValue(at(base,key), at(local,key), at(remote,key),
          path + '/' + key, conflicts);
        if (merged !== MISSING) out[key] = merged;
      }
      return out;
    }
    // Preserve newest modification time when independent card properties changed.
    if (path.endsWith('/updatedAt') && [local,remote].every(v => Number.isFinite(v))) {
      return Math.max(local,remote);
    }
    conflicts.push(path);
    return base;
  }
  function mergeMap(base,local,remote,path,conflicts,atomicEntries=true) {
    const out = {};
    const keys = new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
    for (const key of keys) {
      const merged = mergeValue(at(base,key),at(local,key),at(remote,key),
        path + '/' + key,conflicts,atomicEntries);
      if (merged !== MISSING) out[key] = merged;
    }
    return out;
  }
  function definitionId(item) {
    if (!record(item) || typeof item.subject !== 'string' || typeof item.article !== 'string'
      || !Number.isSafeInteger(item.part) || !Number.isSafeInteger(item.start)
      || !Number.isSafeInteger(item.end)) return null;
    return JSON.stringify([item.subject,item.article,item.part,item.start,item.end]);
  }
  const cardId = item => record(item) && typeof item.id === 'string' && item.id ? item.id : null;
  function index(items, identity) {
    const indexed = new Map();
    for (const item of items) {
      const id = identity(item);
      if (id === null || indexed.has(id)) return null;
      indexed.set(id,item);
    }
    return indexed;
  }
  const filtered = (ids, set) => ids.filter(id => set.has(id));
  function mergeArray(base,local,remote,path,conflicts,identity) {
    const a=index(base,identity), b=index(local,identity), c=index(remote,identity);
    // Unknown/duplicate identities cannot be merged without risking data loss.
    if (!a || !b || !c) return mergeValue(base,local,remote,path,conflicts,true);
    const items = new Map();
    for (const id of new Set([...a.keys(),...b.keys(),...c.keys()])) {
      const merged = mergeValue(atMap(a,id),atMap(b,id),atMap(c,id),path + '/' + id,conflicts);
      if (merged !== MISSING) items.set(id,merged);
    }
    const surviving = new Set(items.keys());
    const baseOrder = filtered([...a.keys()], surviving);
    const localOrder = filtered([...b.keys()], new Set(baseOrder));
    const remoteOrder = filtered([...c.keys()], new Set(baseOrder));
    const localReordered = !equal(localOrder,baseOrder);
    const remoteReordered = !equal(remoteOrder,baseOrder);
    if (localReordered && remoteReordered && !equal(localOrder,remoteOrder)) {
      conflicts.push(path + '/order');
    }
    const preferred = localReordered && !remoteReordered ? [...b.keys()]
      : [...c.keys()];
    const order = filtered(preferred,surviving);
    for (const id of [...b.keys(),...c.keys(),...a.keys()]) {
      if (surviving.has(id) && !order.includes(id)) order.push(id);
    }
    return order.map(id => items.get(id));
  }
  const atMap = (map,key) => map.has(key) ? map.get(key) : MISSING;
  function mergeStatutes(base, local, remote) {
    const conflicts = [], payload = {};
    for (const field of FIELDS) {
      const a=base[field], b=local[field], c=remote[field];
      if (field === FIELDS[0] || field === FIELDS[6]) {
        payload[field]=mergeArray(a,b,c,field,conflicts,field===FIELDS[0]?definitionId:cardId);
      } else if ([FIELDS[1],FIELDS[2],FIELDS[3]].includes(field)) {
        payload[field]=mergeMap(a,b,c,field,conflicts,true);
      } else {
        payload[field]=mergeValue(a,b,c,field,conflicts,true);
      }
    }
    return {data:payload,conflicts};
  }
  return {mergeStatutes,equal};
});
