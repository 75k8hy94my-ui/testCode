(()=>{
const STUDY_KEY = 'mangaReaderStudy';
const STUDY_SCHEMA_VERSION = 1;
const MAX_FINALIZED_ATTEMPTS = 2000;
const DEFAULT_SUBJECTS = [
  { id: 'constitutional-law', name: '憲法' },
  { id: 'administrative-law', name: '行政法' },
  { id: 'civil-law', name: '民法' },
  { id: 'commercial-law', name: '商法' },
  { id: 'civil-procedure', name: '民事訴訟法' },
  { id: 'criminal-law', name: '刑法' },
  { id: 'criminal-procedure', name: '刑事訴訟法' },
  { id: 'labor-law', name: '労働法' }
];
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const cloneSubjects = () => DEFAULT_SUBJECTS.map((item) => ({ ...item }));

function createEmptyStudy() {
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    subjects: cloneSubjects(),
    genres: [],
    definitions: [],
    recentAttempts: [],
    progress: {},
    pendingGradings: [],
    pendingSyncOps: [],
    appliedOperationIds: [],
    gamification: { xp: 0, streak: 0, lastStudyDate: null },
    preferences: { autoSpeak: false }
  };
}

function normalizeStudy(value) {
  const x = isObject(value) ? value : {};
  const base = createEmptyStudy();
  return {
    schemaVersion: STUDY_SCHEMA_VERSION,
    subjects: Array.isArray(x.subjects) && x.subjects.length ? x.subjects : base.subjects,
    genres: Array.isArray(x.genres) ? x.genres : [],
    definitions: Array.isArray(x.definitions) ? x.definitions : [],
    recentAttempts: Array.isArray(x.recentAttempts) ? x.recentAttempts : [],
    progress: isObject(x.progress) ? x.progress : {},
    pendingGradings: Array.isArray(x.pendingGradings) ? x.pendingGradings : [],
    pendingSyncOps: Array.isArray(x.pendingSyncOps) ? x.pendingSyncOps : [],
    appliedOperationIds: Array.isArray(x.appliedOperationIds) ? x.appliedOperationIds : [],
    gamification: { ...base.gamification, ...(isObject(x.gamification) ? x.gamification : {}) },
    preferences: { ...base.preferences, ...(isObject(x.preferences) ? x.preferences : {}) }
  };
}

function getRaw(storage, key) {
  return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null);
}
function setRaw(storage, key, value) {
  if (storage.setItem) storage.setItem(key, value);
  else storage.set(key, value);
}

function load(storage = globalThis.localStorage) {
  try {
    const raw = getRaw(storage, STUDY_KEY);
    return raw == null ? createEmptyStudy() : normalizeStudy(JSON.parse(raw));
  } catch (_) {
    return createEmptyStudy();
  }
}

function save(study, storage = globalThis.localStorage) {
  const normalized = pruneRecentAttempts(normalizeStudy(study));
  setRaw(storage, STUDY_KEY, JSON.stringify(normalized));
  return normalized;
}

function pruneRecentAttempts(study, max = MAX_FINALIZED_ATTEMPTS) {
  const normalized = normalizeStudy(study);
  const pending = [];
  const finalized = [];
  normalized.recentAttempts.forEach((attempt) => {
    if (attempt && attempt.grading && attempt.grading.status === 'final') finalized.push(attempt);
    else pending.push(attempt);
  });
  finalized.sort((a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')));
  const keptFinalized = finalized.slice(Math.max(0, finalized.length - Math.max(0, max))).map((attempt) => {
    if (!attempt || !Object.prototype.hasOwnProperty.call(attempt, 'gradingContext')) return attempt;
    const { gradingContext, ...rest } = attempt;
    return rest;
  });
  return { ...normalized, recentAttempts: keptFinalized.concat(pending) };
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `study-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const api = { STUDY_KEY, STUDY_SCHEMA_VERSION, MAX_FINALIZED_ATTEMPTS, DEFAULT_SUBJECTS, createEmptyStudy, normalizeStudy, load, save, pruneRecentAttempts, createId };
if (typeof window !== 'undefined') window.StudyData = api;
if (typeof module !== 'undefined') module.exports = api;
})();
