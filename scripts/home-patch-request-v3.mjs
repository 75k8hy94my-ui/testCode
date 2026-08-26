import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = (file) => {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};

// Re-run Task 1's verified RED -> GREEN patch sequence.
run('scripts/home-patch-request-v2.mjs');

// The study-page VM test mirrors classic-script browser loading. Once
// vault-payload.js depends on MangaHomeLayout, the harness must mirror the
// production dependency order as well.
const path = 'tests/study-page.test.mjs';
let source = fs.readFileSync(path, 'utf8');
const oldList = "['vault-payload.js','study-data.js','study-sync.js','study-quiz.js','study-audio.js','study-ai.js','study-offline.js']";
const newList = "['home-layout.js','vault-payload.js','study-data.js','study-sync.js','study-quiz.js','study-audio.js','study-ai.js','study-offline.js']";
if (!source.includes(newList)) {
  if (!source.includes(oldList)) throw new Error('study classic-script list not found');
  source = source.replaceAll(oldList, newList);
  fs.writeFileSync(path, source);
}

console.log('Task 1 patch and classic-script harness update ready for full verification');
