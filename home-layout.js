(()=>{
'use strict';
const PROFILE_NAMES=['mobile','tablet','desktop'];
const PROFILE_OVERRIDE_KEY='mangaReaderHomeDeviceProfileOverride';
const SIZE_NAMES=['small','medium','large'];
const DEFAULT_CARDS={
  mobile:[{id:'continue',type:'continue',size:'medium',settings:{}},{id:'today-study',type:'today-study',size:'medium',settings:{}},{id:'apps',type:'apps',size:'medium',settings:{}}],
  tablet:[{id:'continue',type:'continue',size:'large',settings:{}},{id:'today-study',type:'today-study',size:'medium',settings:{}},{id:'apps',type:'apps',size:'medium',settings:{}}],
  desktop:[{id:'apps',type:'apps',size:'medium',settings:{}},{id:'continue',type:'continue',size:'medium',settings:{}},{id:'today-study',type:'today-study',size:'medium',settings:{}}]
};
const isObject=(value)=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clone=(value)=>JSON.parse(JSON.stringify(value));
const profileName=(value)=>PROFILE_NAMES.includes(value)?value:null;
function normalizeCard(value){
  if(!isObject(value))return null;
  const id=String(value.id||'').trim(),type=String(value.type||'').trim();
  if(!id||!type)return null;
  return{id,type,size:SIZE_NAMES.includes(value.size)?value.size:'medium',settings:isObject(value.settings)?clone(value.settings):{}};
}
function defaultProfile(name){return{cards:clone(DEFAULT_CARDS[name])};}
function createDefaultHome(){return{version:1,layouts:Object.fromEntries(PROFILE_NAMES.map((name)=>[name,defaultProfile(name)]))};}
function normalizeHome(value){
  const source=isObject(value)?value:{},layouts=isObject(source.layouts)?source.layouts:{};
  const result={version:1,layouts:{}};
  for(const name of PROFILE_NAMES){
    const raw=isObject(layouts[name])?layouts[name]:null;
    if(!raw||!Array.isArray(raw.cards)){result.layouts[name]=defaultProfile(name);continue;}
    const seen=new Set(),cards=[];
    for(const item of raw.cards){const card=normalizeCard(item);if(!card||seen.has(card.id))continue;seen.add(card.id);cards.push(card);}
    result.layouts[name]={cards};
  }
  return result;
}
function assertProfile(name){if(!profileName(name))throw new Error('不明なHomeレイアウトです。');return name;}
function edit(home,name,fn){name=assertProfile(name);const next=normalizeHome(home);next.layouts[name]={cards:fn(next.layouts[name].cards.map(clone))};return normalizeHome(next);}
function addCard(home,name,instance){const card=normalizeCard(instance);if(!card)throw new Error('カード設定が正しくありません。');return edit(home,name,(cards)=>{if(cards.some((x)=>x.id===card.id))throw new Error('同じカードが既にあります。');cards.push(card);return cards;});}
function removeCard(home,name,id){return edit(home,name,(cards)=>cards.filter((x)=>x.id!==id));}
function moveCard(home,name,id,toIndex){return edit(home,name,(cards)=>{const index=cards.findIndex((x)=>x.id===id);if(index<0)return cards;const [card]=cards.splice(index,1);const target=Math.max(0,Math.min(cards.length,Number(toIndex)||0));cards.splice(target,0,card);return cards;});}
function resizeCard(home,name,id,size){if(!SIZE_NAMES.includes(size))throw new Error('不明なカードサイズです。');return edit(home,name,(cards)=>cards.map((x)=>x.id===id?{...x,size}:x));}
function updateCardSettings(home,name,id,settings){if(!isObject(settings))throw new Error('カード設定が正しくありません。');return edit(home,name,(cards)=>cards.map((x)=>x.id===id?{...x,settings:clone(settings)}:x));}
function resetProfile(home,name){name=assertProfile(name);const next=normalizeHome(home);next.layouts[name]=defaultProfile(name);return normalizeHome(next);}
function selectProfile({width,maxTouchPoints}={}){const w=Number(width)||0,touch=Number(maxTouchPoints)>0;if(w<=600)return'mobile';if(touch&&w<=1100)return'tablet';return'desktop';}
function resolveProfile({width,maxTouchPoints,override}={}){return profileName(override)||selectProfile({width,maxTouchPoints});}
const api={PROFILE_NAMES,PROFILE_OVERRIDE_KEY,SIZE_NAMES,createDefaultHome,normalizeHome,selectProfile,resolveProfile,addCard,removeCard,moveCard,resizeCard,updateCardSettings,resetProfile};
if(typeof window!=='undefined')window.MangaHomeLayout=api;
if(typeof module!=='undefined')module.exports=api;
})();
