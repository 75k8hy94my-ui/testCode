(()=>{
'use strict';
const isHost=(host)=>!!host&&typeof host==='object'&&'textContent' in host;
function createRegistry(){
  const definitions=new Map();
  function register(definition){
    if(!definition||typeof definition!=='object')throw new Error('カード定義が正しくありません。');
    const type=String(definition.type||'').trim(),title=String(definition.title||'').trim();
    if(!type||!title||!Array.isArray(definition.allowedSizes)||!definition.allowedSizes.length||typeof definition.render!=='function')throw new Error('カード定義が正しくありません。');
    if(definitions.has(type))throw new Error('このカード種類は既に登録されています。');
    definitions.set(type,{...definition,type,title,allowedSizes:definition.allowedSizes.slice()});
    return definitions.get(type);
  }
  const get=(type)=>definitions.get(String(type||''))||null;
  const list=()=>Array.from(definitions.values());
  async function render({instance,host,context}={}){
    if(!isHost(host))throw new Error('カード表示先が必要です。');
    const definition=get(instance&&instance.type);
    if(!definition){host.textContent='このカードは現在利用できません';return;}
    try{await definition.render({host,instance,context:context||{}});}catch(_){host.textContent='カードを読み込めませんでした';}
  }
  async function renderSettings({instance,host,context,updateSettings}={}){
    if(!isHost(host))throw new Error('設定表示先が必要です。');
    const definition=get(instance&&instance.type);
    if(!definition){host.textContent='このカードは現在利用できません';return;}
    if(typeof definition.renderSettings!=='function'){host.textContent='このカードに設定項目はありません';return;}
    try{await definition.renderSettings({host,instance,context:context||{},updateSettings});}catch(_){host.textContent='設定を読み込めませんでした';}
  }
  return{register,get,list,render,renderSettings};
}
const api={createRegistry};
if(typeof window!=='undefined')window.MangaHomeCards=api;
if(typeof module!=='undefined')module.exports=api;
})();
