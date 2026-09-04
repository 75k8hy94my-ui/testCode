(()=>{
'use strict';

const MATCH_RANK = Object.freeze({ exact: 0, partial: 1, and: 2, fuzzy: 3 });
const ERA_BASE = Object.freeze({ M: 1868, T: 1912, S: 1926, H: 1989, R: 2019 });
const ERA_NAMES = Object.freeze({ 明治: 'M', 大正: 'T', 昭和: 'S', 平成: 'H', 令和: 'R' });

const text = (value) => String(value ?? '').trim();
const chars = (value) => Array.from(String(value ?? ''));
const pad2 = (n) => String(Number(n)).padStart(2, '0');

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
  out = out.replace(/第(?=\s*\d+\s*(?:条|項|号))/g, '');
  out = out.replace(/[\u3000\t\r\n]+/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  out = out.replace(/\s+(?=\d+\s*(?:条|項|号))/g, '');
  return out;
}

function normalizeCompact(value) {
  return normalizeLegalText(value)
    .replace(/[\s・･·,，、:：;；/／.．…\-–—_()（）\[\]［］【】「」『』]/g, '');
}

function normalizedField(value) {
  return normalizeCompact(value);
}

function caseIdentityKey(entry) {
  const court = normalizedField(entry && entry.court);
  const date = normalizeDate(entry && entry.date);
  const reporter = normalizedField(entry && entry.reporter);
  const volume = normalizedField(entry && entry.volume);
  const issue = normalizedField(entry && entry.issue);
  const reportPage = normalizedField(entry && entry.reportPage);
  if (court && date && reporter && volume && issue && reportPage) {
    return `case|${court}|${date}|${reporter}|${volume}|${issue}|${reportPage}`;
  }
  const citation = normalizeCompact(entry && entry.citationText);
  if (!citation) throw new Error('Incomplete case identity requires citationText');
  return `case-text|${citation}`;
}

function structuralNumber(value, suffix) {
  return normalizeCompact(value).replace(new RegExp(`${suffix}$`), '');
}

function statuteIdentityKey(entry) {
  const statute = normalizeCompact(entry && entry.statute);
  const article = structuralNumber(entry && entry.article, '条');
  const paragraph = structuralNumber(entry && entry.paragraph, '項');
  const item = structuralNumber(entry && entry.item, '号');
  if (!statute || !article) throw new Error('Statute identity requires statute and article');
  return `statute|${statute}|${article}|${paragraph}|${item}`;
}

function caseDisplay(entry) {
  if (text(entry.citationText)) return text(entry.citationText);
  const parts = [];
  if (entry.court) parts.push(text(entry.court));
  if (entry.date) parts.push(text(entry.date));
  const reporter = [entry.reporter, entry.volume && `${entry.volume}巻`, entry.issue && `${entry.issue}号`, entry.reportPage && `${entry.reportPage}頁`].filter(Boolean).join('');
  if (reporter) parts.push(reporter);
  return parts.join('・');
}

function statuteDisplay(entry) {
  if (text(entry.citationText)) return text(entry.citationText);
  return `${text(entry.statute)}${text(entry.article)}条${entry.paragraph ? `${text(entry.paragraph)}項` : ''}${entry.item ? `${text(entry.item)}号` : ''}`;
}

function caseAliases(entry) {
  return [
    caseDisplay(entry),
    [entry.court, entry.date, entry.reporter, entry.volume, entry.issue, entry.reportPage].filter(Boolean).join(' '),
    entry.date,
    [entry.reporter, entry.volume, entry.issue, entry.reportPage].filter(Boolean).join(' ')
  ].filter(Boolean);
}

function statuteAliases(entry) {
  return [
    statuteDisplay(entry),
    `${text(entry.statute)} ${text(entry.article)}条 ${entry.paragraph ? `${text(entry.paragraph)}項` : ''} ${entry.item ? `${text(entry.item)}号` : ''}`
  ].filter(Boolean);
}

function addSource(group, book, pages) {
  const bookId = text(book.bookId);
  let source = group.sources.find((item) => item.bookId === bookId);
  if (!source) {
    source = {
      bookId,
      bookTitle: text(book.book && book.book.title),
      subjects: Array.isArray(book.book && book.book.subjects) ? book.book.subjects.map(text).filter(Boolean) : [],
      pages: []
    };
    group.sources.push(source);
  }
  for (const page of Array.isArray(pages) ? pages : []) {
    const value = text(page);
    if (value && !source.pages.includes(value)) source.pages.push(value);
  }
}

function createGroup(kind, identityKey, display, aliases) {
  const rawAliases = [display, ...(aliases || [])].map(text).filter(Boolean);
  const normalizedAliases = [...new Set(rawAliases.map(normalizeLegalText).filter(Boolean))];
  const compactAliases = [...new Set(rawAliases.map(normalizeCompact).filter(Boolean))];
  return {
    kind,
    identityKey,
    display: text(display),
    normalized: normalizeLegalText(display),
    compact: normalizeCompact(display),
    searchAliases: normalizedAliases,
    compactAliases,
    sources: []
  };
}

function buildIndex(indexBookChunks) {
  const groups = new Map();
  const ensure = (kind, key, display, aliases) => {
    const mapKey = `${kind}:${key}`;
    if (!groups.has(mapKey)) groups.set(mapKey, createGroup(kind, key, display, aliases));
    return groups.get(mapKey);
  };
  for (const book of Array.isArray(indexBookChunks) ? indexBookChunks : []) {
    if (!book || book.type !== 'index-book') continue;
    for (const entry of Array.isArray(book.matterEntries) ? book.matterEntries : []) {
      const display = text(entry.term);
      const key = normalizeCompact(display);
      if (!key) continue;
      addSource(ensure('matter', key, display, [display]), book, entry.pages);
    }
    for (const entry of Array.isArray(book.caseEntries) ? book.caseEntries : []) {
      const display = caseDisplay(entry);
      addSource(ensure('case', caseIdentityKey(entry), display, caseAliases(entry)), book, entry.pages);
    }
    for (const entry of Array.isArray(book.statuteEntries) ? book.statuteEntries : []) {
      const display = statuteDisplay(entry);
      addSource(ensure('statute', statuteIdentityKey(entry), display, statuteAliases(entry)), book, entry.pages);
    }
  }
  return { groups: [...groups.values()] };
}

function damerauLevenshtein(a, b) {
  const x = chars(a), y = chars(b);
  const rows = x.length + 1, cols = y.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[x.length][y.length];
}

function normalizeMatchModes(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    exact: source.exact === undefined ? true : Boolean(source.exact),
    partial: source.partial === undefined ? true : Boolean(source.partial),
    and: source.and === undefined ? true : Boolean(source.and),
    fuzzy: source.fuzzy === undefined ? true : Boolean(source.fuzzy)
  };
}

function filteredSources(group, options) {
  const books = new Set(Array.isArray(options.bookIds) ? options.bookIds.map(text).filter(Boolean) : []);
  const subjects = new Set(Array.isArray(options.subjectIds) ? options.subjectIds.map(text).filter(Boolean) : []);
  return group.sources.filter((source) => {
    if (books.size && !books.has(source.bookId)) return false;
    if (subjects.size && !source.subjects.some((subject) => subjects.has(subject))) return false;
    return true;
  });
}

function fuzzyThreshold(query) {
  const length = chars(query).length;
  if (length < 3) return -1;
  return length <= 7 ? 1 : 2;
}

function classify(group, rawQuery, modes) {
  const normalizedQuery = normalizeLegalText(rawQuery);
  const compactQuery = normalizeCompact(rawQuery);
  if (!compactQuery) return null;
  const normalizedAliases = group.searchAliases;
  const compactAliases = group.compactAliases;

  if (modes.exact && normalizedAliases.some((alias) => alias === normalizedQuery)) {
    return { matchClass: 'exact', score: 4000 };
  }

  if (modes.partial) {
    let best = -1;
    for (const alias of compactAliases) {
      if (!alias.includes(compactQuery)) continue;
      const delta = Math.max(0, chars(alias).length - chars(compactQuery).length);
      best = Math.max(best, 3000 - delta);
    }
    if (best >= 0) return { matchClass: 'partial', score: best };
  }

  if (modes.and) {
    const tokens = text(rawQuery).normalize('NFKC').split(/\s+/).map(normalizeCompact).filter(Boolean);
    if (tokens.length >= 2) {
      const combined = compactAliases.join(' ');
      if (tokens.every((token) => combined.includes(token))) return { matchClass: 'and', score: 2000 + tokens.length };
    }
  }

  if (modes.fuzzy) {
    const threshold = fuzzyThreshold(compactQuery);
    if (threshold >= 0) {
      let bestDistance = Infinity;
      for (const alias of compactAliases) {
        if (Math.abs(chars(alias).length - chars(compactQuery).length) > threshold) continue;
        bestDistance = Math.min(bestDistance, damerauLevenshtein(compactQuery, alias));
      }
      if (bestDistance <= threshold) return { matchClass: 'fuzzy', score: 1000 - bestDistance };
    }
  }
  return null;
}

function hyakusenCatalog() {
  if (typeof globalThis !== 'undefined' && globalThis.HyakusenCatalog) return globalThis.HyakusenCatalog;
  if (typeof require === 'function') {
    try { return require('./hyakusen-catalog.js'); } catch (_) {}
  }
  return null;
}

function annotateCaseDisplay(identityKey, display, entries) {
  if (!text(identityKey).startsWith('case|')) return text(display);
  const catalog = hyakusenCatalog();
  if (!catalog || typeof catalog.primaryListingsForIdentity !== 'function' || typeof catalog.labelForEntry !== 'function') return text(display);
  const listings = catalog.primaryListingsForIdentity(identityKey, entries);
  if (!listings.length) return text(display);
  const labels = listings.map((entry) => catalog.labelForEntry(entry));
  return `${text(display)}　${labels.map((label) => `［${label}］`).join('')}`;
}

function search(index, query, options = {}) {
  const kind = ['all', 'matter', 'case', 'statute'].includes(options.kind) ? options.kind : 'all';
  const modes = normalizeMatchModes(options.matchModes);
  if (!normalizeCompact(query)) return [];
  const results = [];
  for (const group of index && Array.isArray(index.groups) ? index.groups : []) {
    if (kind !== 'all' && group.kind !== kind) continue;
    const sources = filteredSources(group, options);
    if (!sources.length) continue;
    const match = classify(group, query, modes);
    if (!match) continue;
    results.push({
      kind: group.kind,
      display: group.display,
      identityKey: group.identityKey,
      matchClass: match.matchClass,
      score: match.score,
      sources: sources.map((source) => ({ ...source, subjects: source.subjects.slice(), pages: source.pages.slice() }))
    });
  }
  results.sort((a, b) => {
    const classDiff = MATCH_RANK[a.matchClass] - MATCH_RANK[b.matchClass];
    if (classDiff) return classDiff;
    if (b.score !== a.score) return b.score - a.score;
    return normalizeLegalText(a.display).localeCompare(normalizeLegalText(b.display), 'ja');
  });
  for (const result of results) {
    if (result.kind === 'case') result.display = annotateCaseDisplay(result.identityKey, result.display, options.hyakusenEntries);
  }
  return results;
}

function installHyakusenBrowserIntegration() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const installLink = () => {
    if (document.getElementById('openHyakusenBtn')) return;
    const actions = document.querySelector('.topbar .actions');
    if (!actions) return;
    const link = document.createElement('a');
    link.id = 'openHyakusenBtn';
    link.href = 'hyakusen.html';
    link.className = 'glassBtn';
    link.textContent = '判例百選';
    link.style.display = 'inline-flex';
    link.style.alignItems = 'center';
    link.style.textDecoration = 'none';
    actions.append(link);
  };

  if (!window.HyakusenCatalog && !document.querySelector('script[data-hyakusen-catalog]')) {
    const script = document.createElement('script');
    script.src = 'hyakusen-catalog.js';
    script.dataset.hyakusenCatalog = 'true';
    script.addEventListener('load', () => {
      const query = document.getElementById('indexQuery');
      if (query && query.value.trim()) query.dispatchEvent(new Event('input', { bubbles: true }));
    });
    document.head.append(script);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installLink, { once: true });
  else installLink();
}

const api = {
  normalizeLegalText,
  normalizeCompact,
  normalizeDate,
  caseIdentityKey,
  statuteIdentityKey,
  buildIndex,
  search,
  annotateCaseDisplay,
  damerauLevenshtein
};
if (typeof window !== 'undefined') {
  window.LegalIndexSearch = api;
  installHyakusenBrowserIntegration();
}
if (typeof module !== 'undefined') module.exports = api;
})();