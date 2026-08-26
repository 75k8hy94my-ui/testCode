import test from 'node:test';
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
