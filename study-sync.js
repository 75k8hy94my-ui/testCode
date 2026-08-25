const StudyDataRef = typeof module !== 'undefined' && module.exports
  ? require('./study-data.js')
  : (typeof window !== 'undefined' ? window.StudyData : null);

const MAX_APPLIED_OPERATION_IDS = 4000;
const SUPPORTED_OPERATION_TYPES = new Set(['definition.upserted', 'definition.deleted', 'attempt.upserted', 'preference.changed']);
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

function normalizeStudy(value) {
  return StudyDataRef && typeof StudyDataRef.normalizeStudy === 'function' ? StudyDataRef.normalizeStudy(value) : clone(value || {});
}

function createOperation(type, payload, options = {}) {
  if (!SUPPORTED_OPERATION_TYPES.has(type)) throw new Error(`unsupported study operation: ${type}`);
  const id = options.id || (StudyDataRef && StudyDataRef.createId ? StudyDataRef.createId() : `op-${Date.now()}-${Math.random()}`);
  return { id, type, payload: clone(payload || {}), occurredAt: options.occurredAt || new Date().toISOString() };
}

function sameFinalGrading(a, b) {
  return JSON.stringify(a && a.grading) === JSON.stringify(b && b.grading);
}

function rememberAppliedId(study, operationId) {
  const ids = Array.isArray(study.appliedOperationIds) ? study.appliedOperationIds.filter((id) => id !== operationId) : [];
  ids.push(operationId);
  study.appliedOperationIds = ids.slice(Math.max(0, ids.length - MAX_APPLIED_OPERATION_IDS));
  return study;
}

function applyAttempt(study, incoming, options) {
  if (!incoming || !incoming.id) throw new Error('attempt.upserted requires attempt.id');
  const attempts = Array.isArray(study.recentAttempts) ? study.recentAttempts.slice() : [];
  const index = attempts.findIndex((item) => item && item.id === incoming.id);
  const existing = index >= 0 ? attempts[index] : null;
  const incomingFinal = incoming.grading && incoming.grading.status === 'final';
  const existingFinal = existing && existing.grading && existing.grading.status === 'final';
  let shouldReduce = false;

  if (existingFinal && incomingFinal) {
    if (!sameFinalGrading(existing, incoming)) throw new Error('conflicting final grading');
  } else if (existingFinal && !incomingFinal) {
    // A completed grade always wins over a later/stale pending copy.
  } else {
    if (index >= 0) attempts[index] = clone(incoming);
    else attempts.push(clone(incoming));
    shouldReduce = incomingFinal;
  }

  let next = { ...study, recentAttempts: attempts };
  if (shouldReduce && typeof options.reduceFinalAttempt === 'function') {
    const reduced = options.reduceFinalAttempt(next, clone(incoming));
    if (reduced) next = reduced;
  }
  return next;
}

function applyOperation(study, operation, options = {}) {
  if (!operation || !operation.id || !SUPPORTED_OPERATION_TYPES.has(operation.type)) throw new Error('invalid study operation');
  let next = normalizeStudy(clone(study));
  if (next.appliedOperationIds.includes(operation.id)) return next;

  if (operation.type === 'definition.upserted') {
    const definition = operation.payload && operation.payload.definition;
    if (!definition || !definition.id) throw new Error('definition.upserted requires definition.id');
    const definitions = next.definitions.slice();
    const index = definitions.findIndex((item) => item && item.id === definition.id);
    if (index >= 0) definitions[index] = clone(definition);
    else definitions.push(clone(definition));
    next.definitions = definitions;
  } else if (operation.type === 'definition.deleted') {
    const definitionId = operation.payload && operation.payload.definitionId;
    if (!definitionId) throw new Error('definition.deleted requires definitionId');
    next.definitions = next.definitions.filter((item) => item && item.id !== definitionId);
    const progress = { ...next.progress };
    delete progress[definitionId];
    next.progress = progress;
    next.pendingGradings = next.pendingGradings.filter((attemptId) => {
      const attempt = next.recentAttempts.find((item) => item && item.id === attemptId);
      return !attempt || attempt.definitionId !== definitionId;
    });
  } else if (operation.type === 'preference.changed') {
    next.preferences = { ...next.preferences, ...(operation.payload || {}) };
  } else if (operation.type === 'attempt.upserted') {
    next = applyAttempt(next, operation.payload && operation.payload.attempt, options);
  }

  return rememberAppliedId(next, operation.id);
}

function queueOperation(study, operation) {
  const next = normalizeStudy(clone(study));
  if (!next.pendingSyncOps.some((item) => item && item.id === operation.id)) next.pendingSyncOps.push(clone(operation));
  return next;
}

function rebaseStudy(remoteStudy, pendingOps, options = {}) {
  const ordered = (Array.isArray(pendingOps) ? pendingOps : [])
    .map((operation, index) => ({ operation, index }))
    .sort((a, b) => String(a.operation.occurredAt || '').localeCompare(String(b.operation.occurredAt || '')) || a.index - b.index);
  return ordered.reduce((state, entry) => applyOperation(state, entry.operation, options), normalizeStudy(clone(remoteStudy)));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function fingerprintNonStudy(vaultPayload) {
  const source = vaultPayload && typeof vaultPayload === 'object' ? vaultPayload : {};
  const { study, ...nonStudy } = source;
  return JSON.stringify(canonicalize(nonStudy));
}

function storageGet(storage, key) {
  return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null);
}
function storageSet(storage, key, value) {
  if (storage.setItem) storage.setItem(key, value);
  else storage.set(key, value);
}
function decodeB64url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  if (typeof atob === 'function') return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(padded, 'base64'));
  throw new Error('base64 decoder unavailable');
}
async function decryptRemoteEnvelope(vault, envelope, cryptoImpl = globalThis.crypto) {
  const active = vault && typeof vault.loadActive === 'function' ? vault.loadActive() : null;
  if (!active || !active.rawKey) throw new Error('保管庫を開いてください。');
  if (!envelope || !envelope.data || !envelope.data.iv || !envelope.data.ciphertext) throw new Error('保管庫の形式が正しくありません。');
  if (!cryptoImpl || !cryptoImpl.subtle) throw new Error('このブラウザは暗号化機能に対応していません。');
  const key = await cryptoImpl.subtle.importKey('raw', active.rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await cryptoImpl.subtle.decrypt({ name: 'AES-GCM', iv: decodeB64url(envelope.data.iv) }, key, decodeB64url(envelope.data.ciphertext));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function reloadVaultPayload(vault, options = {}) {
  if (!vault || typeof vault.withSession !== 'function' || typeof vault.fetchRecordForUi !== 'function') throw new Error('vault reload API is required');
  const storage = options.storage || globalThis.localStorage;
  const decryptEnvelope = options.decryptEnvelope || ((envelope) => decryptRemoteEnvelope(vault, envelope, options.cryptoImpl));
  return vault.withSession(async (token, user) => {
    const record = await vault.fetchRecordForUi(token, user);
    if (!record) return null;
    if (record.legacyRevision) throw new Error('Supabaseのrevision migrationが未適用です。supabase-schema.sqlをSQL Editorで実行してから同期してください。');
    const payload = await decryptEnvelope(record.payload);
    const revision = record.revision || 1;
    const updatedAt = record.updated_at;
    const metaKey = vault.META_KEY || 'mangaReaderSupabaseSyncMeta';
    let meta = {};
    try { meta = JSON.parse(storageGet(storage, metaKey) || '{}') || {}; } catch (_) { meta = {}; }
    meta[user.id] = { revision, updatedAt };
    storageSet(storage, metaKey, JSON.stringify(meta));
    return { payload, revision, updatedAt };
  });
}

function createController({ vault, payloadApi, storage, reduceFinalAttempt } = {}) {
  if (!vault || typeof vault.savePayload !== 'function') throw new Error('vault.savePayload is required');
  if (!payloadApi || typeof payloadApi.buildFromLocalStorage !== 'function' || typeof payloadApi.applyToLocalStorage !== 'function') throw new Error('payloadApi is required');
  let baselineNonStudyFingerprint = null;
  let status = 'idle';

  const build = () => payloadApi.buildFromLocalStorage(storage);
  const applyPayload = (payload) => payloadApi.applyToLocalStorage(payload, storage);
  const markBase = (payload) => {
    const current = payload || build();
    baselineNonStudyFingerprint = fingerprintNonStudy(current);
    return baselineNonStudyFingerprint;
  };
  const getStatus = () => status;

  async function syncNow() {
    const currentPayload = build();
    const currentStudy = normalizeStudy(currentPayload.study);
    const pending = currentStudy.pendingSyncOps.slice();
    if (!pending.length) {
      status = 'idle';
      if (baselineNonStudyFingerprint == null) markBase(currentPayload);
      return { status: 'idle' };
    }
    if (baselineNonStudyFingerprint == null) markBase(currentPayload);
    const pendingIds = new Set(pending.map((operation) => operation.id));
    const withoutPending = { ...currentStudy, pendingSyncOps: currentStudy.pendingSyncOps.filter((operation) => !pendingIds.has(operation.id)) };
    const payloadToSave = { ...currentPayload, study: withoutPending };
    status = 'syncing';
    try {
      await vault.savePayload(payloadToSave);
      applyPayload(payloadToSave);
      markBase(payloadToSave);
      status = 'synced';
      return { status: 'synced' };
    } catch (error) {
      if (!String(error && error.message || '').includes('別の端末で更新されています')) {
        status = 'error';
        throw error;
      }
      if (fingerprintNonStudy(currentPayload) !== baselineNonStudyFingerprint) {
        status = 'conflict';
        return { status: 'conflict', reason: 'non-study-local-change' };
      }
      const remote = typeof vault.reloadPayload === 'function'
        ? await vault.reloadPayload()
        : await reloadVaultPayload(vault, { storage });
      if (!remote || !remote.payload) {
        status = 'conflict';
        return { status: 'conflict', reason: 'remote-missing' };
      }
      const rebasedStudy = rebaseStudy(remote.payload.study, pending, { reduceFinalAttempt });
      rebasedStudy.pendingSyncOps = rebasedStudy.pendingSyncOps.filter((operation) => !pendingIds.has(operation.id));
      const rebasedPayload = { ...remote.payload, study: rebasedStudy };
      await vault.savePayload(rebasedPayload);
      applyPayload(rebasedPayload);
      markBase(rebasedPayload);
      status = 'synced-after-rebase';
      return { status: 'synced-after-rebase' };
    }
  }

  return { syncNow, getStatus, markBase };
}

const api = { MAX_APPLIED_OPERATION_IDS, createOperation, applyOperation, queueOperation, rebaseStudy, fingerprintNonStudy, reloadVaultPayload, createController };
if (typeof window !== 'undefined') window.StudySync = api;
if (typeof module !== 'undefined') module.exports = api;
