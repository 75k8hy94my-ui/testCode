(()=>{
'use strict';
const STORAGE_KEY='mangaReaderRoppoState';
const MAX_RECENT=50;
const LAW_CATALOG=Object.freeze({
'321CONSTITUTION':Object.freeze({id:'321CONSTITUTION',name:'日本国憲法',groupId:'constitutional-law',lawNumber:'昭和二十一年憲法'}),
'129AC0000000089':Object.freeze({id:'129AC0000000089',name:'民法',groupId:'civil-law',lawNumber:'明治二十九年法律第八十九号'}),
'140AC0000000045':Object.freeze({id:'140AC0000000045',name:'刑法',groupId:'criminal-law',lawNumber:'明治四十年法律第四十五号'}),
'408AC0000000109':Object.freeze({id:'408AC0000000109',name:'民事訴訟法',groupId:'civil-procedure',lawNumber:'平成八年法律第百九号'}),
'323AC0000000131':Object.freeze({id:'323AC0000000131',name:'刑事訴訟法',groupId:'criminal-procedure',lawNumber:'昭和二十三年法律第百三十一号'}),
'405AC0000000088':Object.freeze({id:'405AC0000000088',name:'行政手続法',groupId:'administrative-law',lawNumber:'平成五年法律第八十八号'}),
'337AC0000000139':Object.freeze({id:'337AC0000000139',name:'行政事件訴訟法',groupId:'administrative-law',lawNumber:'昭和三十七年法律第百三十九号'}),
'426AC0000000068':Object.freeze({id:'426AC0000000068',name:'行政不服審査法',groupId:'administrative-law',lawNumber:'平成二十六年法律第六十八号'}),
'322AC0000000125':Object.freeze({id:'322AC0000000125',name:'国家賠償法',groupId:'administrative-law',lawNumber:'昭和二十二年法律第百二十五号'}),
'417AC0000000086':Object.freeze({id:'417AC0000000086',name:'会社法',groupId:'company-law',lawNumber:'平成十七年法律第八十六号'})
});
const LAW_GROUPS=Object.freeze([
Object.freeze({id:'constitutional-law',name:'憲法',lawIds:Object.freeze(['321CONSTITUTION'])}),
Object.freeze({id:'civil-law',name:'民法',lawIds:Object.freeze(['129AC0000000089'])}),
Object.freeze({id:'criminal-law',name:'刑法',lawIds:Object.freeze(['140AC0000000045'])}),
Object.freeze({id:'civil-procedure',name:'民事訴訟法',lawIds:Object.freeze(['408AC0000000109'])}),
Object.freeze({id:'criminal-procedure',name:'刑事訴訟法',lawIds:Object.freeze(['323AC0000000131'])}),
Object.freeze({id:'administrative-law',name:'行政法',lawIds:Object.freeze(['405AC0000000088','337AC0000000139','426AC0000000068','322AC0000000125'])}),
Object.freeze({id:'company-law',name:'会社法',lawIds:Object.freeze(['417AC0000000086'])})
]);
const DEFAULT_STATE=Object.freeze({schemaVersion:2,notes:Object.freeze({}),favorites:Object.freeze([]),recent:Object.freeze([]),preferences:Object.freeze({selectedGroup:'constitutional-law',selectedLawId:'321CONSTITUTION'})});
const isObject=(v)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v)=>String(v??'').trim();
const articleStorageKey=(lawId,articleKey)=>`${text(lawId)}|${text(articleKey)}`;
const paragraphStorageKey=(lawId,articleKey,paragraphNum)=>`${articleStorageKey(lawId,articleKey)}|P_${text(paragraphNum)||'1'}`;
const validArticleKey=(value)=>typeof value==='string'&&value.split('|').length===2&&!value.startsWith('|')&&!value.endsWith('|');
const validParagraphKey=(value)=>typeof value==='string'&&/^.+\|.+\|P_[^|]+$/.test(value);
function normalizeState(value){
 const source=isObject(value)?value:{};const notes={};
 if(isObject(source.notes)){
  Object.entries(source.notes).forEach(([key,note])=>{
   if(!isObject(note)||typeof note.text!=='string'||!note.text.trim())return;
   const normalizedNote={text:note.text,updatedAt:typeof note.updatedAt==='string'?note.updatedAt:''};
   if(validParagraphKey(key)){notes[key]=normalizedNote;return;}
   if(validArticleKey(key)){const migrated=`${key}|P_1`;if(!notes[migrated])notes[migrated]=normalizedNote;}
  });
 }
 const favorites=[];const seenFavorites=new Set();
 if(Array.isArray(source.favorites))source.favorites.forEach((value)=>{if(!validArticleKey(value)||seenFavorites.has(value))return;seenFavorites.add(value);favorites.push(value);});
 const recent=[];const seenRecent=new Set();
 if(Array.isArray(source.recent))source.recent.forEach((entry)=>{if(!isObject(entry))return;const lawId=text(entry.lawId),articleKey=text(entry.articleKey);if(!LAW_CATALOG[lawId]||!articleKey)return;const key=articleStorageKey(lawId,articleKey);if(seenRecent.has(key))return;seenRecent.add(key);recent.push({lawId,articleKey,viewedAt:typeof entry.viewedAt==='string'?entry.viewedAt:''});});
 const prefs=isObject(source.preferences)?source.preferences:{};const selectedGroup=LAW_GROUPS.some((g)=>g.id===prefs.selectedGroup)?prefs.selectedGroup:DEFAULT_STATE.preferences.selectedGroup;const group=LAW_GROUPS.find((g)=>g.id===selectedGroup);const selectedLawId=group&&group.lawIds.includes(prefs.selectedLawId)?prefs.selectedLawId:group.lawIds[0];
 return{schemaVersion:2,notes,favorites,recent:recent.slice(0,MAX_RECENT),preferences:{selectedGroup,selectedLawId}};
}
function getRaw(storage,key){return storage.getItem?storage.getItem(key):(storage.get(key)??null)}
function setRaw(storage,key,value){if(storage.setItem)storage.setItem(key,value);else storage.set(key,value)}
function loadState(storage=globalThis.localStorage){try{const raw=getRaw(storage,STORAGE_KEY);return raw==null?normalizeState({}):normalizeState(JSON.parse(raw));}catch(_){return normalizeState({});}}
function saveState(value,storage=globalThis.localStorage){const normalized=normalizeState(value);setRaw(storage,STORAGE_KEY,JSON.stringify(normalized));return normalized;}
function normalizeSearchText(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[\s　]+/g,'').replace(/[（）()「」『』【】\[\]・,，.。]/g,'');}
function formatParagraphText(value){
 const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n').map((line)=>line.trim());const output=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(!line)continue;
  if(/^[一二三四五六七八九十百千]+$/.test(line)&&i+1<lines.length){let next=i+1;while(next<lines.length&&!lines[next])next++;if(next<lines.length){output.push(`${line}　${lines[next]}`);i=next;continue;}}
  output.push(line);
 }
 return output.join('\n');
}
function hideHeaderMeta(doc=globalThis.document){if(!doc)return;const sub=doc.querySelector?.('.header .sub');const dataStatus=doc.getElementById?.('dataStatus');if(sub)sub.hidden=true;if(dataStatus)dataStatus.hidden=true;}
function articleBodyText(article){return Array.isArray(article?.paragraphs)?article.paragraphs.map((p)=>p.text||'').join('\n'):String(article?.bodyText||'');}
function searchArticles(articles,query){const needle=normalizeSearchText(query);if(!needle)return Array.isArray(articles)?articles.slice():[];if(!Array.isArray(articles))return[];return articles.filter((article)=>normalizeSearchText([article.key,article.number,article.caption,articleBodyText(article)].filter(Boolean).join(' ')).includes(needle));}
function addCalendarMonth(date){const result=new Date(date.getTime()),day=result.getUTCDate();result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+1);const lastDay=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();result.setUTCDate(Math.min(day,lastDay));return result;}
function isLawDataStale(metadata,now=new Date()){const raw=metadata&&metadata.lastSyncedAt,last=raw?new Date(raw):null;if(!last||Number.isNaN(last.getTime()))return true;const current=now instanceof Date?now:new Date(now);return current.getTime()>=addCalendarMonth(last).getTime();}
const api={STORAGE_KEY,MAX_RECENT,LAW_CATALOG,LAW_GROUPS,DEFAULT_STATE,normalizeState,loadState,saveState,articleStorageKey,paragraphStorageKey,normalizeSearchText,formatParagraphText,hideHeaderMeta,articleBodyText,searchArticles,isLawDataStale};
if(typeof window!=='undefined'){window.MangaRoppo=api;hideHeaderMeta();}if(typeof module!=='undefined')module.exports=api;
})();