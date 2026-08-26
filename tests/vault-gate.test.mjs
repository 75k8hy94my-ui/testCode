import test from 'node:test';
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
  assert.doesNotMatch(source,/location/);
  assert.doesNotMatch(source,/document./);
});
