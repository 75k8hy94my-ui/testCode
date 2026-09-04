(()=>{
'use strict';

const RETRY_DELAYS = Object.freeze([2000, 5000, 15000, 30000]);
const STATES = Object.freeze(['synced', 'pending', 'syncing', 'conflict', 'error', 'deleted']);

function hasEntry(collection, key) {
  if (!collection) return false;
  if (typeof collection.has === 'function') return collection.has(key);
  return Boolean(collection[key]);
}

function deriveChunkStatus({ record, syncingIds, conflicts, errors } = {}) {
  if (!record) return 'error';
  const id = String(record.chunkId || '');
  if (record.deletedAt) return 'deleted';
  if (hasEntry(conflicts, id)) return 'conflict';
  if (hasEntry(syncingIds, id)) return 'syncing';
  if (hasEntry(errors, id)) return 'error';
  if (record.pendingAction) return 'pending';
  return 'synced';
}

function aggregateStatus(statuses) {
  const counts = Object.fromEntries(STATES.map((state) => [state, 0]));
  for (const state of Array.isArray(statuses) ? statuses : []) {
    if (Object.prototype.hasOwnProperty.call(counts, state)) counts[state] += 1;
  }
  let state = 'synced';
  if (counts.conflict) state = 'conflict';
  else if (counts.error) state = 'error';
  else if (counts.syncing) state = 'syncing';
  else if (counts.pending) state = 'pending';
  else if (!counts.synced && counts.deleted) state = 'deleted';
  return { state, counts };
}

function createRetryController({ run, isOnline, setTimer, clearTimer } = {}) {
  if (typeof run !== 'function') throw new Error('run is required');
  const online = typeof isOnline === 'function' ? isOnline : () => true;
  const schedule = typeof setTimer === 'function' ? setTimer : (fn, ms) => setTimeout(fn, ms);
  const cancel = typeof clearTimer === 'function' ? clearTimer : (id) => clearTimeout(id);
  let timerId = null;
  let retryIndex = 0;
  let running = false;
  let rerunRequested = false;
  let currentPromise = null;
  let disposed = false;

  function cancelRetry() {
    if (timerId != null) {
      cancel(timerId);
      timerId = null;
    }
  }

  function nextDelay() {
    const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
    retryIndex += 1;
    return delay;
  }

  async function requestNow() {
    if (disposed || !online()) return;
    cancelRetry();
    if (running) {
      rerunRequested = true;
      return currentPromise;
    }
    running = true;
    currentPromise = (async () => {
      do {
        rerunRequested = false;
        await run();
      } while (!disposed && online() && rerunRequested);
    })();
    try {
      await currentPromise;
    } finally {
      running = false;
      currentPromise = null;
    }
  }

  function recordFailure({ retryable = true, hasConflict = false } = {}) {
    if (disposed || hasConflict || !retryable || !online()) return;
    cancelRetry();
    const delay = nextDelay();
    timerId = schedule(() => {
      timerId = null;
      requestNow();
    }, delay);
  }

  function recordSuccess() {
    retryIndex = 0;
    cancelRetry();
  }

  function onOffline() {
    cancelRetry();
  }

  async function onOnline() {
    if (disposed || !online()) return;
    return requestNow();
  }

  function dispose() {
    disposed = true;
    rerunRequested = false;
    cancelRetry();
  }

  return { requestNow, onOnline, onOffline, recordSuccess, recordFailure, dispose };
}

const api = { RETRY_DELAYS, deriveChunkStatus, aggregateStatus, createRetryController };
if (typeof window !== 'undefined') window.IndexSearchSyncStatus = api;
if (typeof module !== 'undefined') module.exports = api;
})();
