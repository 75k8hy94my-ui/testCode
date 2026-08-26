import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=(p)=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const run=(args,expect=true)=>{const r=spawnSync(process.execPath,args,{stdio:'inherit'});if((r.status===0)!==expect)throw new Error(`unexpected result: node ${args.join(' ')}, status=${r.status}`)};
const replaceOnce=(path,from,to)=>{let s=read(path);if(s.includes(to))return;if(!s.includes(from))throw new Error(`pattern not found in ${path}: ${from.slice(0,80)}`);write(path,s.replace(from,to));};

// RED: controller contract first.
write('tests/vault-gate.test.mjs',`import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import VaultGate from '../vault-gate.js';

function fakes(initializeResult={created:false}){
  const calls=[];
  const vaultApi={
    initialize:async(passphrase,recovery,build,apply)=>{calls.push(['initialize',passphrase,recovery,build(),typeof apply]);return initializeResult;},
    initializeWithPasskey:async(apply)=>{calls.push(['passkey']);apply({folders:[{id:'remote'}]});return{created:false};},
    registerPasskey:async(value)=>{calls.push(['register',value]);}
  };
  const payloadApi={buildFromLocalStorage:()=>({home:{version:1}}),applyToLocalStorage:(value)=>calls.push(['apply',value])};
  return{calls,vaultApi,payloadApi};
}

test('unlock delegates existing vault initialize with shared payload callbacks',async()=>{
  const x=fakes(),gate=VaultGate.createController({vaultApi:x.vaultApi,payloadApi:x.payloadApi});
  assert.deepEqual(await gate.unlock({passphrase:'abcdefghijkl',recovery:'rk'}),{created:false});
  assert.deepEqual(x.calls[0].slice(0,3),['initialize','abcdefghijkl','rk']);
  assert.deepEqual(x.calls[0][3],{home:{version:1}});
});

test('passkey unlock applies decrypted payload and registration delegates once',async()=>{
  const x=fakes(),gate=VaultGate.createController({vaultApi:x.vaultApi,payloadApi:x.payloadApi});
  assert.deepEqual(await gate.unlockWithPasskey(),{created:false});
  assert.deepEqual(x.calls,[['passkey'],['apply',{folders:[{id:'remote'}]}]]);
  await gate.registerPasskey('abcdefghijkl');
  assert.deepEqual(x.calls.at(-1),['register','abcdefghijkl']);
});

test('create requires a genuinely new vault and preserves recovery code',async()=>{
  const created=fakes({created:true,recoveryCode:'mrk1_test'}),gate=VaultGate.createController({vaultApi:created.vaultApi,payloadApi:created.payloadApi});
  assert.deepEqual(await gate.create('abcdefghijkl'),{created:true,recoveryCode:'mrk1_test'});
  const existing=fakes({created:false}),existingGate=VaultGate.createController({vaultApi:existing.vaultApi,payloadApi:existing.payloadApi});
  await assert.rejects(()=>existingGate.create('abcdefghijkl'),/既に存在/);
});

test('controller has no page navigation dependency',()=>{
  const source=fs.readFileSync(new URL('../vault-gate.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\blocation\b/);
  assert.doesNotMatch(source,/document\./);
});
`);
if(!fs.existsSync('vault-gate.js'))run(['--test','tests/vault-gate.test.mjs'],false);

// GREEN: pure orchestration module, no DOM/navigation.
write('vault-gate.js',`(()=>{
'use strict';
function createController({vaultApi,payloadApi}={}){
  if(!vaultApi||typeof vaultApi.initialize!=='function'||typeof vaultApi.initializeWithPasskey!=='function'||typeof vaultApi.registerPasskey!=='function')throw new Error('Vault API is required.');
  if(!payloadApi||typeof payloadApi.buildFromLocalStorage!=='function'||typeof payloadApi.applyToLocalStorage!=='function')throw new Error('Vault payload API is required.');
  const build=payloadApi.buildFromLocalStorage,apply=payloadApi.applyToLocalStorage;
  return{
    async unlock({passphrase='',recovery=''}={}){return vaultApi.initialize(passphrase,recovery,build,apply);},
    async unlockWithPasskey(){return vaultApi.initializeWithPasskey(apply);},
    async create(passphrase){const result=await vaultApi.initialize(passphrase,'',build,apply);if(!result||result.created!==true)throw new Error('保管庫は既に存在します。');return result;},
    async registerPasskey(passphrase){await vaultApi.registerPasskey(passphrase);}
  };
}
const api={createController};
if(typeof window!=='undefined')window.MangaVaultGate=api;
if(typeof module!=='undefined')module.exports=api;
})();
`);
run(['--test','tests/vault-gate.test.mjs'],true);

// Refactor sync.html to use the controller and make Home the post-unlock destination.
replaceOnce('sync.html','<script src="vault-payload.js"></script>','<script src="vault-payload.js"></script>\n  <script src="vault-gate.js"></script>');
let sync=read('sync.html');
sync=sync.replace("    const { DATA_KEYS, buildFromLocalStorage: buildPayload, applyToLocalStorage: applyPayload } = window.MangaVaultPayload;","    const { DATA_KEYS } = window.MangaVaultPayload;\n    const vaultGate = MangaVaultGate.createController({ vaultApi: MangaVault, payloadApi: MangaVaultPayload });");
sync=sync.replace("    function goReader() { window.location.replace('reader.html'); }","    function goHome() { window.location.replace('home.html'); }");
sync=sync.replace('const result=await MangaVault.initialize(passphrase,recovery,buildPayload,applyPayload);','const result=await vaultGate.unlock({passphrase,recovery});');
sync=sync.replaceAll('setTimeout(goReader, 5500)','setTimeout(goHome, 5500)');
sync=sync.replaceAll('goReader();','goHome();');
sync=sync.replace('await MangaVault.initializeWithPasskey(applyPayload); goHome();','await vaultGate.unlockWithPasskey(); goHome();');
sync=sync.replace("const result=await MangaVault.initialize(input.passphrase,'',buildPayload,applyPayload);","const result=await vaultGate.create(input.passphrase);");
sync=sync.replace('await MangaVault.registerPasskey(input.passphrase);','await vaultGate.registerPasskey(input.passphrase);');
sync=sync.replace('数秒後に漫画リーダーを開きます。','数秒後にホームを開きます。');
write('sync.html',sync);

let regression=read('tests/static-regression.test.mjs');
if(!regression.includes("sync unlock uses shared vault gate and continues to Home"))regression+=`\n\ntest('sync unlock uses shared vault gate and continues to Home',()=>{\n  const source=read('sync.html');\n  assert.match(source,/vault-gate\\.js/);\n  assert.match(source,/MangaVaultGate\\.createController/);\n  assert.match(source,/window\\.location\\.replace\\(['\"]home\\.html['\"]\\)/);\n  assert.doesNotMatch(source,/function\\s+goReader\\s*\\(/);\n  assert.doesNotMatch(source,/MangaVault\\.initialize\\s*\\(/);\n  assert.doesNotMatch(source,/MangaVault\\.initializeWithPasskey\\s*\\(/);\n  assert.doesNotMatch(source,/MangaVault\\.registerPasskey\\s*\\(/);\n});\n`;
write('tests/static-regression.test.mjs',regression);

// Ensure static verification parses the new reusable module too.
let checker=read('scripts/check-static.mjs');
if(!checker.includes("'vault-gate.js'"))checker=checker.replace("'status-message.js', 'study-data.js'","'status-message.js', 'vault-gate.js', 'study-data.js'");
write('scripts/check-static.mjs',checker);

run(['--test','tests/vault-gate.test.mjs','tests/static-regression.test.mjs'],true);
console.log('Home core Task 2 red/green complete');
