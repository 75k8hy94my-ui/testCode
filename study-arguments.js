(()=>{
const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_RANKS = new Set(['A','B','C']);
const VALID_STATUSES = new Set(['new','learning','memorized','review']);
const MARKER_COLORS = ['pink','green','orange','yellow','blue'];
const MARKER_MODES = ['full','low'];
const VALID_ARGUMENT_STYLES = new Set([
  ...MARKER_COLORS.flatMap((color)=>MARKER_MODES.map((mode)=>`marker-${color}-${mode}`)),
  'underline-red','underline-black'
]);

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

function styleGroup(style){
  if(String(style).startsWith('marker-'))return'marker';
  if(String(style).startsWith('underline-'))return'underline';
  return'';
}
function normalizeAnnotations(value,textLength=Number.MAX_SAFE_INTEGER){
  if(!Array.isArray(value))return[];
  const max=Number.isFinite(textLength)?Math.max(0,Math.floor(textLength)):Number.MAX_SAFE_INTEGER;
  return value.map((item)=>{
    const start=Math.max(0,Math.min(max,Math.floor(Number(item&&item.start))));
    const end=Math.max(0,Math.min(max,Math.floor(Number(item&&item.end))));
    const style=String(item&&item.style||'');
    return{start,end,style};
  }).filter((item)=>VALID_ARGUMENT_STYLES.has(item.style)&&Number.isFinite(item.start)&&Number.isFinite(item.end)&&item.end>item.start)
    .sort((a,b)=>a.start-b.start||a.end-b.end||a.style.localeCompare(b.style));
}
function mergeAnnotations(value){
  const list=normalizeAnnotations(value);
  const merged=[];
  for(const item of list){
    const previous=merged[merged.length-1];
    if(previous&&previous.style===item.style&&item.start<=previous.end){previous.end=Math.max(previous.end,item.end)}
    else merged.push({...item});
  }
  return merged;
}
function subtractRange(item,start,end){
  if(item.end<=start||item.start>=end)return[{...item}];
  const out=[];
  if(item.start<start)out.push({...item,end:start});
  if(item.end>end)out.push({...item,start:end});
  return out;
}
function applyStyle(annotations,start,end,style,textLength){
  if(!VALID_ARGUMENT_STYLES.has(style))return normalizeAnnotations(annotations,textLength);
  const max=Math.max(0,Number.isFinite(textLength)?Math.floor(textLength):Number.MAX_SAFE_INTEGER);
  const a=Math.max(0,Math.min(max,Math.floor(Number(start))));
  const b=Math.max(0,Math.min(max,Math.floor(Number(end))));
  if(!(b>a))return normalizeAnnotations(annotations,max);
  const group=styleGroup(style),out=[];
  for(const item of normalizeAnnotations(annotations,max)){
    if(styleGroup(item.style)===group)out.push(...subtractRange(item,a,b));
    else out.push(item);
  }
  out.push({start:a,end:b,style});
  return mergeAnnotations(out);
}
function clearStyles(annotations,start,end,textLength){
  const max=Math.max(0,Number.isFinite(textLength)?Math.floor(textLength):Number.MAX_SAFE_INTEGER);
  const a=Math.max(0,Math.min(max,Math.floor(Number(start))));
  const b=Math.max(0,Math.min(max,Math.floor(Number(end))));
  if(!(b>a))return normalizeAnnotations(annotations,max);
  return mergeAnnotations(normalizeAnnotations(annotations,max).flatMap((item)=>subtractRange(item,a,b)));
}
function transformAnnotationsForTextChange(oldText,newText,annotations){
  const oldValue=String(oldText??''),nextValue=String(newText??'');
  if(oldValue===nextValue)return normalizeAnnotations(annotations,nextValue.length);
  let prefix=0;
  while(prefix<oldValue.length&&prefix<nextValue.length&&oldValue[prefix]===nextValue[prefix])prefix+=1;
  let suffix=0;
  while(suffix<oldValue.length-prefix&&suffix<nextValue.length-prefix&&oldValue[oldValue.length-1-suffix]===nextValue[nextValue.length-1-suffix])suffix+=1;
  const oldEnd=oldValue.length-suffix,delta=nextValue.length-oldValue.length,out=[];
  for(const item of normalizeAnnotations(annotations,oldValue.length)){
    if(item.end<=prefix){out.push(item);continue}
    if(item.start>=oldEnd){out.push({...item,start:item.start+delta,end:item.end+delta});continue}
    if(item.start<prefix)out.push({...item,end:prefix});
    if(item.end>oldEnd)out.push({...item,start:oldEnd+delta,end:item.end+delta});
  }
  return mergeAnnotations(normalizeAnnotations(out,nextValue.length));
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function styleClass(style){return`argument-${style}`}
function renderAnnotatedHtml(text,annotations){
  const value=String(text??''),marks=normalizeAnnotations(annotations,value.length);
  if(!value)return'';
  const points=new Set([0,value.length]);
  marks.forEach((item)=>{points.add(item.start);points.add(item.end)});
  const sorted=[...points].sort((a,b)=>a-b);
  let html='';
  for(let i=0;i<sorted.length-1;i+=1){
    const start=sorted[i],end=sorted[i+1];
    if(end<=start)continue;
    const escaped=escapeHtml(value.slice(start,end)).replace(/\n/g,'<br>');
    const active=marks.filter((item)=>item.start<=start&&item.end>=end).map((item)=>styleClass(item.style));
    html+=active.length?`<span class="${active.join(' ')}">${escaped}</span>`:escaped;
  }
  return html;
}

const api={DAY_MS,MARKER_COLORS,MARKER_MODES,VALID_ARGUMENT_STYLES,normalizeRank,normalizeProgress,progressFor,markProgress,isDue,filterArguments,summarize,styleGroup,normalizeAnnotations,applyStyle,clearStyles,transformAnnotationsForTextChange,renderAnnotatedHtml};
if(typeof window!=='undefined')window.StudyArguments=api;
if(typeof module!=='undefined')module.exports=api;
})();
