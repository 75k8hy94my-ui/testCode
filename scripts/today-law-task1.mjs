import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const write = (file, source) => fs.writeFileSync(file, source);
const run = (args, expectSuccess = true) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if ((result.status === 0) !== expectSuccess) throw new Error('unexpected node result: ' + args.join(' ') + ' status=' + result.status);
};

write('tests/today-law-validation.test.mjs', String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRecord, validateRecords, normalizeStatutoryText, extractTextLeaves
} from '../scripts/today-law-validation.mjs';
import { buildEgovVerificationUrl } from '../scripts/verify-today-laws.mjs';

const good = {
  id: 'civil-code-94-2', subject: 'civil-law', lawName: '民法', lawId: '129AC0000000089',
  article: '94', paragraph: '2', elm: 'MainProvision-Article_94-Paragraph_2',
  text: '前項の意思表示の無効は、善意の第三者に対抗することができない。',
  story: '第三者保護の入口になる。', examPoint: '94条2項類推と接続する。', tags: ['意思表示'],
  sourceUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089', verifiedOn: '2026-08-26'
};

test('valid record passes and duplicate IDs fail', () => {
  assert.deepEqual(validateRecord(good), []);
  assert.ok(validateRecords([good, { ...good }]).some((x) => x.includes('duplicate id')));
});

test('subject-scoped expected count validates a partial corpus', () => {
  assert.deepEqual(validateRecords([good], { expectedCounts: { 'civil-law': 1 } }), []);
});

test('source text normalization removes formatting whitespace only', () => {
  assert.equal(normalizeStatutoryText('前項の意思表示の無効は、\n 善意の第三者に対抗することができない。'), good.text);
});

test('text leaves are concatenated in source order', () => {
  const value = { Sentence: ['前項の', { Ruby: ['意思表示'] }, 'の無効'] };
  assert.equal(extractTextLeaves(value), '前項の意思表示の無効');
});

test('e-Gov metadata, numbering labels, and ruby readings are not treated as statutory sentence text', () => {
  const value = {
    tag: 'Paragraph', attr: { Num: '2', WritingMode: 'vertical' },
    children: [
      { tag: 'ParagraphNum', children: ['２'] },
      { tag: 'Sentence', attr: { Num: '1' }, children: ['善意の', { tag: 'Ruby', children: ['第三者', { tag: 'Rt', children: ['だいさんしゃ'] }] }, 'を保護する。'] }
    ]
  };
  assert.equal(extractTextLeaves(value), '善意の第三者を保護する。');
});

test('invalid source, selector, tags, and date are rejected', () => {
  const bad = { ...good, elm: 'SupplProvision-Article_1', sourceUrl: 'http://example.com/law', tags: [], verifiedOn: '26-08-26' };
  const errors = validateRecord(bad).join('\n');
  assert.match(errors, /elm/);
  assert.match(errors, /sourceUrl/);
  assert.match(errors, /tags/);
  assert.match(errors, /verifiedOn/);
});

test('full corpus validation enforces exact subject counts and total', () => {
  const errors = validateRecords([good], { requireTotal: true });
  assert.ok(errors.some((x) => x.includes('total 370')));
  assert.ok(errors.some((x) => x.includes('constitutional-law')));
});

test('e-Gov verification URL targets the exact paragraph and JSON light response', () => {
  const url = buildEgovVerificationUrl(good);
  assert.ok(url.includes('/api/2/law_data/129AC0000000089'));
  assert.ok(url.includes('elm=MainProvision-Article_94-Paragraph_2'));
  assert.ok(url.includes('law_full_text_format=json'));
  assert.ok(url.includes('json_format=light'));
  assert.ok(url.includes('response_format=json'));
  assert.ok(url.includes('omit_amendment_suppl_provision=true'));
});
`);

// RED: the validator/verifier modules are deliberately absent at this point.
run(['--test', 'tests/today-law-validation.test.mjs'], false);

write('scripts/today-law-validation.mjs', String.raw`export const SUBJECT_COUNTS = Object.freeze({
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
`);

write('scripts/verify-today-laws.mjs', String.raw`import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SUBJECT_COUNTS, validateRecords, normalizeStatutoryText, extractTextLeaves } from './today-law-validation.mjs';

export function buildEgovVerificationUrl(record) {
  const params = new URLSearchParams({
    elm: record.elm,
    response_format: 'json',
    law_full_text_format: 'json',
    json_format: 'light',
    omit_amendment_suppl_provision: 'true'
  });
  return 'https://laws.e-gov.go.jp/api/2/law_data/' + encodeURIComponent(record.lawId) + '?' + params.toString();
}

function parseLawFullText(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value;
  try { return JSON.parse(trimmed); } catch (_) { return value; }
}

export async function verifyLiveRecord(record, fetchImpl = fetch) {
  const url = buildEgovVerificationUrl(record);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(record.id + ': e-Gov HTTP ' + response.status);
  const json = await response.json();
  if (!json || json.law_full_text == null) throw new Error(record.id + ': e-Gov response has no law_full_text');
  const official = normalizeStatutoryText(extractTextLeaves(parseLawFullText(json.law_full_text)));
  const local = normalizeStatutoryText(record.text);
  if (!official) throw new Error(record.id + ': e-Gov target returned no statutory text');
  if (official !== local) throw new Error(record.id + ': statutory text mismatch\nofficial: ' + official + '\nlocal: ' + local);
  return { id: record.id, url };
}

function parseArgs(argv) {
  const result = { live: false, file: '', subject: '', expected: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--live') result.live = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg === '--file') result.file = argv[++i] || '';
    else if (arg === '--subject') result.subject = argv[++i] || '';
    else if (arg === '--expected') result.expected = Number(argv[++i]);
    else throw new Error('unknown argument: ' + arg);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/verify-today-laws.mjs --file data/today-laws.json [--subject civil-law --expected 65] [--live]');
    return;
  }
  if (!args.file) throw new Error('--file is required');
  const records = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  let selected = records;
  let validationOptions = { requireTotal: true };
  if (args.subject) {
    if (!(args.subject in SUBJECT_COUNTS)) throw new Error('unknown subject: ' + args.subject);
    selected = records.filter((item) => item && item.subject === args.subject);
    const expected = Number.isFinite(args.expected) ? args.expected : SUBJECT_COUNTS[args.subject];
    validationOptions = { expectedCounts: { [args.subject]: expected } };
  }
  const errors = validateRecords(args.subject ? selected : records, validationOptions);
  if (errors.length) throw new Error(errors.join('\n'));
  if (args.live) {
    for (const record of selected) {
      await verifyLiveRecord(record);
      console.log('verified ' + record.id);
    }
  }
  console.log('verified local corpus records: ' + selected.length + (args.live ? ' (live e-Gov checked)' : ''));
}

const invoked = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invoked) main().catch((error) => { console.error(error && error.stack ? error.stack : error); process.exitCode = 1; });
`);

run(['--test', 'tests/today-law-validation.test.mjs'], true);
