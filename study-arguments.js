(()=>{
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_RANKS = new Set(['A','B','C']);
const VALID_STATUSES = new Set(['new','learning','memorized','review']);
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

function normalizeRank(value){const rank=String(value||'').toUpperCase();return VALID_RANKS.has(rank)?rank:'B'}
function normalizeProgress(value){
  const x=value&&typeof value==='object'?value:{};
  const status=VALID_STATUSES.has(x.status)?x.status:'new';
  return {status,lastReviewedAt:x.lastReviewedAt||null,nextReviewAt:x.nextReviewAt||null};
}
function progressFor(study,argumentId){return normalizeProgress(study&&study.argumentProgress&&study.argumentProgress[argumentId])}
function markProgress(previous,status,now=Date.now()){
  const current=normalizeProgress(previous),nextStatus=VALID_STATUSES.has(status)?status:'new',iso=new Date(now).toISOString();
  if(nextStatus==='memorized')return{status:'memorized',lastReviewedAt:iso,nextReviewAt:new Date(now+7*DAY_MS).toISOString()};
  if(nextStatus==='learning')return{status:'learning',lastReviewedAt:iso,nextReviewAt:new Date(now+DAY_MS).toISOString()};
  if(nextStatus==='review')return{status:'review',lastReviewedAt:current.lastReviewedAt,nextReviewAt:iso};
  return{status:'new',lastReviewedAt:current.lastReviewedAt,nextReviewAt:null};
}
function isDue(progress,now=Date.now()){
  const p=normalizeProgress(progress);
  if(p.status==='review')return true;
  if(!p.nextReviewAt||p.status==='new')return false;
  const due=Date.parse(p.nextReviewAt);
  return Number.isFinite(due)&&due<=now;
}
function filterArguments(study,filters={},now=Date.now()){
  const list=Array.isArray(study&&study.arguments)?study.arguments:[];
  const progress=study&&study.argumentProgress&&typeof study.argumentProgress==='object'?study.argumentProgress:{};
  const rankOrder={A:0,B:1,C:2};
  return list.filter((argument)=>{
    const p=normalizeProgress(progress[argument.id]);
    if(filters.subjectId&&argument.subjectId!==filters.subjectId)return false;
    if(filters.genreId&&argument.genreId!==filters.genreId)return false;
    if(filters.rank&&normalizeRank(argument.rank)!==filters.rank)return false;
    if(filters.status&&p.status!==filters.status)return false;
    if(filters.dueOnly&&!isDue(p,now))return false;
    return true;
  }).slice().sort((a,b)=>(rankOrder[normalizeRank(a.rank)]-rankOrder[normalizeRank(b.rank)])||String(a.title||'').localeCompare(String(b.title||''),'ja'));
}
function summarize(study,now=Date.now()){
  const list=Array.isArray(study&&study.arguments)?study.arguments:[];
  let memorized=0,due=0;
  for(const argument of list){const p=progressFor(study,argument.id);if(p.status==='memorized')memorized+=1;if(isDue(p,now))due+=1}
  return{total:list.length,memorized,due};
}

const api={DAY_MS,normalizeRank,normalizeProgress,progressFor,markProgress,isDue,filterArguments,summarize};
if(typeof window!=='undefined')window.StudyArguments=api;
if(typeof module!=='undefined')module.exports=api;
})();
