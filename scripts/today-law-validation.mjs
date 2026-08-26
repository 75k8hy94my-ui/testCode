export const SUBJECT_COUNTS = Object.freeze({
  'constitutional-law': 30,
  'administrative-law': 40,
  'civil-law': 65,
  'commercial-law': 50,
  'civil-procedure': 50,
  'criminal-law': 45,
  'criminal-procedure': 50,
  'labor-law': 40
});

const SUBJECTS = new Set(Object.keys(SUBJECT_COUNTS));
const REQUIRED_NONBLANK = ['id','subject','lawName','lawId','article','elm','text','story','examPoint','sourceUrl','verifiedOn'];
const OMIT_KEYS = new Set(['attr','tag','Num']);
const OMIT_TAGS = new Set([
  'ArticleTitle','ParagraphNum','ItemTitle','PartTitle','ChapterTitle','SectionTitle','SubsectionTitle','DivisionTitle',
  'SupplProvisionLabel','TableStructTitle','FigStructTitle','Rt'
]);

function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function blank(value) { return typeof value !== 'string' || value.trim() === ''; }

export function normalizeStatutoryText(value) {
  return String(value == null ? '' : value).normalize('NFC').replace(/[\s\u3000]+/gu, '').trim();
}

export function extractTextLeaves(value) {
  function walk(node, contextKey) {
    if (typeof node === 'string') return OMIT_TAGS.has(contextKey) ? '' : node;
    if (Array.isArray(node)) return node.map((item) => walk(item, contextKey)).join('');
    if (!isObject(node)) return '';
    const tag = typeof node.tag === 'string' ? node.tag : '';
    if (OMIT_TAGS.has(tag)) return '';
    let out = '';
    for (const [key, child] of Object.entries(node)) {
      if (OMIT_KEYS.has(key)) continue;
      if (OMIT_TAGS.has(key)) continue;
      out += walk(child, key);
    }
    return out;
  }
  return walk(value, '');
}

export function validateRecord(record) {
  const errors = [];
  if (!isObject(record)) return ['record must be an object'];
  for (const key of REQUIRED_NONBLANK) if (blank(record[key])) errors.push(key + ' must be a nonblank string');
  if (typeof record.paragraph !== 'string') errors.push('paragraph must be a string');
  if (typeof record.subject === 'string' && !SUBJECTS.has(record.subject)) errors.push('subject is not supported: ' + record.subject);
  if (typeof record.lawId === 'string' && record.lawId && !/^[A-Za-z0-9_-]+$/.test(record.lawId)) errors.push('lawId is unsafe for an e-Gov path segment');
  if (typeof record.elm === 'string' && (!/^MainProvision-[A-Za-z0-9_\-\[\]]+$/.test(record.elm) || !record.elm.includes('Article'))) errors.push('elm must target a MainProvision Article/Paragraph');
  if (typeof record.sourceUrl === 'string' && record.sourceUrl) {
    try {
      const parsed = new URL(record.sourceUrl);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'laws.e-gov.go.jp') errors.push('sourceUrl must be an official HTTPS e-Gov laws URL');
    } catch (_) { errors.push('sourceUrl must be a valid official e-Gov URL'); }
  }
  if (!Array.isArray(record.tags) || !record.tags.length || record.tags.some((tag) => blank(tag))) errors.push('tags must be a nonempty array of nonblank strings');
  if (typeof record.verifiedOn === 'string' && record.verifiedOn && !/^\d{4}-\d{2}-\d{2}$/.test(record.verifiedOn)) errors.push('verifiedOn must match YYYY-MM-DD');
  return errors;
}

export function validateRecords(records, { expectedCounts = null, requireTotal = false } = {}) {
  const errors = [];
  if (!Array.isArray(records)) return ['records must be an array'];
  const seen = new Set();
  const counts = Object.fromEntries(Object.keys(SUBJECT_COUNTS).map((subject) => [subject, 0]));
  records.forEach((record, index) => {
    const label = isObject(record) && typeof record.id === 'string' && record.id ? record.id : '#' + index;
    for (const error of validateRecord(record)) errors.push(label + ': ' + error);
    if (isObject(record) && typeof record.id === 'string' && record.id) {
      if (seen.has(record.id)) errors.push('duplicate id: ' + record.id);
      seen.add(record.id);
    }
    if (isObject(record) && SUBJECTS.has(record.subject)) counts[record.subject] += 1;
  });
  const requested = requireTotal ? SUBJECT_COUNTS : expectedCounts;
  if (requested && isObject(requested)) {
    for (const [subject, expected] of Object.entries(requested)) {
      if (!SUBJECTS.has(subject)) { errors.push('unknown expected subject: ' + subject); continue; }
      if (counts[subject] !== Number(expected)) errors.push(subject + ': expected ' + Number(expected) + ', got ' + counts[subject]);
    }
  }
  if (requireTotal && records.length !== 370) errors.push('expected total 370, got ' + records.length);
  return errors;
}
