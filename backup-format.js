const FORMAT = 'manga-reader-backup';
const VERSION = 2;
const DEFAULT_DASHBOARD_VISIBILITY = { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false };
function normalizeBackupDashboardProfile(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_DASHBOARD_VISIBILITY).map((key) => [key, typeof source[key] === 'boolean' ? source[key] : DEFAULT_DASHBOARD_VISIBILITY[key]]));
}
function normalizeBackupDashboardVisibility(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return source.mobile && source.desktop
    ? { mobile: normalizeBackupDashboardProfile(source.mobile), desktop: normalizeBackupDashboardProfile(source.desktop) }
    : { mobile: normalizeBackupDashboardProfile(), desktop: normalizeBackupDashboardProfile() };
}
function normalizeData(data) {
  const x = data && typeof data === 'object' ? data : {};
  return { folders: Array.isArray(x.folders) ? x.folders : [], items: Array.isArray(x.items) ? x.items : [], videos: Array.isArray(x.videos) ? x.videos : [], authorCards: Array.isArray(x.authorCards) ? x.authorCards : [], mangaInfo: x.mangaInfo && typeof x.mangaInfo === 'object' && !Array.isArray(x.mangaInfo) ? x.mangaInfo : {}, toc: x.toc && typeof x.toc === 'object' && !Array.isArray(x.toc) ? x.toc : {}, lastPages: x.lastPages && typeof x.lastPages === 'object' && !Array.isArray(x.lastPages) ? x.lastPages : {}, theme: x.theme === 'light' ? 'light' : 'dark', dashboardVisibility: normalizeBackupDashboardVisibility(x.dashboardVisibility) };
}
function createBackup(data, exportedAt = new Date().toISOString()) { return { format: FORMAT, version: VERSION, exportedAt, data: normalizeData(data) }; }
function migrateBackup(input) {
  if (input && input.format === FORMAT) {
    if (input.version !== VERSION) throw new Error('対応していないバックアップ形式です。');
    return normalizeData(input.data);
  }
  return normalizeData(input);
}
const backupApi = { FORMAT, VERSION, normalizeData, createBackup, migrateBackup };
if (typeof window !== 'undefined') window.MangaReaderBackup = backupApi;
if (typeof module !== 'undefined') module.exports = backupApi;
