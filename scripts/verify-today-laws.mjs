import fs from 'node:fs';
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
