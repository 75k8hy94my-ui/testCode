(()=>{
'use strict';
const META_KEY='testCodeChatSyncMeta';
function readMeta(storage,userId){try{const raw=storage.getItem?storage.getItem(META_KEY):storage.get(META_KEY);const all=raw?JSON.parse(raw):{};return all&&all[userId]?all[userId]:null}catch(_){return null}}
function writeMeta(storage,userId,value){let all={};try{const raw=storage.getItem?storage.getItem(META_KEY):storage.get(META_KEY);all=raw?JSON.parse(raw):{}}catch(_){all={}};all[userId]=value;if(storage.setItem)storage.setItem(META_KEY,JSON.stringify(all));else storage.set(META_KEY,JSON.stringify(all))}
function validEnvelope(value){return Boolean(value&&value.type==='testcode-chat-local'&&value.version===1&&typeof value.iv==='string'&&typeof value.ciphertext==='string')}
function conflict(){const error=new Error('別の端末でチャット履歴が更新されています。再読込してから再試行してください。');error.code='CHAT_SYNC_CONFLICT';return error}
function createClient({vault=(typeof window!=='undefined'?window.MangaVault:null),storage=globalThis.localStorage}={}){
  if(!vault||typeof vault.withSession!=='function'||typeof vault.api!=='function')throw new Error('MangaVault is required');
  async function loadRemote(){
    return vault.withSession(async(token,user)=>{
      const select=encodeURIComponent('payload,revision,updated_at');
      const rows=await vault.api('/rest/v1/chat_vaults?select='+select+'&user_id=eq.'+encodeURIComponent(user.id)+'&limit=2',{token});
      if(rows&&rows.length>1)throw new Error('このアカウントに複数のチャット保管庫があります。');
      const record=rows&&rows[0]?rows[0]:null;
      writeMeta(storage,user.id,record?{revision:Number(record.revision)||1,updatedAt:record.updated_at||null}:{revision:null,updatedAt:null});
      return record;
    });
  }
  async function saveRemote(envelope){
    if(!validEnvelope(envelope))throw new Error('暗号化されたチャットデータが必要です。');
    return vault.withSession(async(token,user)=>{
      const meta=readMeta(storage,user.id);
      if(!meta)throw new Error('チャット同期状態を確認できません。先にクラウドを読み込んでください。');
      if(meta.revision==null){
        const rows=await vault.api('/rest/v1/chat_vaults?select=revision%2Cupdated_at',{method:'POST',token,headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:user.id,payload:envelope,revision:1,updated_at:new Date().toISOString()})});
        const saved=rows&&rows[0]?rows[0]:{revision:1,updated_at:new Date().toISOString()};
        writeMeta(storage,user.id,{revision:Number(saved.revision)||1,updatedAt:saved.updated_at||null});
        return saved;
      }
      const rows=await vault.api('/rest/v1/rpc/update_chat_vault',{method:'POST',token,body:JSON.stringify({expected_revision:meta.revision,new_payload:envelope})});
      if(!rows||!rows.length)throw conflict();
      const saved=rows[0];
      writeMeta(storage,user.id,{revision:Number(saved.revision),updatedAt:saved.updated_at||null});
      return saved;
    });
  }
  return{loadRemote,saveRemote,getMeta:(userId)=>readMeta(storage,userId)};
}
const api={META_KEY,validEnvelope,createClient};
if(typeof window!=='undefined')window.ChatSync=api;
if(typeof module!=='undefined')module.exports=api;
})();
