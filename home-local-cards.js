(()=>{
'use strict';
const HISTORY_FOLDER_ID='__history__';
const array=(value)=>Array.isArray(value)?value:[];
const object=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
function getTodayStudyModel(study,now=Date.now()){
  const value=object(study),progress=object(value.progress),definitions=array(value.definitions),time=Number(now)||0;
  const dueCount=definitions.filter((definition)=>{const p=progress[definition&&definition.id];return !p||Number(p.nextReviewAt||0)<=time;}).length;
  const game=object(value.gamification);
  return{dueCount,streak:Number(game.streak)||0,xp:Number(game.xp)||0,lastStudyDate:typeof game.lastStudyDate==='string'?game.lastStudyDate:null};
}
function getContinueModel({items,study,localReaderEnabled=true}={}){
  const candidates=array(items).filter((item)=>item&&item.folderId!==HISTORY_FOLDER_ID&&!(localReaderEnabled===false&&item.localSync===true)&&(Number(item.lastReadAt)||0)>0).sort((a,b)=>(Number(b.lastReadAt)||0)-(Number(a.lastReadAt)||0));
  const hasStudy=!!(study&&typeof study==='object'&&(array(study.definitions).length||array(study.recentAttempts).length||object(study.gamification).lastStudyDate));
  return{book:candidates[0]||null,study:hasStudy?getTodayStudyModel(study,Date.now()):null};
}
function clear(host){if(typeof host.replaceChildren==='function')host.replaceChildren();else host.textContent='';}
function element(tag,text,className){const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node;}
function link(label,href){const a=element('a',label,'homeCardLink');a.href=href;return a;}
function registerLocalCards(registry){
  registry.register({type:'continue',title:'続きから',allowedSizes:['small','medium','large'],render({host,context}){
    clear(host);const model=getContinueModel({items:context.items,study:context.study,localReaderEnabled:context.localReaderEnabled});
    if(model.book){const title=String(model.book.title||'続きから読む');host.appendChild(link(title,'reader.html?item='+encodeURIComponent(String(model.book.id||''))));}
    else host.appendChild(element('p','最近読んだ本はありません','homeCardEmpty'));
    const studyModel=getTodayStudyModel(context.study,Date.now());
    const summary=element('p',`復習 ${studyModel.dueCount}件 ・ ${studyModel.streak}日連続 ・ ${studyModel.xp} XP`,'homeCardMeta');host.appendChild(summary);host.appendChild(link('司法試験学習を開く','study.html'));
  }});
  registry.register({type:'apps',title:'アプリ',allowedSizes:['small','medium','large'],render({host}){
    clear(host);const nav=element('nav',null,'homeAppLinks');for(const [label,href] of [['本棚','reader.html#screen=saved-list'],['司法試験学習','study.html'],['同期・保管庫','sync.html']])nav.appendChild(link(label,href));host.appendChild(nav);
  }});
  registry.register({type:'today-study',title:'今日の学習',allowedSizes:['small','medium','large'],render({host,context}){
    clear(host);const model=getTodayStudyModel(context.study,Date.now());host.appendChild(element('strong',`復習 ${model.dueCount}件`,'homeStudyDue'));host.appendChild(element('p',`${model.streak}日連続 ・ ${model.xp} XP`,'homeCardMeta'));if(model.lastStudyDate)host.appendChild(element('p','最終学習 '+model.lastStudyDate,'homeCardMeta'));host.appendChild(link('学習を始める','study.html'));
  }});
}
const api={HISTORY_FOLDER_ID,getContinueModel,getTodayStudyModel,registerLocalCards};
if(typeof window!=='undefined')window.MangaHomeLocalCards=api;
if(typeof module!=='undefined')module.exports=api;
})();
