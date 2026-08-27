(()=>{
const STORAGE_KEY='mangaReaderArgumentDrafts';
const AUTOSAVE_INTERVAL_MS=3000;

function storageKey(argumentId){return argumentId?('argument:'+String(argumentId)):'new'}
function readAll(storage=globalThis.localStorage){
  try{
    const raw=storage&&storage.getItem?storage.getItem(STORAGE_KEY):null;
    const parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch(_){return{}}
}
function writeAll(value,storage=globalThis.localStorage){
  if(!storage||typeof storage.setItem!=='function')return false;
  try{storage.setItem(STORAGE_KEY,JSON.stringify(value&&typeof value==='object'?value:{}));return true}catch(_){return false}
}
function normalizeDraft(value){
  const x=value&&typeof value==='object'?value:{};
  return{
    argumentId:x.argumentId?String(x.argumentId):null,
    subjectId:String(x.subjectId||''),
    genreText:String(x.genreText||''),
    title:String(x.title||''),
    rank:String(x.rank||'B'),
    body:String(x.body||''),
    annotations:Array.isArray(x.annotations)?x.annotations.map(item=>({...item})):[],
    memo:String(x.memo||''),
    savedAt:String(x.savedAt||'')
  };
}
function load(argumentId,storage=globalThis.localStorage){
  const all=readAll(storage),value=all[storageKey(argumentId)];
  return value?normalizeDraft(value):null;
}
function save(argumentId,draft,storage=globalThis.localStorage,now=Date.now()){
  const all=readAll(storage),normalized=normalizeDraft({...draft,argumentId:argumentId||null,savedAt:new Date(now).toISOString()});
  all[storageKey(argumentId)]=normalized;
  return writeAll(all,storage)?normalized:null;
}
function remove(argumentId,storage=globalThis.localStorage){
  const all=readAll(storage),key=storageKey(argumentId);
  if(!Object.prototype.hasOwnProperty.call(all,key))return true;
  delete all[key];
  return writeAll(all,storage);
}
function clearAll(storage=globalThis.localStorage){
  if(!storage)return false;
  try{
    if(typeof storage.removeItem==='function')storage.removeItem(STORAGE_KEY);
    else if(typeof storage.delete==='function')storage.delete(STORAGE_KEY);
    else return false;
    return true;
  }catch(_){return false}
}
function fromStudy(study,argumentId){
  const records=study&&study.argumentDrafts&&typeof study.argumentDrafts==='object'?study.argumentDrafts:{};
  const record=records[storageKey(argumentId)];
  if(!record||record.deleted)return null;
  return normalizeDraft(record);
}
function shouldRestore(draft,argument){
  if(!draft)return false;
  if(!argument)return true;
  const draftTime=Date.parse(draft.savedAt||''),argumentTime=Date.parse(argument.updatedAt||argument.createdAt||'');
  if(!Number.isFinite(draftTime))return false;
  if(!Number.isFinite(argumentTime))return true;
  return draftTime>argumentTime;
}
function signature(draft){
  const x=normalizeDraft(draft);
  return JSON.stringify({
    argumentId:x.argumentId,
    subjectId:x.subjectId,
    genreText:x.genreText,
    title:x.title,
    rank:x.rank,
    body:x.body,
    annotations:x.annotations,
    memo:x.memo
  });
}

const api={STORAGE_KEY,AUTOSAVE_INTERVAL_MS,storageKey,readAll,normalizeDraft,load,save,remove,clearAll,fromStudy,shouldRestore,signature};
if(typeof window!=='undefined')window.StudyArgumentDrafts=api;
if(typeof module!=='undefined')module.exports=api;
})();
