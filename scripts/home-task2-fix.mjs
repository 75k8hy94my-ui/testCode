import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const read=(p)=>fs.readFileSync(p,'utf8'),write=(p,s)=>fs.writeFileSync(p,s);
const run=(args,expect=true)=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if((r.status===0)!==expect)throw new Error(`unexpected result: ${args.join(' ')} status=${r.status}`)};

let test=read('tests/static-regression.test.mjs');
if(!test.includes("sync contains no obsolete goReader reference"))test+=`\n\ntest('sync contains no obsolete goReader reference',()=>{\n  assert.doesNotMatch(read('sync.html'),/\\bgoReader\\b/);\n});\n`;
write('tests/static-regression.test.mjs',test);

// Reproduce the exact stale-reference defect before fixing it.
run(['--test','tests/static-regression.test.mjs'],false);

let sync=read('sync.html');
if(!/setTimeout\(goReader\s*,\s*5500\)/.test(sync))throw new Error('expected stale goReader timeout was not found');
sync=sync.replace(/setTimeout\(goReader\s*,\s*5500\)/g,'setTimeout(goHome,5500)');
write('sync.html',sync);

run(['--test','tests/static-regression.test.mjs'],true);
console.log('vault creation Home-route regression fixed');
