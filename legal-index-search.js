(()=>{
'use strict';
const CLASS_RANK = Object.freeze({ exact: 0, partial: 1, and: 2, fuzzy: 3 });
const ERA_OFFSETS = Object.freeze({ 明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018, M: 1867, T: 1911, S: 1925, H: 1988, R: 2018 });
const text = (value) => String(value ?? '').trim();
const pad2 = (value) => String(Number(value)).padStart(2, '0');
function normalizeDate(value) {
  let source = text(value).normalize('NFKC');
  if (!source) return '';
  let match = source.match(/^(明治|大正|昭和|平成|令和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日?$/);
  if (match) {
    const year = match[2] === '元' ? 1 : Number(match[2]);
    return `${ERA_OFFSETS[match[1]] + year}-${pad2(match[3])}-${pad2(match[4])}`;
  }
  match = source.toUpperCase().match(/^([MTSHR])(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (match) return `${ERA_OFFSETS[match[1]] + Number(match[2])}-${pad2(match[3])}-${pad2(match[4])}`;
  match = source.match(/^(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})日?$/);
  if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
  return '';
}
function replaceDates(source) {
  let result = source.replace(/(明治|大正|昭和|平成|令和)(元|\d{1,2})年\d{1,2}月\d{1,2}日?/g, (match) => normalizeDate(match) || match);
  result = result.replace(/\b[MTSHR]\d{1,2}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/gi, (match) => normalizeDate(match) || match);
  result = result.replace(/\b\d{4}[.\/]\d{1,2}[.\/]\d{1,2}\b/g, (match) => normalizeDate(match) || match);
  return result;
}
function normalizeLegalText(value) {
  let source = text(value).normalize('NFKC');
  if (!source) return '';
  source = replaceDates(source);
  source = source
    .replace(/最大判/g, '最高裁判所 大法廷 判決')
    .replace(/最判/g, '最高裁判所 判決')
    .replace(/最決/g, '最高裁判所 決定')
    .replace(/最高裁(?!判所)/g, '最高裁判所')
    .replace(/第(?=\d+(?:条|項|号))/g, '')
    .replace(/[・･,，、:：;；/／]+/g, ' ')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
  source = source
    .replace(/\s+(?=\d+(?:条|項|号))/g, '')
    .replace(/(条|項|号)\s+(?=\d+(?:条|項|号)|$)/g, '$1');
  return source;
}
function normalizeCompact(value) {
  return normalizeLegalText(value)
    .replace(/[\s\-‐‑‒–—―・･,，、.。:：;；/／()（）\[\]［］【】「」『』]/g, '')
    .toLowerCase();
}
function structuralPart(value, unit) {
  let result = normalizeCompact(value);
  if (!result) return '';
  result = result.replace(/^第/, '');
  if (unit) result = result.replace(new RegExp(`${unit}$`), '');
  return result;
}
function caseIdentityKey(entry) {
  const court = normalizeCompact(entry && entry.court);
  const date = normalizeDate(entry && entry.date) || normalizeCompact(entry && entry.date);
  const reporter = normalizeCompact(entry && entry.reporter);
  const volume = structuralPart(entry && entry.volume, '巻');
  const issue = structuralPart(entry && entry.issue, '号');
  const reportPage = structuralPart(entry && entry.reportPage, '頁');
  if (court && date && reporter && volume && issue && reportPage) return `case:structured:${court}|${date}|${reporter}|${volume}|${issue}|${reportPage}`;
  const citation = normalizeCompact(entry && entry.citationText);
  return `case:text:${citation}`;
}
function statuteIdentityKey(entry) {
  const statute = normalizeCompact(entry && entry.statute);
  const article = structuralPart(entry && entry.article, '条');
  const paragraph = structuralPart(entry && entry.paragraph, '項');
  const item = structuralPart(entry && entry.item, '号');
  return `statute:${statute}|${article}|${paragraph}|${item}`;
}
function sourceFor(chunk, pages) {
  return {
    bookId: text(chunk.bookId),
    bookTitle: text(chunk.book && chunk.book.title),
    subjects: Array.isArray(chunk.book && chunk.book.subjects) ? chunk.book.subjects.map(text).filter(Boolean) : [],
    pages: Array.isArray(pages) ? pages.map(text).filter(Boolean) : []
  };
}
function mergeSource(group, source) {
  const existing = group.sources.find((item) => item.bookId === source.bookId);
  if (!existing) { group.sources.push(source); return; }
  const seen = new Set(existing.pages);
  source.pages.forEach((page) => { if (!seen.has(page)) { seen.add(page); existing.pages.push(page); } });
}
function addGroup(groups, { kind, identityKey, display, aliases, source }) {
  let group = groups.get(identityKey);
  if (!group) {
    const allAliases = Array.from(new Set([display, ...(aliases || [])].map(text).filter(Boolean)));
    group = {
      kind,
      identityKey,
      display: text(display),
      aliases: allAliases,
      normalizedAliases: allAliases.map(normalizeLegalText).filter(Boolean),
      compactAliases: allAliases.map(normalizeCompact).filter(Boolean),
      sources: []
    };
    groups.set(identityKey, group);
  }
  mergeSource(group, source);
}
function buildIndex(indexBookChunks) {
  const groups = new Map();
  (Array.isArray(indexBookChunks) ? indexBookChunks : []).forEach((chunk) => {
    if (!chunk || chunk.type !== 'index-book' || !chunk.bookId || !chunk.book) return;
    (Array.isArray(chunk.matterEntries) ? chunk.matterEntries : []).forEach((entry) => {
      const display = text(entry && entry.term);
      if (!display) return;
      addGroup(groups, { kind:'matter', identityKey:`matter:${normalizeCompact(display)}`, display, aliases:[display], source:sourceFor(chunk, entry.pages) });
    });
    (Array.isArray(chunk.caseEntries) ? chunk.caseEntries : []).forEach((entry) => {
      const display = text(entry && entry.citationText) || [entry.court, entry.date, entry.reporter, entry.volume, entry.issue, entry.reportPage].map(text).filter(Boolean).join(' ');
      if (!display) return;
      const structured = [entry.court, normalizeDate(entry.date) || entry.date, entry.reporter, entry.volume, entry.issue, entry.reportPage].map(text).filter(Boolean).join(' ');
      addGroup(groups, { kind:'case', identityKey:caseIdentityKey(entry), display, aliases:[display, structured], source:sourceFor(chunk, entry.pages) });
    });
    (Array.isArray(chunk.statuteEntries) ? chunk.statuteEntries : []).forEach((entry) => {
      const structured = `${text(entry.statute)}${structuralPart(entry.article,'条')}条${entry.paragraph ? `${structuralPart(entry.paragraph,'項')}項` : ''}${entry.item ? `${structuralPart(entry.item,'号')}号` : ''}`;
      const display = text(entry.citationText) || structured;
      if (!display) return;
      addGroup(groups, { kind:'statute', identityKey:statuteIdentityKey(entry), display, aliases:[display, structured], source:sourceFor(chunk, entry.pages) });
    });
  });
  return Array.from(groups.values());
}
function damerauLevenshtein(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Uint16Array(cols));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let value = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) value = Math.min(value, matrix[i - 2][j - 2] + 1);
      matrix[i][j] = value;
    }
  }
  return matrix[left.length][right.length];
}
function matchCandidate(group, query, modes) {
  const normalizedQuery = normalizeLegalText(query);
  const compactQuery = normalizeCompact(query);
  if (!compactQuery) return null;
  const normalizedAliases = group.normalizedAliases.length ? group.normalizedAliases : [normalizeLegalText(group.display)];
  const compactAliases = group.compactAliases.length ? group.compactAliases : [normalizeCompact(group.display)];
  if (modes.exact !== false && compactAliases.some((candidate) => candidate === compactQuery)) return { matchClass:'exact', score:1 };
  if (modes.partial !== false) {
    const ratios = compactAliases.filter((candidate) => candidate.includes(compactQuery)).map((candidate) => compactQuery.length / Math.max(candidate.length, 1));
    if (ratios.length) return { matchClass:'partial', score:Math.max(...ratios) };
  }
  if (modes.and !== false) {
    const tokens = normalizedQuery.split(/\s+/).map(normalizeCompact).filter(Boolean);
    if (tokens.length > 1) {
      const scores = compactAliases.filter((candidate) => tokens.every((token) => candidate.includes(token))).map((candidate) => tokens.reduce((sum, token) => sum + token.length, 0) / Math.max(candidate.length, 1));
      if (scores.length) return { matchClass:'and', score:Math.max(...scores) };
    }
  }
  if (modes.fuzzy !== false && compactQuery.length >= 3) {
    const threshold = compactQuery.length >= 8 ? 2 : 1;
    let bestDistance = Infinity;
    compactAliases.forEach((candidate) => {
      if (Math.abs(candidate.length - compactQuery.length) > threshold) return;
      bestDistance = Math.min(bestDistance, damerauLevenshtein(compactQuery, candidate));
    });
    if (bestDistance <= threshold) return { matchClass:'fuzzy', score:1 - bestDistance / Math.max(compactQuery.length, 1) };
  }
  return null;
}
function filterSources(group, subjectIds, bookIds) {
  const subjects = new Set((Array.isArray(subjectIds) ? subjectIds : []).map(text).filter(Boolean));
  const books = new Set((Array.isArray(bookIds) ? bookIds : []).map(text).filter(Boolean));
  return group.sources.filter((source) => {
    if (books.size && !books.has(source.bookId)) return false;
    if (subjects.size && !source.subjects.some((subject) => subjects.has(subject))) return false;
    return true;
  });
}
function search(index, query, options = {}) {
  if (!normalizeCompact(query)) return [];
  const kind = ['all','matter','case','statute'].includes(options.kind) ? options.kind : 'all';
  const modes = options.matchModes || { exact:true, partial:true, and:true, fuzzy:true };
  const result = [];
  (Array.isArray(index) ? index : []).forEach((group) => {
    if (kind !== 'all' && group.kind !== kind) return;
    const sources = filterSources(group, options.subjectIds, options.bookIds);
    if (!sources.length) return;
    const match = matchCandidate(group, query, modes);
    if (!match) return;
    result.push({ kind:group.kind, identityKey:group.identityKey, display:group.display, matchClass:match.matchClass, score:match.score, sources:sources.map((source)=>({ ...source, subjects:source.subjects.slice(), pages:source.pages.slice() })) });
  });
  result.sort((a,b) => CLASS_RANK[a.matchClass] - CLASS_RANK[b.matchClass] || b.score - a.score || normalizeLegalText(a.display).localeCompare(normalizeLegalText(b.display), 'ja'));
  return result;
}
const api = { normalizeDate, normalizeLegalText, normalizeCompact, caseIdentityKey, statuteIdentityKey, buildIndex, search, damerauLevenshtein };
if (typeof window !== 'undefined') window.LegalIndexSearch = api;
if (typeof module !== 'undefined') module.exports = api;
})();
