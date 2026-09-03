(()=>{
'use strict';

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

const text = (value) => String(value ?? '').trim();
const isBackupObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function normalizeBackupDashboardProfile(value) {
  const source = isBackupObject(value) ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_DASHBOARD_VISIBILITY).map((key) => [key, typeof source[key] === 'boolean' ? source[key] : DEFAULT_DASHBOARD_VISIBILITY[key]]));
}
function normalizeBackupDashboardVisibility(value) {
  const source = isBackupObject(value) ? value : {};
  return source.mobile && source.desktop
    ? { mobile: normalizeBackupDashboardProfile(source.mobile), desktop: normalizeBackupDashboardProfile(source.desktop) }
    : { mobile: normalizeBackupDashboardProfile(), desktop: normalizeBackupDashboardProfile() };
}
function normalizeBackupStringArray(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}
function normalizeBackupIndexSearchSettings(value) {
  const source = isBackupObject(value) ? value : {};
  const modes = isBackupObject(source.matchModes) ? source.matchModes : {};
  const allowedKinds = new Set(['all', 'matter', 'case', 'statute']);
  return {
    matchModes: {
      exact: modes.exact === undefined ? true : Boolean(modes.exact),
      partial: modes.partial === undefined ? true : Boolean(modes.partial),
      and: modes.and === undefined ? true : Boolean(modes.and),
      fuzzy: modes.fuzzy === undefined ? true : Boolean(modes.fuzzy)
    },
    activeKind: allowedKinds.has(source.activeKind) ? source.activeKind : 'all',
    selectedSubjects: normalizeBackupStringArray(source.selectedSubjects),
    selectedBookIds: normalizeBackupStringArray(source.selectedBookIds)
  };
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
  const source = isBackupObject(value) ? value : {};
  const base = emptyBackupStudy();
  return {
    schemaVersion: 1,
    subjects: Array.isArray(source.subjects) && source.subjects.length ? source.subjects : base.subjects,
    genres: Array.isArray(source.genres) ? source.genres : [],
    definitions: Array.isArray(source.definitions) ? source.definitions : [],
    recentAttempts: Array.isArray(source.recentAttempts) ? source.recentAttempts : [],
    progress: isBackupObject(source.progress) ? source.progress : {},
    pendingGradings: Array.isArray(source.pendingGradings) ? source.pendingGradings : [],
    pendingSyncOps: Array.isArray(source.pendingSyncOps) ? source.pendingSyncOps : [],
    appliedOperationIds: Array.isArray(source.appliedOperationIds) ? source.appliedOperationIds : [],
    gamification: { ...base.gamification, ...(isBackupObject(source.gamification) ? source.gamification : {}) },
    preferences: { ...base.preferences, ...(isBackupObject(source.preferences) ? source.preferences : {}) }
  };
}
function normalizeData(data) {
  const x = isBackupObject(data) ? data : {};
  return {
    folders: Array.isArray(x.folders) ? x.folders : [], items: Array.isArray(x.items) ? x.items : [], videos: Array.isArray(x.videos) ? x.videos : [],
    videoFolders: Array.isArray(x.videoFolders) ? x.videoFolders : [], videoMeta: isBackupObject(x.videoMeta) ? x.videoMeta : {}, authorCards: Array.isArray(x.authorCards) ? x.authorCards : [],
    mangaInfo: isBackupObject(x.mangaInfo) ? x.mangaInfo : {}, toc: isBackupObject(x.toc) ? x.toc : {}, lastPages: isBackupObject(x.lastPages) ? x.lastPages : {},
    theme: x.theme === 'light' ? 'light' : 'dark', dashboardVisibility: normalizeBackupDashboardVisibility(x.dashboardVisibility),
    homeCards: Array.isArray(x.homeCards) ? x.homeCards.map((id) => text(id)).filter(Boolean) : DEFAULT_HOME_CARDS.slice(),
    study: normalizeBackupStudy(x.study),
    indexSearchSettings: normalizeBackupIndexSearchSettings(x.indexSearchSettings)
  };
}

function normalizeStringArray(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw new Error(`index book ${field} must be an array`);
  const result = value.map(text).filter(Boolean);
  if (!allowEmpty && !result.length) throw new Error(`index book ${field} must not be empty`);
  return result;
}
function normalizePages(value, field) {
  return normalizeStringArray(value, field, { allowEmpty: false });
}
function normalizeMatterEntry(entry, index) {
  if (!isBackupObject(entry)) throw new Error(`index book matterEntries[${index}] is invalid`);
  const term = text(entry.term);
  if (!term) throw new Error(`index book matterEntries[${index}].term is required`);
  return { term, pages: normalizePages(entry.pages, `matterEntries[${index}].pages`) };
}
function normalizeCaseEntry(entry, index) {
  if (!isBackupObject(entry)) throw new Error(`index book caseEntries[${index}] is invalid`);
  const result = {
    court: text(entry.court), date: text(entry.date), reporter: text(entry.reporter), volume: text(entry.volume), issue: text(entry.issue), reportPage: text(entry.reportPage),
    citationText: text(entry.citationText), pages: normalizePages(entry.pages, `caseEntries[${index}].pages`)
  };
  if (!result.date) throw new Error(`index book caseEntries[${index}].date is required`);
  const structured = result.court && result.reporter && result.volume && result.issue && result.reportPage;
  if (!structured && !result.citationText) throw new Error(`index book caseEntries[${index}] requires structured citation or citationText`);
  return result;
}
function normalizeStatuteEntry(entry, index) {
  if (!isBackupObject(entry)) throw new Error(`index book statuteEntries[${index}] is invalid`);
  const result = {
    statute: text(entry.statute), article: text(entry.article), paragraph: text(entry.paragraph), item: text(entry.item), citationText: text(entry.citationText),
    pages: normalizePages(entry.pages, `statuteEntries[${index}].pages`)
  };
  if (!result.statute) throw new Error(`index book statuteEntries[${index}].statute is required`);
  if (!result.article) throw new Error(`index book statuteEntries[${index}].article is required`);
  return result;
}
function normalizePortableIndexBook(value) {
  if (!isBackupObject(value)) throw new Error('index book is invalid');
  if (Number(value.schemaVersion) !== 1) throw new Error('index book schemaVersion is unsupported');
  if (!isBackupObject(value.book)) throw new Error('index book book is required');
  const title = text(value.book.title);
  if (!title) throw new Error('index book book.title is required');
  const authors = value.book.authors == null ? [] : normalizeStringArray(value.book.authors, 'book.authors');
  const subjects = normalizeStringArray(value.book.subjects, 'book.subjects');
  const matterEntries = value.matterEntries == null ? [] : value.matterEntries;
  const caseEntries = value.caseEntries == null ? [] : value.caseEntries;
  const statuteEntries = value.statuteEntries == null ? [] : value.statuteEntries;
  if (!Array.isArray(matterEntries) || !Array.isArray(caseEntries) || !Array.isArray(statuteEntries)) throw new Error('index book entry lists must be arrays');
  return {
    schemaVersion: 1,
    book: { title, authors, subjects },
    matterEntries: matterEntries.map(normalizeMatterEntry),
    caseEntries: caseEntries.map(normalizeCaseEntry),
    statuteEntries: statuteEntries.map(normalizeStatuteEntry)
  };
}
function normalizeIndexBooks(value) {
  if (!Array.isArray(value)) throw new Error('indexBooks must be an array');
  return value.map(normalizePortableIndexBook);
}

function createBackup(data, exportedAt = new Date().toISOString(), indexBooks = []) {
  return { format: FORMAT, version: VERSION, exportedAt, data: normalizeData(data), indexBooks: normalizeIndexBooks(indexBooks) };
}
function migrateBackupPackage(input) {
  if (input && input.format === FORMAT) {
    if (input.version === 2) return { data: normalizeData(input.data), indexBooks: [] };
    if (input.version === VERSION) return { data: normalizeData(input.data), indexBooks: normalizeIndexBooks(input.indexBooks ?? []) };
    throw new Error('対応していないバックアップ形式です。');
  }
  return { data: normalizeData(input), indexBooks: [] };
}
function migrateBackup(input) {
  return migrateBackupPackage(input).data;
}
const backupApi = { FORMAT, VERSION, normalizeData, normalizePortableIndexBook, normalizeIndexBooks, createBackup, migrateBackupPackage, migrateBackup };
if (typeof window !== 'undefined') window.MangaReaderBackup = backupApi;
if (typeof module !== 'undefined') module.exports = backupApi;
})();
