const FORMAT = 'manga-reader-backup';
const VERSION = 2;
const DEFAULT_DASHBOARD_VISIBILITY = { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false };
const DEFAULT_HOME_CARDS = ['bookshelf', 'study', 'chat', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];
const DEFAULT_STUDY_SUBJECTS = [
  { id: 'constitutional-law', name: '憲法' }, { id: 'administrative-law', name: '行政法' },
  { id: 'civil-law', name: '民法' }, { id: 'commercial-law', name: '商法' },
  { id: 'civil-procedure', name: '民事訴訟法' }, { id: 'criminal-law', name: '刑法' },
  { id: 'criminal-procedure', name: '刑事訴訟法' }, { id: 'labor-law', name: '労働法' }
];
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
function emptyBackupStudy() {
  return {
    schemaVersion: 1,
    subjects: DEFAULT_STUDY_SUBJECTS.map((item) => ({ ...item })),
    genres: [], definitions: [], recentAttempts: [], progress: {}, pendingGradings: [], pendingSyncOps: [], appliedOperationIds: [],
    gamification: { xp: 0, streak: 0, lastStudyDate: null }, preferences: { autoSpeak: false }
  };
}
function normalizeBackupStudy(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const base = emptyBackupStudy();
  return {
    schemaVersion: 1,
    subjects: Array.isArray(source.subjects) && source.subjects.length ? source.subjects : base.subjects,
    genres: Array.isArray(source.genres) ? source.genres : [],
    definitions: Array.isArray(source.definitions) ? source.definitions : [],
    recentAttempts: Array.isArray(source.recentAttempts) ? source.recentAttempts : [],
    progress: source.progress && typeof source.progress === 'object' && !Array.isArray(source.progress) ? source.progress : {},
    pendingGradings: Array.isArray(source.pendingGradings) ? source.pendingGradings : [],
    pendingSyncOps: Array.isArray(source.pendingSyncOps) ? source.pendingSyncOps : [],
    appliedOperationIds: Array.isArray(source.appliedOperationIds) ? source.appliedOperationIds : [],
    gamification: { ...base.gamification, ...(source.gamification && typeof source.gamification === 'object' && !Array.isArray(source.gamification) ? source.gamification : {}) },
    preferences: { ...base.preferences, ...(source.preferences && typeof source.preferences === 'object' && !Array.isArray(source.preferences) ? source.preferences : {}) }
  };
}
function normalizeData(data) {
  const x = data && typeof data === 'object' ? data : {};
  return { folders: Array.isArray(x.folders) ? x.folders : [], items: Array.isArray(x.items) ? x.items : [], videos: Array.isArray(x.videos) ? x.videos : [], videoFolders: Array.isArray(x.videoFolders) ? x.videoFolders : [], videoMeta: x.videoMeta && typeof x.videoMeta === 'object' && !Array.isArray(x.videoMeta) ? x.videoMeta : {}, authorCards: Array.isArray(x.authorCards) ? x.authorCards : [], mangaInfo: x.mangaInfo && typeof x.mangaInfo === 'object' && !Array.isArray(x.mangaInfo) ? x.mangaInfo : {}, toc: x.toc && typeof x.toc === 'object' && !Array.isArray(x.toc) ? x.toc : {}, lastPages: x.lastPages && typeof x.lastPages === 'object' && !Array.isArray(x.lastPages) ? x.lastPages : {}, theme: x.theme === 'light' ? 'light' : 'dark', dashboardVisibility: normalizeBackupDashboardVisibility(x.dashboardVisibility), homeCards: Array.isArray(x.homeCards) ? x.homeCards.map((id) => String(id || '')).filter(Boolean) : DEFAULT_HOME_CARDS.slice(), study: normalizeBackupStudy(x.study) };
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
