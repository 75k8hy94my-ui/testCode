/* Local-only guest sandbox. It does not authenticate to Supabase or unlock a vault.
   The mode flag stays in the native tab session; guest data is separately prefixed
   in both web storage areas so normal account values cannot be read or overwritten. */
(() => {
  'use strict';
  const FLAG = 'testCode.guestMode.v1';
  const PREFIX_LOCAL = 'testCode.guest.v1.local.';
  const PREFIX_SESSION = 'testCode.guest.v1.session.';
  const rawLocal = window.localStorage;
  const rawSession = window.sessionStorage;
  const active = rawSession.getItem(FLAG) === '1' && window.location.pathname.split('/').pop() !== 'index.html';
  function scopedStorage(raw, prefix) {
    const keys = () => {
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const value = raw.key(i);
        if (typeof value === 'string' && value.startsWith(prefix)) out.push(value.slice(prefix.length));
      }
      return out;
    };
    const methods = Object.create(null);
    Object.defineProperties(methods, {
      getItem: { configurable: true, value: (key) => raw.getItem(prefix + String(key)) },
      setItem: { configurable: true, value: (key, value) => raw.setItem(prefix + String(key), String(value)) },
      removeItem: { configurable: true, value: (key) => raw.removeItem(prefix + String(key)) },
      clear: { configurable: true, value: () => { for (const key of keys()) raw.removeItem(prefix + key); } },
      key: { configurable: true, value: (index) => keys()[Number(index)] ?? null },
      length: { configurable: true, get: () => keys().length },
    });
    return new Proxy(methods, {
      get(target, prop) {
        if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop);
        return target.getItem(prop) ?? undefined;
      },
      set(target, prop, value) {
        if (typeof prop !== 'string' || prop in target) return false;
        target.setItem(prop, value);
        return true;
      },
      deleteProperty(target, prop) {
        if (typeof prop === 'string' && !(prop in target)) { target.removeItem(prop); return true; }
        return false;
      },
      ownKeys: () => keys(),
      getOwnPropertyDescriptor(target, prop) {
        if (prop in target) return Reflect.getOwnPropertyDescriptor(target, prop);
        const value = typeof prop === 'string' ? target.getItem(prop) : null;
        return value === null ? undefined : { configurable: true, enumerable: true, writable: true, value };
      },
      has(target, prop) { return prop in target || (typeof prop === 'string' && target.getItem(prop) !== null); },
    });
  }
  const api = Object.freeze({
    isActive: () => active,
    begin() {
      // The real session and vault are neither read nor changed by this action.
      rawSession.setItem(FLAG, '1');
      window.location.replace('home.html');
    },
    exit() {
      rawSession.removeItem(FLAG);
      window.location.replace('index.html');
    },
  });
  window.TestCodeGuest = api;
  if (!active) return;
  // Refuse to start if the browser cannot provide a genuinely separate
  // storage view. Never fall back to using the real account storage.
  try {
    const scopedLocal = scopedStorage(rawLocal, PREFIX_LOCAL);
    const scopedSession = scopedStorage(rawSession, PREFIX_SESSION);
    Object.defineProperty(window, 'localStorage', { configurable: true, value: scopedLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: scopedSession });
    if (window.localStorage !== scopedLocal || window.sessionStorage !== scopedSession) throw new Error('Guest storage isolation unavailable');
    document.documentElement.dataset.guestMode = 'true';
  } catch (_) {
    rawSession.removeItem(FLAG);
    window.location.replace('index.html');
    throw new Error('ゲスト用の保存領域を分離できませんでした。');
  }
})();
