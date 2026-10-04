(() => {
  'use strict';
  function create({ initialPage = 1, commit } = {}) {
    if (typeof commit !== 'function') throw new TypeError('page transition requires commit');
    let displayedPage = Math.max(1, Number(initialPage) || 1);
    let requestedPage = displayedPage;
    let generation = 0;
    let status = 'ready';
    let destroyed = false;
    async function request(page, prepare) {
      if (destroyed) return false;
      const target = Math.max(1, Math.floor(Number(page) || 1));
      requestedPage = target;
      const ownGeneration = ++generation;
      status = target === displayedPage ? 'ready' : 'loading';
      let resource = null;
      try {
        resource = await prepare(ownGeneration);
        if (!resource || resource.ready !== true) throw new Error('Page candidate is not display-ready');
        if (destroyed || ownGeneration !== generation) { resource?.destroy?.(); return false; }
        commit(target, resource);
        displayedPage = target;
        status = 'ready';
        return true;
      } catch (error) {
        try { resource?.destroy?.(); } catch (_) {}
        if (!destroyed && ownGeneration === generation) status = 'failed';
        return false;
      }
    }
    function invalidate() { generation += 1; requestedPage = displayedPage; status = 'ready'; }
    function destroy() { if (destroyed) return; destroyed = true; generation += 1; }
    return Object.freeze({ request, invalidate, destroy, getState: () => Object.freeze({ displayedPage, requestedPage, status, generation, destroyed }) });
  }
  const api = Object.freeze({ create });
  if (typeof self !== 'undefined') self.ReaderPageTransitionFactory = api;
  if (typeof window !== 'undefined') window.ReaderPageTransitionFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
