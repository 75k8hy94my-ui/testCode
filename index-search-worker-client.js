(()=>{
'use strict';

function createSearchExecutor({ WorkerCtor, workerUrl = 'legal-index-search-worker.js', directApi, onDiagnostic } = {}) {
  if (!directApi || typeof directApi.buildIndex !== 'function' || typeof directApi.search !== 'function') throw new Error('direct legal index search API is required');
  const diagnose = typeof onDiagnostic === 'function' ? onDiagnostic : () => {};
  let mode = 'direct';
  let worker = null;
  let directIndex = directApi.buildIndex([]);
  let lastBooks = [];
  let generation = 0;
  let latestSearchId = 0;
  let pendingBuild = null;
  const pendingSearches = new Map();

  const resolveAllDirect = () => {
    if (pendingBuild) {
      directIndex = directApi.buildIndex(lastBooks);
      pendingBuild.resolve();
      pendingBuild = null;
    }
    for (const [id, pending] of pendingSearches) {
      try {
        const results = directApi.search(directIndex, pending.query, pending.options);
        pending.resolve({ stale: id !== latestSearchId, results: id === latestSearchId ? results : [] });
      } catch (error) {
        pending.reject(error);
      }
    }
    pendingSearches.clear();
  };

  function switchToDirect(error) {
    if (mode === 'direct') return;
    diagnose(error instanceof Error ? error : new Error(String(error || 'worker failed')));
    try { worker?.terminate?.(); } catch (_) {}
    worker = null;
    mode = 'direct';
    directIndex = directApi.buildIndex(lastBooks);
    resolveAllDirect();
  }

  const Ctor = WorkerCtor === undefined ? globalThis.Worker : WorkerCtor;
  if (typeof Ctor === 'function') {
    try {
      worker = new Ctor(workerUrl);
      mode = 'worker';
      worker.addEventListener('message', (event) => {
        const data = event && event.data || {};
        if (data.type === 'built') {
          if (pendingBuild && Number(data.generation) === pendingBuild.generation) {
            pendingBuild.resolve();
            pendingBuild = null;
          }
          return;
        }
        if (data.type === 'results') {
          const id = Number(data.requestId || 0);
          const pending = pendingSearches.get(id);
          if (!pending) return;
          pendingSearches.delete(id);
          if (id !== latestSearchId) pending.resolve({ stale: true, results: [] });
          else pending.resolve({ stale: false, results: Array.isArray(data.results) ? data.results : [] });
          return;
        }
        if (data.type === 'error') {
          switchToDirect(new Error(data.message || 'worker error'));
        }
      });
      worker.addEventListener('error', (event) => switchToDirect(event instanceof Error ? event : new Error(event && event.message || 'worker error')));
    } catch (error) {
      mode = 'direct';
      worker = null;
      diagnose(error);
    }
  }

  async function build(books) {
    lastBooks = Array.isArray(books) ? books : [];
    generation += 1;
    if (mode === 'direct') {
      directIndex = directApi.buildIndex(lastBooks);
      return;
    }
    if (pendingBuild) pendingBuild.resolve();
    return new Promise((resolve, reject) => {
      pendingBuild = { generation, resolve, reject };
      try {
        worker.postMessage({ type: 'build', generation, books: lastBooks });
      } catch (error) {
        switchToDirect(error);
        resolve();
      }
    });
  }

  async function search(query, options = {}) {
    latestSearchId += 1;
    const requestId = latestSearchId;
    if (mode === 'direct') {
      return { stale: false, results: directApi.search(directIndex, query, options) };
    }
    for (const [id, pending] of pendingSearches) {
      if (id < requestId) {
        pending.resolve({ stale: true, results: [] });
        pendingSearches.delete(id);
      }
    }
    return new Promise((resolve, reject) => {
      pendingSearches.set(requestId, { resolve, reject, query, options });
      try {
        worker.postMessage({ type: 'search', requestId, query, options });
      } catch (error) {
        pendingSearches.delete(requestId);
        switchToDirect(error);
        resolve({ stale: false, results: directApi.search(directIndex, query, options) });
      }
    });
  }

  function dispose() {
    for (const pending of pendingSearches.values()) pending.resolve({ stale: true, results: [] });
    pendingSearches.clear();
    if (pendingBuild) pendingBuild.resolve();
    pendingBuild = null;
    try { worker?.postMessage?.({ type: 'dispose' }); } catch (_) {}
    try { worker?.terminate?.(); } catch (_) {}
    worker = null;
    mode = 'direct';
    lastBooks = [];
    directIndex = directApi.buildIndex([]);
  }

  return {
    get mode() { return mode; },
    build,
    search,
    dispose
  };
}

const api = { createSearchExecutor };
if (typeof window !== 'undefined') window.IndexSearchWorkerClient = api;
if (typeof module !== 'undefined') module.exports = api;
})();
