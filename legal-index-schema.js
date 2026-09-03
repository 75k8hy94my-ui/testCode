(()=>{
'use strict';
const SCHEMA_VERSION = 1;
const text = (value) => String(value ?? '').trim();
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function requiredText(value, path) {
  const out = text(value);
  if (!out) throw new Error(`${path} is required`);
  return out;
}

function nullableText(value) {
  const out = text(value);
  return out || null;
}

function stringArray(value, path, { required = false } = {}) {
  if (value == null && !required) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map(text).filter(Boolean);
}

function normalizePages(value, path) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${path} must be a non-empty array`);
  const out = value.map(text).filter(Boolean);
  if (!out.length) throw new Error(`${path} must contain page text`);
  return out;
}

function normalizeMatterEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`matterEntries[${index}] must be an object`);
  return {
    term: requiredText(entry.term, `matterEntries[${index}].term`),
    pages: normalizePages(entry.pages, `matterEntries[${index}].pages`)
  };
}

function normalizeCaseEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`caseEntries[${index}] must be an object`);
  const path = `caseEntries[${index}]`;
  const date = requiredText(entry.date, `${path}.date`);
  const court = nullableText(entry.court);
  const reporter = nullableText(entry.reporter);
  const volume = nullableText(entry.volume);
  const issue = nullableText(entry.issue);
  const reportPage = nullableText(entry.reportPage);
  const citationText = nullableText(entry.citationText);
  const hasStructuredIdentity = Boolean(court && reporter && volume && issue && reportPage);
  if (!hasStructuredIdentity && !citationText) throw new Error(`${path}.citationText is required when reporter identity is incomplete`);
  return {
    court,
    date,
    reporter,
    volume,
    issue,
    reportPage,
    citationText,
    pages: normalizePages(entry.pages, `${path}.pages`)
  };
}

function normalizeStatuteEntry(entry, index) {
  if (!isObject(entry)) throw new Error(`statuteEntries[${index}] must be an object`);
  const path = `statuteEntries[${index}]`;
  return {
    statute: requiredText(entry.statute, `${path}.statute`),
    article: requiredText(entry.article, `${path}.article`),
    paragraph: nullableText(entry.paragraph),
    item: nullableText(entry.item),
    citationText: nullableText(entry.citationText),
    pages: normalizePages(entry.pages, `${path}.pages`)
  };
}

function normalizeEntryArray(value, path, mapper) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map(mapper);
}

function normalizeBook(value) {
  if (!isObject(value)) throw new Error('root must be an object');
  if (Number(value.schemaVersion) !== SCHEMA_VERSION) throw new Error(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!isObject(value.book)) throw new Error('book must be an object');
  const book = {
    title: requiredText(value.book.title, 'book.title'),
    authors: stringArray(value.book.authors, 'book.authors'),
    subjects: stringArray(value.book.subjects, 'book.subjects', { required: true })
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    book,
    matterEntries: normalizeEntryArray(value.matterEntries, 'matterEntries', normalizeMatterEntry),
    caseEntries: normalizeEntryArray(value.caseEntries, 'caseEntries', normalizeCaseEntry),
    statuteEntries: normalizeEntryArray(value.statuteEntries, 'statuteEntries', normalizeStatuteEntry)
  };
}

function validateBookFile(value, { fileName = '' } = {}) {
  try {
    return { ok: true, book: normalizeBook(value) };
  } catch (error) {
    const prefix = text(fileName);
    return { ok: false, error: `${prefix ? `${prefix}: ` : ''}${error && error.message ? error.message : 'invalid book file'}` };
  }
}

function createIndexBookChunk(value, { bookId, chunkId } = {}) {
  const normalized = normalizeBook(value);
  const normalizedBookId = requiredText(bookId, 'bookId');
  const normalizedChunkId = requiredText(chunkId, 'chunkId');
  return {
    type: 'index-book',
    version: 1,
    bookId: normalizedBookId,
    chunkId: normalizedChunkId,
    ...normalized
  };
}

const api = { SCHEMA_VERSION, normalizeBook, validateBookFile, createIndexBookChunk };
if (typeof window !== 'undefined') window.LegalIndexSchema = api;
if (typeof module !== 'undefined') module.exports = api;
})();
