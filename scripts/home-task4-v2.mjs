import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

let source=fs.readFileSync('scripts/home-task4.mjs','utf8');
const old="  assert.match(html,/@supports not \\\\(\\\\(backdrop-filter: blur\\\\(1px\\\\)\\\\)/);";
const replacement="  assert.ok(html.includes('@supports not ((backdrop-filter: blur(1px))'));";
if(!source.includes(old))throw new Error('Task 4 test regex source was not found');
source=source.replace(old,replacement);
fs.writeFileSync('.home-task4-corrected.mjs',source);
const result=spawnSync(process.execPath,['.home-task4-corrected.mjs'],{stdio:'inherit'});
fs.rmSync('.home-task4-corrected.mjs',{force:true});
if(result.status!==0)process.exit(result.status||1);
