const DATA_KEYS = {
  folders: 'mangaReaderSavedFolders', items: 'mangaReaderSavedItems', videos: 'mangaReaderVideos',
  authorCards: 'mangaReaderAuthorCards', mangaInfo: 'mangaReaderInfoCache', toc: 'mangaReaderToc',
  lastPages: 'mangaReaderLastPage', theme: 'mangaReaderTheme', dashboardVisibility: 'mangaReaderDashboardVisibility'
};
const defaultDashboardVisibility = { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false };
const defaults = { folders: [], items: [], videos: [], authorCards: [], mangaInfo: {}, toc: {}, lastPages: {}, theme: 'dark', dashboardVisibility: { mobile: { ...defaultDashboardVisibility }, desktop: { ...defaultDashboardVisibility } } };
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
function normalize(value) {
  const x = value && typeof value === 'object' ? value : {};
  return { folders: Array.isArray(x.folders) ? x.folders : [], items: Array.isArray(x.items) ? x.items : [], videos: Array.isArray(x.videos) ? x.videos : [], authorCards: Array.isArray(x.authorCards) ? x.authorCards : [], mangaInfo: isObject(x.mangaInfo), toc: isObject(x.toc), lastPages: isObject(x.lastPages), theme: x.theme === 'light' ? 'light' : 'dark', dashboardVisibility: normalizeDashboardVisibility(x.dashboardVisibility) };
}
function read(storage, key, fallback) {
  try { const raw = storage.getItem ? storage.getItem(key) : storage.get(key); return raw == null ? fallback : JSON.parse(raw); } catch (_) { return fallback; }
}
function rawValue(storage, key) { return storage.getItem ? storage.getItem(key) : (storage.get(key) ?? null); }
function setRaw(storage, key, value) { if (storage.setItem) storage.setItem(key, value); else storage.set(key, value); }
function removeRaw(storage, key) { if (storage.removeItem) storage.removeItem(key); else storage.delete(key); }
function write(storage, key, value) { setRaw(storage, key, JSON.stringify(value)); }
function buildFromStorage(storage = globalThis.localStorage) {
  return normalize({ folders: read(storage, DATA_KEYS.folders, []), items: read(storage, DATA_KEYS.items, []), videos: read(storage, DATA_KEYS.videos, []), authorCards: read(storage, DATA_KEYS.authorCards, []), mangaInfo: read(storage, DATA_KEYS.mangaInfo, {}), toc: read(storage, DATA_KEYS.toc, {}), lastPages: read(storage, DATA_KEYS.lastPages, {}), theme: storage.getItem ? storage.getItem(DATA_KEYS.theme) : (storage.get(DATA_KEYS.theme) === '"light"' ? 'light' : 'dark'), dashboardVisibility: read(storage, DATA_KEYS.dashboardVisibility, {}) });
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
