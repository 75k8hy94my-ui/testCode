(() => {
  'use strict';
  function create({ save, canSync, onError = () => {}, delayMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    if (typeof save !== 'function' || typeof canSync !== 'function') throw new TypeError('Reader sync scheduler requires save and canSync');
    let timer = null, dirty = false, inFlight = null, destroyed = false;
    function clearPendingTimer() { if (timer !== null) clearTimer(timer); timer = null; }
    function schedule() {
      if (destroyed || !canSync()) return false;
      dirty = true;
      clearPendingTimer();
      timer = setTimer(() => { timer = null; flush().catch(onError); }, delayMs);
      return true;
    }
    function flush() {
      clearPendingTimer();
      if (destroyed) return Promise.resolve(false);
      if (inFlight) return inFlight.then(() => dirty ? flush() : true);
      if (!dirty) return Promise.resolve(true);
      if (!canSync()) return Promise.reject(new Error('VPN接続を確認できるまで同期できません。'));
      dirty = false;
      const work = Promise.resolve().then(() => {
        if (destroyed || !canSync()) throw new Error('VPN接続を確認できるまで同期できません。');
        return save();
      }).catch((error) => { if (!destroyed) dirty = true; throw error; });
      inFlight = work.finally(() => { inFlight = null; });
      return inFlight.then(() => dirty ? flush() : true);
    }
    function destroy() { if (destroyed) return; destroyed = true; clearPendingTimer(); }
    return Object.freeze({ schedule, flush, destroy, hasPending: () => dirty || inFlight !== null });
  }
  const api = Object.freeze({ create });
  if (typeof self !== 'undefined') self.ReaderSyncSchedulerFactory = api;
  if (typeof window !== 'undefined') window.ReaderSyncSchedulerFactory = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
