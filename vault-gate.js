(()=>{
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
