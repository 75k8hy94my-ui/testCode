import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

let source=fs.readFileSync('scripts/home-task4.mjs','utf8');
const marker='  assert.match(html,/@supports not ';
const start=source.indexOf(marker);
if(start<0)throw new Error('Home fallback assertion start was not found');
const lineEnd=source.indexOf('\n',start);
if(lineEnd<0)throw new Error('Home fallback assertion line end was not found');
source=source.slice(0,start)+"  assert.ok(html.includes('@supports not ((backdrop-filter: blur(1px))'));"+source.slice(lineEnd);
fs.writeFileSync('.home-task4-corrected.mjs',source);
const result=spawnSync(process.execPath,['.home-task4-corrected.mjs'],{stdio:'inherit'});
fs.rmSync('.home-task4-corrected.mjs',{force:true});
if(result.status!==0)process.exit(result.status||1);
