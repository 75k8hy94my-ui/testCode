import { buildEgovVerificationUrl } from './verify-today-laws.mjs';
import { extractTextLeaves, normalizeStatutoryText } from './today-law-validation.mjs';

const samples = [
  { id:'constitution-13', lawId:'321CONSTITUTION', elm:'MainProvision-Article_13' },
  { id:'civil-code-94-2', lawId:'129AC0000000089', elm:'MainProvision-Article_94-Paragraph_2' }
];

for (const sample of samples) {
  const url = buildEgovVerificationUrl(sample);
  const response = await fetch(url, { headers: { accept:'application/json' } });
  console.log('===', sample.id, '===');
  console.log('status', response.status, response.statusText);
  if (!response.ok) {
    console.log((await response.text()).slice(0, 1200));
    process.exitCode = 1;
    continue;
  }
  const json = await response.json();
  console.log('top-level keys', Object.keys(json));
  console.log('law_full_text type', typeof json.law_full_text, Array.isArray(json.law_full_text) ? 'array' : '');
  let target = json.law_full_text;
  if (typeof target === 'string') {
    console.log('law_full_text string prefix', target.slice(0, 500));
    try { target = JSON.parse(target); console.log('parsed string JSON successfully'); } catch (_) { console.log('law_full_text is plain text'); }
  } else {
    console.log('law_full_text JSON prefix', JSON.stringify(target).slice(0, 1000));
  }
  console.log('extracted', normalizeStatutoryText(extractTextLeaves(target)).slice(0, 1800));
}
