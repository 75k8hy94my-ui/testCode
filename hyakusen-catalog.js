(()=>{
'use strict';

const ERA_BASE = Object.freeze({ M: 1868, T: 1912, S: 1926, H: 1989, R: 2019 });
const ERA_NAMES = Object.freeze({ 明治: 'M', 大正: 'T', 昭和: 'S', 平成: 'H', 令和: 'R' });
const DEFAULT_ENTRIES = Object.freeze([]);

const text = (value) => String(value ?? '').trim();
const pad2 = (value) => String(Number(value)).padStart(2, '0');

function requiredText(value, field) {
  const out = text(value);
  if (!out) throw new Error(`${field} is required`);
  return out;
}

function positiveInteger(value, field) {
  const out = Number(value);
  if (!Number.isInteger(out) || out < 1) throw new Error(`${field} must be a positive integer`);
  return out;
}

function eraDate(era, year, month, day) {
  const key = ERA_NAMES[era] || String(era || '').toUpperCase();
  const base = ERA_BASE[key];
  const y = Number(year), m = Number(month), d = Number(day);
  if (!base || !y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${base + y - 1}-${pad2(m)}-${pad2(d)}`;
}

function gregorianDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

function normalizeDate(value) {
  const raw = text(value).normalize('NFKC');
  let match = raw.match(/^(明治|大正|昭和|平成|令和)\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (match) return eraDate(match[1], match[2], match[3], match[4]) || raw;
  match = raw.match(/^([MTSHR])\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})$/i);
  if (match) return eraDate(match[1], match[2], match[3], match[4]) || raw;
  match = raw.match(/^(\d{4})\s*(?:年|[.\/-])\s*(\d{1,2})\s*(?:月|[.\/-])\s*(\d{1,2})\s*日?$/);
  if (match) return gregorianDate(match[1], match[2], match[3]) || raw;
  return raw;
}

function replaceDates(input) {
  let value = input;
  value = value.replace(/(明治|大正|昭和|平成|令和)\s*(\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g,
    (all, era, year, month, day) => eraDate(era, year, month, day) || all);
  value = value.replace(/\b([MTSHR])\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})\s*[.\/]\s*(\d{1,2})\b/gi,
    (all, era, year, month, day) => eraDate(era, year, month, day) || all);
  value = value.replace(/\b(\d{4})\s*(?:年|[.\/])\s*(\d{1,2})\s*(?:月|[.\/])\s*(\d{1,2})\s*日?/g,
    (all, year, month, day) => gregorianDate(year, month, day) || all);
  return value;
}

function normalizeLegalText(value) {
  let out = text(value).normalize('NFKC');
  if (!out) return '';
  out = replaceDates(out);
  out = out.replace(/最高裁判所/g, '最高裁');
  out = out.replace(/最判/g, '最高裁');
  out = out.replace(/[\u3000\t\r\n]+/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function normalizeCompact(value) {
  return normalizeLegalText(value)
    .replace(/[\s・･·,，、:：;；/／.．…\-–—_()（）\[\]［］【】「」『』]/g, '');
}

function caseKey(caseEntry) {
  const source = caseEntry && typeof caseEntry === 'object' ? caseEntry : {};
  const court = normalizeCompact(requiredText(source.court, 'court'));
  const date = normalizeDate(requiredText(source.date, 'date'));
  const reporter = normalizeCompact(requiredText(source.reporter, 'reporter'));
  const volume = normalizeCompact(requiredText(source.volume, 'volume'));
  const issue = normalizeCompact(requiredText(source.issue, 'issue'));
  const reportPage = normalizeCompact(requiredText(source.reportPage, 'reportPage'));
  return `case|${court}|${date}|${reporter}|${volume}|${issue}|${reportPage}`;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('entry must be an object');
  const normalized = {
    collectionId: requiredText(entry.collectionId, 'collectionId'),
    collectionLabel: requiredText(entry.collectionLabel, 'collectionLabel'),
    shortLabel: requiredText(entry.shortLabel, 'shortLabel'),
    edition: positiveInteger(entry.edition, 'edition'),
    latestEdition: positiveInteger(entry.latestEdition, 'latestEdition'),
    number: positiveInteger(entry.number, 'number'),
    driveFileName: requiredText(entry.driveFileName, 'driveFileName'),
    case: {
      court: requiredText(entry.case && entry.case.court, 'court'),
      date: requiredText(entry.case && entry.case.date, 'date'),
      reporter: requiredText(entry.case && entry.case.reporter, 'reporter'),
      volume: requiredText(entry.case && entry.case.volume, 'volume'),
      issue: requiredText(entry.case && entry.case.issue, 'issue'),
      reportPage: requiredText(entry.case && entry.case.reportPage, 'reportPage')
    }
  };
  normalized.identityKey = caseKey(normalized.case);
  return normalized;
}

function normalizedEntries(entries = DEFAULT_ENTRIES) {
  return (Array.isArray(entries) ? entries : []).map(normalizeEntry);
}

function labelForEntry(entry) {
  const item = entry && entry.identityKey ? entry : normalizeEntry(entry);
  return item.edition === item.latestEdition
    ? `${item.shortLabel}${item.number}`
    : `${item.shortLabel}${item.edition}版${item.number}`;
}

function listingSort(a, b) {
  const latestDiff = Number(b.edition === b.latestEdition) - Number(a.edition === a.latestEdition);
  if (latestDiff) return latestDiff;
  if (b.edition !== a.edition) return b.edition - a.edition;
  const collectionDiff = a.collectionLabel.localeCompare(b.collectionLabel, 'ja');
  if (collectionDiff) return collectionDiff;
  return a.number - b.number;
}

function findListingsByIdentity(identityKey, entries = DEFAULT_ENTRIES) {
  const key = text(identityKey);
  if (!key.startsWith('case|')) return [];
  return normalizedEntries(entries).filter((entry) => entry.identityKey === key).sort(listingSort);
}

function findCaseListings(caseEntry, entries = DEFAULT_ENTRIES) {
  return findListingsByIdentity(caseKey(caseEntry), entries);
}

function primaryListingForIdentity(identityKey, entries = DEFAULT_ENTRIES) {
  return findListingsByIdentity(identityKey, entries)[0] || null;
}

function primaryListing(caseEntry, entries = DEFAULT_ENTRIES) {
  return findCaseListings(caseEntry, entries)[0] || null;
}

function primaryListingsForIdentity(identityKey, entries = DEFAULT_ENTRIES) {
  const listings = findListingsByIdentity(identityKey, entries);
  const byCollection = new Map();
  for (const listing of listings) {
    if (!byCollection.has(listing.collectionId)) byCollection.set(listing.collectionId, listing);
  }
  return [...byCollection.values()].sort((a, b) => a.collectionLabel.localeCompare(b.collectionLabel, 'ja'));
}

function collections(entries = DEFAULT_ENTRIES) {
  const grouped = new Map();
  for (const entry of normalizedEntries(entries)) {
    let item = grouped.get(entry.collectionId);
    if (!item) {
      item = {
        collectionId: entry.collectionId,
        collectionLabel: entry.collectionLabel,
        shortLabel: entry.shortLabel,
        latestEdition: entry.latestEdition,
        editions: []
      };
      grouped.set(entry.collectionId, item);
    }
    item.latestEdition = Math.max(item.latestEdition, entry.latestEdition);
    if (!item.editions.includes(entry.edition)) item.editions.push(entry.edition);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, editions: item.editions.sort((a, b) => b - a) }))
    .sort((a, b) => a.collectionLabel.localeCompare(b.collectionLabel, 'ja'));
}

function entriesForCollection(collectionId, edition, entries = DEFAULT_ENTRIES) {
  const id = text(collectionId);
  const version = Number(edition);
  return normalizedEntries(entries)
    .filter((entry) => entry.collectionId === id && entry.edition === version)
    .sort((a, b) => a.number - b.number);
}

function formatCaseCitation(caseEntry) {
  const source = caseEntry || {};
  const reporter = `${text(source.reporter)}${text(source.volume)}巻${text(source.issue)}号${text(source.reportPage)}頁`;
  return [text(source.court), text(source.date), reporter].filter(Boolean).join('・');
}

const api = {
  DEFAULT_ENTRIES,
  normalizeDate,
  normalizeCompact,
  normalizeEntry,
  caseKey,
  labelForEntry,
  findCaseListings,
  findListingsByIdentity,
  primaryListing,
  primaryListingForIdentity,
  primaryListingsForIdentity,
  collections,
  entriesForCollection,
  formatCaseCitation
};

if (typeof window !== 'undefined') window.HyakusenCatalog = api;
if (typeof self !== 'undefined' && typeof window === 'undefined') self.HyakusenCatalog = api;
if (typeof module !== 'undefined') module.exports = api;
})();
