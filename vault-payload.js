const DATA_KEYS = {
  folders: 'mangaReaderSavedFolders', items: 'mangaReaderSavedItems', videos: 'mangaReaderVideos', videoFolders: 'mangaReaderVideoFolders', videoMeta: 'mangaReaderVideoMeta',
  authorCards: 'mangaReaderAuthorCards', mangaInfo: 'mangaReaderInfoCache', toc: 'mangaReaderToc',
  lastPages: 'mangaReaderLastPage', theme: 'mangaReaderTheme', dashboardVisibility: 'mangaReaderDashboardVisibility',
  homeCards: 'mangaReaderHomeCards', study: 'mangaReaderStudy'
};
const defaultDashboardVisibility = { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false };
const defaultHomeCards = ['bookshelf', 'study', 'chat', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];
const defaultStudySubjects = [
  { id: 'constitutional-law', name: '憲法' }, { id: 'administrative-law', name: '行政法' },
  { id: 'civil-law', name: '民法' }, { id: 'commercial-law', name: '商法' },
  { id: 'civil-procedure', name: '民事訴訟法' }, { id: 'criminal-law', name: '刑法' },
  { id: 'criminal-procedure', name: '刑事訴訟法' }, { id: 'labor-law', name: '労働法' }
];
const createEmptyStudy = () => ({
  schemaVersion: 1,
  subjects: defaultStudySubjects.map((item) => ({ ...item })),
  genres: [], definitions: [], arguments: [], argumentDrafts: {}, argumentProgress: {}, recentAttempts: [], progress: {}, pendingGradings: [], pendingSyncOps: [], appliedOperationIds: [],
  gamification: { xp: 0, streak: 0, lastStudyDate: null }, preferences: { autoSpeak: false }
});
const defaults = { folders: [], items: [], videos: [], videoFolders: [], videoMeta: {}, authorCards: [], mangaInfo: {}, toc: {}, lastPages: {}, theme: 'dark', dashboardVisibility: { mobile: { ...defaultDashboardVisibility }, desktop: { ...defaultDashboardVisibility } }, homeCards: defaultHomeCards.slice(), study: createEmptyStudy() };
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const normalizeDashboardProfile = (value) => {
  const result = { ...defaultDashboardVisibility };
  const source = isObject(value);
  Object.keys(result).forEach((key) => { if (typeof source[key] === 'boolean') result[key] = source[key]; });
  return result;
};
const normalizeDashboardVisibility = (value) => {
  const source = isObject(value);
  if (source.mobile && source.desktop) return { mobile: normalizeDashboardProfile(source.mobile), desktop: normalizeDashboardProfile(source.desktop) };
  return { mobile: normalizeDashboardProfile(), desktop: normalizeDashboardProfile() };
};
const normalizeHomeCards = (value) => Array.isArray(value) ? value.map((id) => String(id || '')).filter(Boolean) : defaultHomeCards.slice();
function normalizeStudyForVault(value) {
  const x = isObject(value);
  const base = createEmptyStudy();
  return {
    schemaVersion: 1,
    subjects: Array.isArray(x.subjects) && x.subjects.length ? x.subjects : base.subjects,
    genres: Array.isArray(x.genres) ? x.genres : [],
    definitions: Array.isArray(x.definitions) ? x.definitions : [],
    arguments: Array.isArray(x.arguments) ? x.arguments : [],
    argumentDrafts: isObject(x.argumentDrafts),
    argumentProgress: isObject(x.argumentProgress),
    recentAttempts: Array.isArray(x.recentAttempts) ? x.recentAttempts : [],
    progress: isObject(x.progress),
    pendingGradings: Array.isArray(x.pendingGradings) ? x.pendingGradings : [],
    pendingSyncOps: Array.isArray(x.pendingSyncOps) ? x.pendingSyncOps : [],
    appliedOperationIds: Array.isArray(x.appliedOperationIds) ? x.appliedOperationIds : [],
    gamification: { ...base.gamification, ...isObject(x.gamification) },
    preferences: { ...base.preferences, ...isObject(x.preferences) }
  };
}
function normalize(value) {
  const x = value && typeof value === 'object' ? value : {};
  return { folders: Array.isArray(x.folders) ? x.folders : [], items: Array.isArray(x.items) ? x.items : [], videos: Array.isArray(x.videos) ? x.videos : [], videoFolders: Array.isArray(x.videoFolders) ? x.videoFolders : [], videoMeta: isObject(x.videoMeta), authorCards: Array.isArray(x.authorCards) ? x.authorCards : [], mangaInfo: isObject(x.mangaInfo), toc: isObject(x.toc), lastPages: isObject(x.lastPages), theme: x.theme === 'light' ? 'light' : 'dark', dashboardVisibility: normalizeDashboardVisibility(x.dashboardVisibility), homeCards: normalizeHomeCards(x.homeCards), study: normalizeStudyForVault(x.study) };
}
function read(storage, key, fallback) {
  try { const raw = storage.getItem ? storage.getItem(key) : storage.get(key); return raw == null ? fallback : JSON.parse(raw); } catch (_) { return fallback; }
}
function rawValue(storage, key) { return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null); }
function setRaw(storage, key, value) { if (storage.setItem) storage.setItem(key, value); else storage.set(key, value); }
function removeRaw(storage, key) { if (storage.removeItem) storage.removeItem(key); else storage.delete(key); }
function write(storage, key, value) { setRaw(storage, key, JSON.stringify(value)); }
function buildFromStorage(storage = globalThis.localStorage) {
  return normalize({ folders: read(storage, DATA_KEYS.folders, []), items: read(storage, DATA_KEYS.items, []), videos: read(storage, DATA_KEYS.videos, []), videoFolders: read(storage, DATA_KEYS.videoFolders, []), videoMeta: read(storage, DATA_KEYS.videoMeta, {}), authorCards: read(storage, DATA_KEYS.authorCards, []), mangaInfo: read(storage, DATA_KEYS.mangaInfo, {}), toc: read(storage, DATA_KEYS.toc, {}), lastPages: read(storage, DATA_KEYS.lastPages, {}), theme: storage.getItem ? storage.getItem(DATA_KEYS.theme) : (storage.get(DATA_KEYS.theme) === '"light"' ? 'light' : 'dark'), dashboardVisibility: read(storage, DATA_KEYS.dashboardVisibility, {}), homeCards: read(storage, DATA_KEYS.homeCards, defaultHomeCards), study: read(storage, DATA_KEYS.study, {}) });
}
function applyToStorage(payload, storage = globalThis.localStorage) {
  const data = normalize(payload);
  const snapshot = new Map(Object.values(DATA_KEYS).map((key) => [key, rawValue(storage, key)]));
  try {
    Object.entries(DATA_KEYS).forEach(([name, key]) => write(storage, key, data[name]));
    return data;
  } catch (error) {
    snapshot.forEach((value, key) => { try { if (value == null) removeRaw(storage, key); else setRaw(storage, key, value); } catch (_) {} });
    throw error;
  }
}
function clearDeviceData(storage = globalThis.localStorage) { Object.values(DATA_KEYS).forEach((key) => { if (storage.removeItem) storage.removeItem(key); else storage.delete(key); }); }
const api = { DATA_KEYS, defaults, normalize, buildFromLocalStorage: buildFromStorage, applyToLocalStorage: applyToStorage, clearDeviceData };
if (typeof window !== 'undefined') window.MangaVaultPayload = api;
if (typeof module !== 'undefined') module.exports = api;
