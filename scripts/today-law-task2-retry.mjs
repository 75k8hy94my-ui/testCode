import fs from 'node:fs';

await import('./today-law-task2.mjs');

const file = 'tests/today-law-validation.test.mjs';
let source = fs.readFileSync(file, 'utf8');
const before = "normalizeStatutoryText('前項の意思表示の無効は、\\n 善意の第三者に対抗することができない。')";
const after = "normalizeStatutoryText('前項の規定による意思表示の無効は、\\n 善意の第三者に対抗することができない。')";
if (!source.includes(before)) throw new Error('formatted Civil Code 94(2) fixture was not found');
source = source.replace(before, after);
fs.writeFileSync(file, source);
console.log('corrected formatted Civil Code 94(2) normalization fixture');
