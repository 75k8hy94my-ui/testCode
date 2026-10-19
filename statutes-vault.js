/* Statutes-only persisted cryptographic identity. Does not expose the media Vault key. */
(() => {
  'use strict';
  const KEY = 'testCode.statutes.deviceKey.v1';
  const BASE = 'testCode.statutes.independentBase.v1';
  const FIELDS = ['testCode.statutes.definitions.v1','testCode.statutes.articleNotes.v1','testCode.statutes.articleNoteHistory.v1','testCode.statutes.definitionReviews.v1','testCode.statutes.definitionFSRSWeights.v1','testCode.statutes.definitionRetention.v1'];
  const DEFAULTS = [[],{},{},{},null,0.9];
  const empty = () => Object.fromEntries(FIELDS.map((k,i)=>[k, Array.isArray(DEFAULTS[i])?[]:(DEFAULTS[i]&&typeof DEFAULTS[i]==='object'?{}:DEFAULTS[i])]));
  const normalized = value => {
    const out=empty();
    for(const k of FIELDS) if(value && Object.prototype.hasOwnProperty.call(value,k)) out[k]=value[k];
    return out;
  };
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const encode = bytes => {
    let output = '';
    for (let i=0; i<bytes.length; i+=8192)
      output += String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(output);
  };
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const bytes = n => crypto.getRandomValues(new Uint8Array(n));
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const save = (k,v) => localStorage.setItem(k,JSON.stringify(v));
  const current = () => {
    const session = window.MangaVault?.loadSession?.();
    return session?.user?.id && session?.refresh_token ? String(session.user.id) : null;
  };
  function deviceKey() {
    const user = current(), record = read(KEY);
    if (!user || record?.user !== user || typeof record.raw !== 'string') return null;
    try { const raw = decode(record.raw); return raw.length === 32 ? raw : null; } catch (_) { return null; }
  }
  const hasDeviceKey = () => Boolean(deviceKey());
  function wipe() { localStorage.removeItem(KEY); localStorage.removeItem(BASE); }
  async function seal(raw, value) {
    const key = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
    const iv = bytes(12);
    const data = await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(value)));
    return {v:1,iv:encode(iv),data:encode(new Uint8Array(data))};
  }
  async function unseal(raw, sealed) {
    if (!sealed || sealed.v !== 1) throw new Error('逐条集の暗号文形式を確認できません。');
    const key = await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    const data = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(sealed.iv)},key,decode(sealed.data));
    return JSON.parse(decoder.decode(data));
  }
  const snapshot = () => Object.fromEntries(FIELDS.map((k,i) => [k, read(k) ?? DEFAULTS[i]]));
  const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const valid = value => value && isObject(value) && Array.isArray(value[FIELDS[0]])
    && FIELDS.slice(1,4).every(k => isObject(value[k]))
    && (value[FIELDS[4]] == null || (Array.isArray(value[FIELDS[4]]) && value[FIELDS[4]].length===21 && value[FIELDS[4]].every(Number.isFinite)))
    && (value[FIELDS[5]] == null || (Number.isFinite(value[FIELDS[5]]) && value[FIELDS[5]]>=0.7 && value[FIELDS[5]]<=0.97));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function apply(value) {
    if (!valid(value)) throw new Error('逐条集データの形式が不正です。');
    for (const k of FIELDS) save(k,normalized(value)[k]);
    window.dispatchEvent(new CustomEvent('manga-vault-payload-applied'));
    document.dispatchEvent(new CustomEvent('manga-vault-payload-applied'));
  }
  const api = (path, options) => window.MangaVault.withSession((token) =>
    window.MangaVault.api(path,{...options,token}));
  const endpoint = user => '/rest/v1/testcode_statute_vaults?user_id=eq.'+encodeURIComponent(user);
  async function remote(user) {
    const result = await api(endpoint(user)+'&select=user_id,revision,ciphertext,wrapped_key&limit=2');
    if (!Array.isArray(result) || result.length > 1) throw new Error('逐条集の同期行を検証できません。');
    return result[0] || null;
  }
  let pending = null;
  async function sync() {
    if (pending) return pending;
    const op = (async () => {
      if (window.TestCodeGuest?.isActive()) return {state:'deferred',reason:'guest'};
      const user = current();
      if (!user) return {state:'deferred',reason:'unauthenticated'};
      if (navigator.onLine === false) return {state:'deferred',reason:'offline'};
      let row = await remote(user);
      let raw = deviceKey();
      // First enrollment requires the shared Vault key. No main-key persistence.
      if (!row) {
        const active = window.MangaVault.loadActive?.();
        if (!active?.rawKey) return {state:'deferred',reason:'locked'};
        raw = bytes(32);
        const wrapped = await seal(active.rawKey, {raw:encode(raw)});
        const cipher = await seal(raw,snapshot());
        try {
          await api('/rest/v1/testcode_statute_vaults',{
            method:'POST',
            headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
            body:JSON.stringify({user_id:user,revision:1,ciphertext:cipher,wrapped_key:wrapped})
          });
        } catch (error) {
          if (error.status !== 409) throw error;
        }
        row = await remote(user);
        if (!row) throw new Error('逐条集の初期登録が確定しませんでした。');
      }
      if (!raw) {
        const active = window.MangaVault.loadActive?.();
        if (!active?.rawKey) return {state:'deferred',reason:'locked'};
        const unwrapped = await unseal(active.rawKey,row.wrapped_key);
        raw = decode(unwrapped.raw);
        if (raw.length !== 32) throw new Error('逐条集専用鍵が不正です。');
        save(KEY,{user,raw:encode(raw)});
      }
      const decoded = await unseal(raw,row.ciphertext);
      const incoming = normalized(decoded);
      if (!valid(incoming)) throw new Error('同期データの構造が不正です。');
      const local = snapshot();
      const base = read(BASE);
      if (base?.data) base.data=normalized(base.data);
      const sameBase = base?.user === user;
      // Never silently replace unsynced or divergent data.
      if (!sameBase) {
        if (!equal(local,incoming)) {
          const isEmpty = equal(local,empty());
          if (!isEmpty) return {state:'deferred',reason:'local-conflict'};
          apply(incoming);
        }
        save(BASE,{user,revision:row.revision,data:incoming});
        save(KEY,{user,raw:encode(raw)});
        return {state:'success',applied:true};
      }
      const localChanged = !equal(local,base.data);
      const remoteChanged = !equal(incoming,base.data);
      if (remoteChanged && localChanged && !equal(local,incoming))
        return {state:'deferred',reason:'local-conflict'};
      if (remoteChanged) {
        if (!equal(local,incoming)) apply(incoming);
        save(BASE,{user,revision:row.revision,data:incoming});
        return {state:'success',applied:true};
      }
      if (localChanged) {
        const cipher = await seal(raw,local);
        const result = await api(endpoint(user)+'&revision=eq.'+encodeURIComponent(row.revision)+'&select=revision',{
          method:'PATCH',
          headers:{Prefer:'return=representation'},
          body:JSON.stringify({revision:Number(row.revision)+1,ciphertext:cipher,updated_at:new Date().toISOString()})
        });
        if (!Array.isArray(result) || result.length !== 1)
          return {state:'deferred',reason:'local-conflict'};
        save(BASE,{user,revision:Number(row.revision)+1,data:local});
      } else if (base.revision !== row.revision) {
        save(BASE,{user,revision:row.revision,data:incoming});
      }
      return {state:'success'};
    })();
    pending = op.finally(() => {pending=null;});
    return pending;
  }
  async function resolveConflict(choice) {
    if (!['cloud','local'].includes(choice)) throw new Error('不明な競合解決方法です。');
    const user = current(), raw = deviceKey();
    if (!user || !raw) throw new Error('逐条集の認証が必要です。');
    const row = await remote(user);
    if (!row) throw new Error('クラウドの逐条集が見つかりません。');
    const decoded = await unseal(raw,row.ciphertext);
    const incoming = normalized(decoded);
    if (!valid(incoming)) throw new Error('クラウドデータが不正です。');
    if (choice === 'cloud') {
      apply(incoming);
      save(BASE,{user,revision:row.revision,data:incoming});
      return {state:'success',applied:true};
    }
    const local = snapshot();
    const cipher = await seal(raw,local);
    const result = await api(endpoint(user)+'&revision=eq.'+encodeURIComponent(row.revision)+'&select=revision',{
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({revision:Number(row.revision)+1,ciphertext:cipher,updated_at:new Date().toISOString()})
    });
    if (!Array.isArray(result) || result.length !== 1)
      throw new Error('別の端末で更新されました。再確認してください。');
    save(BASE,{user,revision:Number(row.revision)+1,data:local});
    return {state:'success'};
  }
  // Called only after local statutes edits; never triggers a shared Vault upload.
  let timer;
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(() => { sync().catch(() => {}); },250);
  }
  window.addEventListener('online', () => { if (hasDeviceKey()) sync().catch(() => {}); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && hasDeviceKey()) sync().catch(() => {});
  });
  window.StatutesVault = {hasDeviceKey, sync,changed,wipe,resolveConflict};
})();
