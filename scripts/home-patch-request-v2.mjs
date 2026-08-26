import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

let source = fs.readFileSync('scripts/home-patch-request.mjs', 'utf8');
const start = source.indexOf("let backupSource=read('backup-format.js');");
const endMarker = "write('backup-format.js',backupSource);";
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('backup patch block not found');
const before = source.slice(0, start);
let block = source.slice(start, end + endMarker.length);
const after = source.slice(end + endMarker.length);
block = block.replaceAll('HomeLayoutRef', 'BackupHomeLayoutRef');
source = before + block + after;
fs.writeFileSync('.home-patch-corrected.mjs', source);
const result = spawnSync(process.execPath, ['.home-patch-corrected.mjs'], { stdio: 'inherit' });
fs.rmSync('.home-patch-corrected.mjs', { force: true });
if (result.status !== 0) process.exit(result.status || 1);
