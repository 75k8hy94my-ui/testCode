(()=>{
const StudyDataRef = typeof module !== 'undefined' && module.exports
  ? require('./study-data.js')
  : (typeof window !== 'undefined' ? window.StudyData : null);

const REVIEW_INTERVALS_MS = [86400000, 259200000, 604800000, 1209600000, 2592000000, 5184000000];
const RETRY_GAVE_UP = [3, 6];
const RETRY_MAJOR = [5, 8];
const RETRY_PARTIAL = [7, 12];
const QUIZ_KEYBOARD_STYLE = `
[hidden]{display:none!important}
body.quiz-active .quizShell{min-height:calc(var(--quiz-visual-height,100dvh) - max(18px,env(safe-area-inset-top)) - 12px)}
body.keyboard-active #studyApp{padding-top:max(8px,calc(env(safe-area-inset-top) + var(--quiz-visual-offset-top,0px)))}
body.keyboard-active .quizShell{height:calc(var(--quiz-visual-height,100dvh) - max(8px,env(safe-area-inset-top)) - 4px);min-height:0;overflow:hidden}
body.keyboard-active .quizTop{flex:0 0 auto;padding-bottom:8px}
body.keyboard-active .quizQuestion{justify-content:flex-start;min-height:0;overflow:auto;padding:0 0 8px;scroll-padding-bottom:8px;-webkit-overflow-scrolling:touch}
body.keyboard-active .lessonHero.lessonQuestion{padding:14px 15px;border-radius:18px;gap:10px}
body.keyboard-active .lessonPromptLabel{font-size:12px}
body.keyboard-active .quizTitle{font-size:clamp(26px,7vw,34px)}
body.keyboard-active .quizPrompt{font-size:14px;line-height:1.55;max-height:22vh;overflow:auto}
body.keyboard-active .quizAnswer{min-height:96px!important;max-height:22vh;padding:12px!important;font-size:16px}
body.keyboard-active .lessonFooter{flex:0 0 auto;padding-top:8px;padding-bottom:max(4px,env(safe-area-inset-bottom))}
body.keyboard-active .lessonFooter .btn{min-height:48px}
@media(max-height:520px){body.keyboard-active .lessonPromptLabel{display:none}body.keyboard-active .lessonHero.lessonQuestion{padding:11px 12px;gap:7px}body.keyboard-active .quizTitle{font-size:26px}body.keyboard-active .quizPrompt{max-height:18vh}body.keyboard-active .quizAnswer{min-height:80px!important;max-height:20vh}}
`;
let keyboardViewportInstalled = false;
let submissionUiInstalled = false;
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const makeId = () => StudyDataRef && StudyDataRef.createId ? StudyDataRef.createId() : `quiz-${Date.now()}-${Math.random()}`;
function installKeyboardViewport(){
  if(keyboardViewportInstalled||typeof window==='undefined'||typeof document==='undefined')return false;
  keyboardViewportInstalled=true;
  const win=window,doc=document,root=doc.documentElement,body=doc.body,visualViewport=win.visualViewport;
  if(!doc.getElementById('studyQuizKeyboardViewportStyles')){
    const style=doc.createElement('style');style.id='studyQuizKeyboardViewportStyles';style.textContent=QUIZ_KEYBOARD_STYLE;doc.head.appendChild(style);
  }
  const isQuizTextInput=el=>!!(el&&el.matches&&el.matches('#quizInputArea textarea,#quizInputArea input'));
  const coarsePointer=()=>{
    try{return Number(win.navigator&&win.navigator.maxTouchPoints||0)>0||!!(win.matchMedia&&win.matchMedia('(pointer: coarse)').matches)}catch(_){return false}
  };
  const syncViewport=()=>{
    const height=Math.max(1,Number(visualViewport&&visualViewport.height)||Number(win.innerHeight)||Number(root.clientHeight)||1);
    const offsetTop=Math.max(0,Number(visualViewport&&visualViewport.offsetTop)||0);
    root.style.setProperty('--quiz-visual-height',`${Math.round(height)}px`);
    root.style.setProperty('--quiz-visual-offset-top',`${Math.round(offsetTop)}px`);
    const active=isQuizTextInput(doc.activeElement),layoutHeight=Math.max(Number(win.innerHeight)||0,Number(root.clientHeight)||0),visuallyShrunk=!!visualViewport&&layoutHeight-Number(visualViewport.height||0)>80;
    body.classList.toggle('keyboard-active',active&&(coarsePointer()||visuallyShrunk));
  };
  doc.addEventListener('focusin',event=>{if(!isQuizTextInput(event.target))return;syncViewport();if(typeof win.requestAnimationFrame==='function')win.requestAnimationFrame(syncViewport);win.setTimeout(syncViewport,120)});
  doc.addEventListener('focusout',()=>win.setTimeout(syncViewport,0));
  if(visualViewport){visualViewport.addEventListener('resize',syncViewport);visualViewport.addEventListener('scroll',syncViewport)}
  win.addEventListener('resize',syncViewport);
  syncViewport();
  return true;
}
function applySubmissionState(elements,state='answering'){
  if(!elements)return false;
  const{actions,submit,giveUp,next}=elements;
  if(!actions||!submit||!giveUp||!next)return false;
  if(state==='grading'){
    actions.hidden=false;next.hidden=true;submit.disabled=true;giveUp.disabled=true;submit.textContent='採点中…';return true;
  }
  if(state==='feedback'){
    actions.hidden=true;next.hidden=false;submit.disabled=false;giveUp.disabled=false;submit.textContent='判定する';return true;
  }
  actions.hidden=false;next.hidden=true;submit.disabled=false;giveUp.disabled=false;submit.textContent='判定する';return true;
}
function installSubmissionUi(){
  if(submissionUiInstalled||typeof document==='undefined')return false;
  const doc=document,actions=doc.getElementById('quizActions'),submit=doc.getElementById('submitQuizBtn'),giveUp=doc.getElementById('giveUpBtn'),next=doc.getElementById('nextQuizBtn'),feedback=doc.getElementById('quizFeedback');
  if(!actions||!submit||!giveUp||!next||!feedback)return false;
  submissionUiInstalled=true;
  const elements={actions,submit,giveUp,next};
  const sync=()=>applySubmissionState(elements,(!next.hidden||!feedback.hidden)?'feedback':'answering');
  doc.addEventListener('click',event=>{
    const target=event.target&&event.target.closest?event.target.closest('#submitQuizBtn'):null;
    if(!target)return;
    const answer=doc.getElementById('quizTextAnswer');
    if(answer&&!String(answer.value||'').trim())return;
    if(!next.hidden||!feedback.hidden){applySubmissionState(elements,'feedback');return}
    applySubmissionState(elements,'grading');
  });
  if(typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(sync);
    observer.observe(next,{attributes:true,attributeFilter:['hidden']});
    observer.observe(feedback,{attributes:true,attributeFilter:['hidden']});
  }
  sync();
  return true;
}
function weakUnitDefaults(){return{successes:0,misses:0,wrongs:0,lastFailureAt:null}}
function createInitialProgress(definition,now=Date.now()){const weakUnits={};for(const unit of Array.isArray(definition&&definition.memoryUnits)?definition.memoryUnits:[])weakUnits[unit.id]=weakUnitDefaults();return{stage:4,stageSuccesses:0,lastStageSuccessSequence:null,masteryIndex:0,nextReviewAt:Number(now)||0,lastCompleteRecallAt:null,completeRecallSuccesses:0,almostCount:0,wrongCount:0,gaveUpCount:0,weakUnits}}
function ensureProgress(study,definition,now){const current=study.progress&&study.progress[definition.id],base=createInitialProgress(definition,now);if(!current)return base;const merged={...base,...clone(current),weakUnits:{...base.weakUnits}};for(const[id,value]of Object.entries(current.weakUnits||{}))merged.weakUnits[id]={...weakUnitDefaults(),...value};return merged}
function filterDefinitions(study,scope={mode:'all'}){const definitions=Array.isArray(study&&study.definitions)?study.definitions:[];if(!scope||scope.mode==='all')return definitions.slice();let result=definitions.filter(d=>!scope.subjectId||d.subjectId===scope.subjectId);if(Array.isArray(scope.genreIds)&&scope.genreIds.length)result=result.filter(d=>scope.genreIds.includes(d.genreId));return result}
function createSession(study,scope={mode:'all'},now=Date.now()){return{id:makeId(),scope:clone(scope),startedAt:Number(now)||Date.now(),answeredCount:0,checkpointStartProgress:clone(study.progress||{}),checkpointStartXp:Number(study.gamification&&study.gamification.xp)||0,lastDefinitionId:null,scheduledRetries:[],recentDefinitionIds:[]}}
function weakScore(progress,unitId){const u=progress.weakUnits&&progress.weakUnits[unitId]||weakUnitDefaults();return(u.misses||0)*2+(u.wrongs||0)*3-(u.successes||0)}
function chooseWeakestUnit(definition,progress){return(Array.isArray(definition.memoryUnits)?definition.memoryUnits:[]).slice().sort((a,b)=>weakScore(progress,b.id)-weakScore(progress,a.id))[0]||null}
function buildQuestion(definition,progress,sequence=1,stageOverride=null){const stage=Math.max(1,Math.min(4,stageOverride||progress.stage||4)),base={id:makeId(),definitionId:definition.id,definitionRevision:definition.contentRevision||1,prompt:definition.title||'',targetUnitIds:[],options:[],stage};if(stage===4)return{...base,kind:'full'};if(stage===3){const first=(definition.memoryUnits||[])[0];return{...base,kind:'hinted',prompt:first&&first.text?`${definition.title} — ${first.text.slice(0,Math.min(12,first.text.length))}…`:definition.title}}const target=chooseWeakestUnit(definition,progress);if(stage===2){let prompt=definition.modelText||definition.title||'',candidate=(definition.clozeCandidates||[]).find(item=>target&&item.unitId===target.id),terms=candidate&&Array.isArray(candidate.terms)?candidate.terms:target&&Array.isArray(target.importantTerms)?target.importantTerms:[];for(const term of terms)if(term)prompt=prompt.replace(term,'【　】');return{...base,kind:'cloze',prompt,targetUnitIds:target?[target.id]:[],options:terms.slice()}}const units=(definition.memoryUnits||[]).filter(u=>u&&u.text),order=Number(sequence)%2===0;return{...base,kind:order?'order':'choice',targetUnitIds:target?[target.id]:[],options:units.map(u=>u.text)}}
function updateStreak(gamification,date){const next={xp:0,streak:0,lastStudyDate:null,...(gamification||{})};if(!date||next.lastStudyDate===date)return next;if(next.lastStudyDate){const prev=Date.parse(`${next.lastStudyDate}T00:00:00Z`),cur=Date.parse(`${date}T00:00:00Z`);next.streak=Number.isFinite(prev)&&Number.isFinite(cur)&&cur-prev===86400000?(next.streak||0)+1:1}else next.streak=1;next.lastStudyDate=date;return next}
function reduceFinalAttempt(study,attempt){if(!attempt||!attempt.grading||attempt.grading.status!=='final')return clone(study);const next=StudyDataRef&&StudyDataRef.normalizeStudy?StudyDataRef.normalizeStudy(clone(study)):clone(study),definition=(next.definitions||[]).find(x=>x.id===attempt.definitionId);if(!definition)return next;const progress=ensureProgress(next,definition,Date.parse(attempt.occurredAt)||Date.now()),g=attempt.grading,result=g.result,oldWeak=clone(progress.weakUnits),recalled=new Set(g.recalledUnitIds||[]),missing=new Set(g.missingUnitIds||[]),wrong=new Set(g.wrongUnitIds||[]);for(const unit of definition.memoryUnits||[]){const s={...weakUnitDefaults(),...(progress.weakUnits[unit.id]||{})};if(recalled.has(unit.id))s.successes++;if(missing.has(unit.id)){s.misses++;s.lastFailureAt=attempt.occurredAt||new Date().toISOString()}if(wrong.has(unit.id)){s.wrongs++;s.lastFailureAt=attempt.occurredAt||new Date().toISOString()}progress.weakUnits[unit.id]=s}if(result==='correct'){const separated=progress.lastStageSuccessSequence==null||Number(attempt.sequence||0)-Number(progress.lastStageSuccessSequence)>=2;if(separated){progress.stageSuccesses=(progress.stageSuccesses||0)+1;progress.lastStageSuccessSequence=Number(attempt.sequence||0)}if(attempt.stageAtAttempt===1&&progress.stageSuccesses>=2){progress.stage=2;progress.stageSuccesses=0;progress.lastStageSuccessSequence=null}else if(attempt.stageAtAttempt===2&&progress.stageSuccesses>=2){progress.stage=3;progress.stageSuccesses=0;progress.lastStageSuccessSequence=null}else if(attempt.stageAtAttempt===3){const required=(definition.memoryUnits||[]).filter(u=>u.required!==false).map(u=>u.id);if(required.every(id=>recalled.has(id))){progress.stage=4;progress.stageSuccesses=0;progress.lastStageSuccessSequence=null}}else if(attempt.stageAtAttempt===4){progress.stage=4;progress.completeRecallSuccesses=(progress.completeRecallSuccesses||0)+1;progress.lastCompleteRecallAt=attempt.occurredAt||new Date().toISOString();progress.masteryIndex=Math.min(REVIEW_INTERVALS_MS.length-1,(progress.masteryIndex||0)+1);const at=Date.parse(attempt.occurredAt)||Date.now();progress.nextReviewAt=at+REVIEW_INTERVALS_MS[Math.min(progress.masteryIndex,REVIEW_INTERVALS_MS.length-1)]}}else if(result==='almost'){progress.almostCount=(progress.almostCount||0)+1;progress.stageSuccesses=0;progress.lastStageSuccessSequence=null;progress.stage=Math.max(1,Math.min(progress.stage||attempt.stageAtAttempt||4,(attempt.stageAtAttempt||4)-1))}else if(result==='wrong'){progress.wrongCount=(progress.wrongCount||0)+1;progress.stageSuccesses=0;progress.lastStageSuccessSequence=null;progress.stage=g.confidence==='low'?Math.max(3,(attempt.stageAtAttempt||4)-1):2}else if(result==='gave-up'){progress.gaveUpCount=(progress.gaveUpCount||0)+1;progress.stageSuccesses=0;progress.lastStageSuccessSequence=null;progress.stage=Math.min(2,progress.stage||attempt.stageAtAttempt||4)}next.progress[definition.id]=progress;let game=updateStreak(next.gamification,attempt.localStudyDate);if(result!=='gave-up')game.xp=(game.xp||0)+10;if(result==='correct')game.xp+=5;if(result==='correct'&&[...recalled].some(id=>{const p=oldWeak[id]||weakUnitDefaults();return(p.misses||0)+(p.wrongs||0)>(p.successes||0)}))game.xp+=5;next.gamification=game;return next}
function randomOffset(range,rng){return range[0]+Math.floor(Math.max(0,Math.min(.999999,Number(rng())||0))*(range[1]-range[0]+1))}
function applyOutcome(study,session,attempt,now=Date.now(),rng=Math.random){const nextStudy=attempt&&attempt.grading&&attempt.grading.status==='final'?reduceFinalAttempt(study,attempt):clone(study),nextSession=clone(session),g=attempt&&attempt.grading;if(g&&g.status==='final'){let range=null,targetStage=null;if(g.result==='gave-up'){range=RETRY_GAVE_UP;targetStage=2}else if(g.result==='wrong'&&g.confidence!=='low'){range=RETRY_MAJOR;targetStage=2}else if(g.result==='almost'||g.result==='wrong'&&g.confidence==='low'){range=RETRY_PARTIAL;targetStage=Math.max(2,(attempt.stageAtAttempt||4)-1)}if(range){nextSession.scheduledRetries=nextSession.scheduledRetries.filter(x=>x.definitionId!==attempt.definitionId);nextSession.scheduledRetries.push({definitionId:attempt.definitionId,targetStage,afterQuestion:nextSession.answeredCount+randomOffset(range,rng)})}}nextSession.answeredCount++;nextSession.lastDefinitionId=attempt.definitionId;nextSession.recentDefinitionIds.push(attempt.definitionId);nextSession.recentDefinitionIds=nextSession.recentDefinitionIds.slice(-12);return{study:nextStudy,session:nextSession}}
function nextQuestion(study,session,now=Date.now(),rng=Math.random){const definitions=filterDefinitions(study,session.scope);if(!definitions.length)return null;const retry=(session.scheduledRetries||[]).find(x=>x.afterQuestion<=session.answeredCount&&definitions.some(d=>d.id===x.definitionId));if(retry){const d=definitions.find(x=>x.id===retry.definitionId);return buildQuestion(d,ensureProgress(study,d,now),session.answeredCount+1,retry.targetStage)}const prepared=definitions.map(d=>({definition:d,progress:ensureProgress(study,d,now)}));let candidates=prepared.filter(x=>x.definition.id!==session.lastDefinitionId);if(!candidates.length)candidates=prepared;candidates.sort((a,b)=>{const da=Number(a.progress.nextReviewAt||0)<=Number(now)?1:0,db=Number(b.progress.nextReviewAt||0)<=Number(now)?1:0;if(da!==db)return db-da;const wa=Object.values(a.progress.weakUnits||{}).reduce((s,x)=>s+(x.misses||0)*2+(x.wrongs||0)*3,0),wb=Object.values(b.progress.weakUnits||{}).reduce((s,x)=>s+(x.misses||0)*2+(x.wrongs||0)*3,0);return wb-wa});const top=candidates.slice(0,Math.min(3,candidates.length)),idx=Math.floor(Math.max(0,Math.min(.999999,Number(rng())||0))*top.length),chosen=top[idx];return buildQuestion(chosen.definition,chosen.progress,session.answeredCount+1)}
function buildCheckpoint(study,session){const capabilities=[],improvements=[];for(const d of study.definitions||[]){const before=session.checkpointStartProgress&&session.checkpointStartProgress[d.id],after=study.progress&&study.progress[d.id];if(before&&after&&Number(after.stage||0)>Number(before.stage||0))capabilities.push({definitionId:d.id,title:d.title,message:'この問題が答えられるようになっています'});if(before&&after){const terms=[];for(const u of d.memoryUnits||[]){const o=before.weakUnits&&before.weakUnits[u.id]||weakUnitDefaults(),n=after.weakUnits&&after.weakUnits[u.id]||weakUnitDefaults();if((n.successes||0)>(o.successes||0)&&(o.misses||0)+(o.wrongs||0)>0)terms.push(...(u.importantTerms||[u.text]))}if(terms.length)improvements.push({definitionId:d.id,terms:[...new Set(terms)],message:'前より思い出せています'})}}return{capabilities,improvements,xpGained:Math.max(0,Number(study.gamification&&study.gamification.xp||0)-Number(session.checkpointStartXp||0)),streak:Number(study.gamification&&study.gamification.streak||0)}}
const api={REVIEW_INTERVALS_MS,RETRY_GAVE_UP,RETRY_MAJOR,RETRY_PARTIAL,createInitialProgress,filterDefinitions,createSession,buildQuestion,nextQuestion,reduceFinalAttempt,applyOutcome,buildCheckpoint,installKeyboardViewport,applySubmissionState,installSubmissionUi};
if(typeof window!=='undefined'){
  window.StudyQuiz=api;
  if(typeof document!=='undefined'){
    const installUi=()=>{installKeyboardViewport();installSubmissionUi()};
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installUi,{once:true});else installUi();
  }
}
if(typeof module!=='undefined')module.exports=api;
})();