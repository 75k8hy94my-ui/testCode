(()=>{
'use strict';
const SCHEMA_VERSION = 1;
const text = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const uniqueTextList = (value) => {
  const seen = new Set();
  const result = [];
  value.forEach((item) => {
    const normalized = text(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};
function requiredText(value, path) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${path} is required`);
  return normalized;
}
function pageList(value, path) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${path} must be a non-empty array`);
  const result = value.map(text).filter(Boolean);
  if (!result.length) throw new Error(`${path} must contain page text`);
  return result;
}
function optionalText(value) {
  const normalized = text(value);
  return normalized || null;
}
function normalizeMatterEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`matterEntries[${index}] must be an object`);
  return {
    term: requiredText(entry.term, `matterEntries[${index}].term`),
    pages: pageList(entry.pages, `matterEntries[${index}].pages`)
  };
}
function normalizeCaseEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`caseEntries[${index}] must be an object`);
  const path = `caseEntries[${index}]`;
  const court = requiredText(entry.court, `${path}.court`);
  const date = requiredText(entry.date, `${path}.date`);
  const reporter = optionalText(entry.reporter);
  const volume = optionalText(entry.volume);
  const issue = optionalText(entry.issue);
  const reportPage = optionalText(entry.reportPage);
  const citationText = text(entry.citationText);
  const structuredReporterComplete = Boolean(reporter && volume && issue && reportPage);
  if (!structuredReporterComplete && !citationText) throw new Error(`${path}.reporter identity or citationText is required`);
  return {
    court,
    date,
    reporter,
    volume,
    issue,
    reportPage,
    citationText: citationText || [court, date, reporter, volume, issue, reportPage].filter(Boolean).join(' '),
    pages: pageList(entry.pages, `${path}.pages`)
  };
}
function normalizeStatuteEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`statuteEntries[${index}] must be an object`);
  const path = `statuteEntries[${index}]`;
  const statute = requiredText(entry.statute, `${path}.statute`);
  const article = requiredText(entry.article, `${path}.article`);
  const paragraph = optionalText(entry.paragraph);
  const item = optionalText(entry.item);
  const citationText = text(entry.citationText) || `${statute}${article}条${paragraph ? `${paragraph}項` : ''}${item ? `${item}号` : ''}`;
  return { statute, article, paragraph, item, citationText, pages: pageList(entry.pages, `${path}.pages`) };
}
function arrayField(value, path, mapper) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map(mapper);
}
function normalizeBook(value) {
  if (!isObject(value)) throw new Error('root must be an object');
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!isObject(value.book)) throw new Error('book must be an object');
  if (!Array.isArray(value.book.subjects)) throw new Error('book.subjects must be an array');
  if (value.book.authors != null && !Array.isArray(value.book.authors)) throw new Error('book.authors must be an array');
  return {
    schemaVersion: SCHEMA_VERSION,
    book: {
      title: requiredText(value.book.title, 'book.title'),
      authors: uniqueTextList(Array.isArray(value.book.authors) ? value.book.authors : []),
      subjects: uniqueTextList(value.book.subjects)
    },
    matterEntries: arrayField(value.matterEntries, 'matterEntries', normalizeMatterEntry),
    caseEntries: arrayField(value.caseEntries, 'caseEntries', normalizeCaseEntry),
    statuteEntries: arrayField(value.statuteEntries, 'statuteEntries', normalizeStatuteEntry)
  };
}
function validateBookFile(value, { fileName = '' } = {}) {
  try { return { ok: true, book: normalizeBook(value) }; }
  catch (error) { return { ok: false, error: `${fileName ? `${fileName}: ` : ''}${error && error.message ? error.message : 'invalid book file'}` }; }
}
function createIndexBookChunk(book, { bookId, chunkId } = {}) {
  const normalized = normalizeBook(book);
  const normalizedBookId = requiredText(bookId, 'bookId');
  const normalizedChunkId = requiredText(chunkId, 'chunkId');
  return {
    type: 'index-book',
    version: 1,
    bookId: normalizedBookId,
    chunkId: normalizedChunkId,
    ...JSON.parse(JSON.stringify(normalized))
  };
}
const api = { SCHEMA_VERSION, normalizeBook, validateBookFile, createIndexBookChunk };
if (typeof window !== 'undefined') window.LegalIndexSchema = api;
if (typeof module !== 'undefined') module.exports = api;
})();
