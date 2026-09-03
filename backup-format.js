const FORMAT = 'manga-reader-backup';
const VERSION = 3;
const DEFAULT_DASHBOARD_VISIBILITY = { continue: false, 'recent-added': false, 'recent-read': false, unread: false, random: false, favorites: false };
const DEFAULT_HOME_CARDS = ['bookshelf', 'index-search', 'study', 'quiz', 'links', 'egov', 'courts', 'moj-exam'];
const DEFAULT_INDEX_SEARCH_SETTINGS = { matchModes: { exact: true, partial: true, and: true, fuzzy: true }, activeKind: 'all', selectedSubjects: [], selectedBookIds: [] };
const DEFAULT_STUDY_SUBJECTS = [
  { id: 'constitutional-law', name: '憲法' }, { id: 'administrative-law', name: '行政法' },
  { id: 'civil-law', name: '民法' }, { id: 'commercial-law', name: '商法' },
  { id: 'civil-procedure', name: '民事訴訟法' }, { id: 'criminal-law', name: '刑法' },
  { id: 'criminal-procedure', name: '刑事訴訟法' }, { id: 'labor-law', name: '労働法' }
];
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? '').trim();
const textList = (value) => Array.isArray(value) ? Array.from(new Set(value.map(text).filter(Boolean))) : [];
function normalizeBackupDashboardProfile(value) {
  const source = isObject(value);
  return Object.fromEntries(Object.keys(DEFAULT_DASHBOARD_VISIBILITY).map((key) => [key, typeof source[key] === 'boolean' ? source[key] : DEFAULT_DASHBOARD_VISIBILITY[key]]));
}
function normalizeBackupDashboardVisibility(value) {
  const source = isObject(value);
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
  const source = isObject(value);
  const base = emptyBackupStudy();
  return {
    schemaVersion: 1,
    subjects: Array.isArray(source.subjects) && source.subjects.length ? source.subjects : base.subjects,
    genres: Array.isArray(source.genres) ? source.genres : [],
    definitions: Array.isArray(source.definitions) ? source.definitions : [],
    recentAttempts: Array.isArray(source.recentAttempts) ? source.recentAttempts : [],
    progress: isObject(source.progress),
    pendingGradings: Array.isArray(source.pendingGradings) ? source.pendingGradings : [],
    pendingSyncOps: Array.isArray(source.pendingSyncOps) ? source.pendingSyncOps : [],
    appliedOperationIds: Array.isArray(source.appliedOperationIds) ? source.appliedOperationIds : [],
    gamification: { ...base.gamification, ...isObject(source.gamification) },
    preferences: { ...base.preferences, ...isObject(source.preferences) }
  };
}
function normalizeIndexSearchSettings(value) {
  const source = isObject(value), modes = isObject(source.matchModes);
  const kinds = new Set(['all', 'matter', 'case', 'statute']);
  return {
    matchModes: {
      exact: typeof modes.exact === 'boolean' ? modes.exact : true,
      partial: typeof modes.partial === 'boolean' ? modes.partial : true,
      and: typeof modes.and === 'boolean' ? modes.and : true,
      fuzzy: typeof modes.fuzzy === 'boolean' ? modes.fuzzy : true
    },
    activeKind: kinds.has(source.activeKind) ? source.activeKind : 'all',
    selectedSubjects: textList(source.selectedSubjects),
    selectedBookIds: textList(source.selectedBookIds)
  };
}
function normalizePages(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function normalizePortableIndexBook(value) {
  const source = isObject(value), book = isObject(source.book);
  if (source.schemaVersion !== 1 || !text(book.title)) throw new Error('索引書籍のバックアップ形式が正しくありません。');
  return {
    schemaVersion: 1,
    book: { title: text(book.title), authors: textList(book.authors), subjects: textList(book.subjects) },
    matterEntries: (Array.isArray(source.matterEntries) ? source.matterEntries : []).map((entry) => ({ term: text(entry && entry.term), pages: normalizePages(entry && entry.pages) })),
    caseEntries: (Array.isArray(source.caseEntries) ? source.caseEntries : []).map((entry) => ({
      court: text(entry && entry.court), date: text(entry && entry.date), reporter: text(entry && entry.reporter) || null,
      volume: text(entry && entry.volume) || null, issue: text(entry && entry.issue) || null, reportPage: text(entry && entry.reportPage) || null,
      citationText: text(entry && entry.citationText), pages: normalizePages(entry && entry.pages)
    })),
    statuteEntries: (Array.isArray(source.statuteEntries) ? source.statuteEntries : []).map((entry) => ({
      statute: text(entry && entry.statute), article: text(entry && entry.article), paragraph: text(entry && entry.paragraph) || null,
      item: text(entry && entry.item) || null, citationText: text(entry && entry.citationText), pages: normalizePages(entry && entry.pages)
    }))
  };
}
function normalizeIndexBooks(value) { return Array.isArray(value) ? value.map(normalizePortableIndexBook) : []; }
function normalizeData(data) {
  const x = isObject(data);
  return {
    folders: Array.isArray(x.folders) ? x.folders : [], items: Array.isArray(x.items) ? x.items : [], videos: Array.isArray(x.videos) ? x.videos : [],
    videoFolders: Array.isArray(x.videoFolders) ? x.videoFolders : [], videoMeta: isObject(x.videoMeta), authorCards: Array.isArray(x.authorCards) ? x.authorCards : [],
    mangaInfo: isObject(x.mangaInfo), toc: isObject(x.toc), lastPages: isObject(x.lastPages), theme: x.theme === 'light' ? 'light' : 'dark',
    dashboardVisibility: normalizeBackupDashboardVisibility(x.dashboardVisibility), homeCards: Array.isArray(x.homeCards) ? x.homeCards.map((id) => String(id || '')).filter(Boolean) : DEFAULT_HOME_CARDS.slice(),
    study: normalizeBackupStudy(x.study), indexSearchSettings: normalizeIndexSearchSettings(x.indexSearchSettings)
  };
}
function createBackup(data, exportedAt = new Date().toISOString(), indexBooks = []) {
  return { format: FORMAT, version: VERSION, exportedAt, data: normalizeData(data), indexBooks: normalizeIndexBooks(indexBooks) };
}
function migrateBackup(input) {
  if (input && input.format === FORMAT) {
    if (input.version === VERSION) return { ...normalizeData(input.data), indexBooks: normalizeIndexBooks(input.indexBooks) };
    if (input.version === 2) return { ...normalizeData(input.data), indexBooks: [] };
    throw new Error('対応していないバックアップ形式です。');
  }
  return { ...normalizeData(input), indexBooks: [] };
}
const backupApi = { FORMAT, VERSION, normalizeData, normalizeIndexBooks, createBackup, migrateBackup };
if (typeof window !== 'undefined') window.MangaReaderBackup = backupApi;
if (typeof module !== 'undefined') module.exports = backupApi;
