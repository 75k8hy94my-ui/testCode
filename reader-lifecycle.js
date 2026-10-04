(() => {
  'use strict';
  function create(dependencies = {}) {
    const cleanups = [];
    const resources = new Set();
    let destroyed = false;
    const clearTimeoutRef = dependencies.clearTimeout || globalThis.clearTimeout;
    function listen(target, type, callback, options) {
      if (!target?.addEventListener || destroyed) return () => {};
      target.addEventListener(type, callback, options);
      const cleanup = () => target.removeEventListener?.(type, callback, options);
      cleanups.push(cleanup);
      return cleanup;
    }
    function timer(id) { if (!destroyed && id != null) cleanups.push(() => clearTimeoutRef(id)); return id; }
    function cleanup(callback) { if (typeof callback !== 'function') return callback; if (destroyed) { try { callback(); } catch (_) {} } else cleanups.push(callback); return callback; }
    function own(resource) {
      if (!resource) return true;
      if (destroyed) { try { resource.destroy?.(); } catch (_) {} return false; }
      resources.add(resource); return true;
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch (_) {} }
      for (const resource of resources) { try { resource.destroy?.(); } catch (_) {} }
      resources.clear();
    }
    return Object.freeze({ listen, timer, cleanup, own, destroy, get destroyed() { return destroyed; } });
  }
  const api = Object.freeze({ create });
  if (typeof self !== 'undefined') self.ReaderLifecycleFactory = api;
  if (typeof window !== 'undefined') window.ReaderLifecycleFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
