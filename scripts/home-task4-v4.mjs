import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

let source=fs.readFileSync('scripts/home-task4.mjs','utf8');
const start=source.indexOf("write('tests/home-page.test.mjs',`");
if(start<0)throw new Error('Home page test generator start was not found');
const end=source.indexOf("`);\nif(!fs.existsSync('home.html')",start);
if(end<0)throw new Error('Home page test generator end was not found');
const safeBlock=`write('tests/home-page.test.mjs',\`import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(name)=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Home page exposes card grid, edit shell, and in-place vault gate',()=>{
  const html=read('home.html');
  for(const id of ['homeGrid','homeEditBtn','vaultGateHost','homeEditPanel','homeProfileSelect','homeStatus','recoveryContinueBtn'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const file of ['home-layout.js','home-cards.js','home-local-cards.js','vault-gate.js','home.js'])assert.ok(html.includes(file),file);
  assert.ok(html.includes('@supports not ((backdrop-filter: blur(1px))'));
  assert.equal(html.includes('id="homeHero"'),false);
});

test('Home boot uses active vault and encrypted CAS save path',()=>{
  const js=read('home.js');
  for(const text of ['MangaVault.loadActive()','MangaVault.savePayload(','750','PROFILE_OVERRIDE_KEY','updateCardSettings','moveCard','resetProfile'])assert.ok(js.includes(text),text);
});

test('new vault recovery requires explicit confirmation before dashboard',()=>{
  const html=read('home.html'),js=read('home.js');
  assert.ok(html.includes('復旧キーを保存した'));
  assert.ok(js.includes('recoveryContinueBtn'));
  assert.equal(js.includes('setTimeout(showDashboard'),false);
});
\`);`;
source=source.slice(0,start)+safeBlock+source.slice(end+3);
fs.writeFileSync('.home-task4-corrected.mjs',source);
const result=spawnSync(process.execPath,['.home-task4-corrected.mjs'],{stdio:'inherit'});
fs.rmSync('.home-task4-corrected.mjs',{force:true});
if(result.status!==0)process.exit(result.status||1);
