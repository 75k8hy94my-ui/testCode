/* Official FSRS v6 adapter using ts-fsrs 5.4.2, UMD bundle built from npm.
 * Legacy review events are replayed through the library on first use.
 * No approximate scheduler is used if the official dependency fails to load.
 */
(function(root){
'use strict';
const DEFAULT_WEIGHTS=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];
const validWeights=x=>Array.isArray(x)&&x.length===21&&x.every(v=>Number.isFinite(v)&&v>0&&v<100);
const retention=x=>Number.isFinite(x)&&x>=0.7&&x<=0.97?x:0.9;
const sdk=()=> {
 const library=root.FSRS;
 if(!library || typeof library.fsrs!=='function' || typeof library.createEmptyCard!=='function')
   throw Error('公式ts-fsrsライブラリが読み込まれていません。');
 return library;
};
const createScheduler=(options={})=>sdk().fsrs({
 request_retention:retention(options.retention),
 enable_fuzz:true,enable_short_term:true,maximum_interval:36500,
 learning_steps:['1m','10m'],relearning_steps:['10m'],
 ...(validWeights(options.weights)?{w:options.weights}:{})
});
function events(record){
 const list=Array.isArray(record?.reviews)?record.reviews:[];
 return list.filter(e=>e&&Number.isFinite(e.at)&&Number.isInteger(e.grade)&&e.grade>=0&&e.grade<=3)
  .sort((a,b)=>a.at-b.at);
}
function serialize(card){
 return {...card,due:card.due.getTime(),last_review:card.last_review?.getTime()??null};
}
function deserialize(raw){
 if(!raw || typeof raw!=='object' || !Number.isFinite(raw.due))return null;
 return {...raw,due:new Date(raw.due),last_review:Number.isFinite(raw.last_review)?new Date(raw.last_review):undefined};
}
function replay(record,scheduler){
 const library=sdk(),list=events(record);
 let card=library.createEmptyCard(list.length?new Date(list[0].at):new Date());
 for(const event of list)card=scheduler.next(card,new Date(event.at),event.grade+1).card;
 return card;
}
function schedule(previous,grade,now=Date.now(),options={}){
 if(!Number.isInteger(grade)||grade<0||grade>3||!Number.isFinite(now))throw Error('Invalid FSRS review');
 const p=previous&&typeof previous==='object'?previous:{};
 const engine=createScheduler(options);
 let card=p.algorithm==='ts-fsrs-v6'?deserialize(p.fsrsCard):null;
 if(!card)card=replay(p,engine);
 const reviewed=engine.next(card,new Date(now),grade+1).card;
 const saved=serialize(reviewed);
 return {...p,algorithm:'ts-fsrs-v6',stability:saved.stability,difficulty:saved.difficulty,
  interval:saved.scheduled_days,due:saved.due,lastReviewed:now,lastGrade:grade,
  reps:saved.reps,lapses:saved.lapses,retention:retention(options.retention),
  fsrsCard:saved,reviews:[...(Array.isArray(p.reviews)?p.reviews:[]),{at:now,grade,due:saved.due}]
 };
}
function reschedule(record,targetRetention=0.9,weights=null){
 if(!record||typeof record!=='object'||!events(record).length)return record;
 const engine=createScheduler({retention:targetRetention,weights});
 const card=replay(record,engine);
 const saved=serialize(card);
 return {...record,algorithm:'ts-fsrs-v6',stability:saved.stability,difficulty:saved.difficulty,
  interval:saved.scheduled_days,due:saved.due,
  retention:retention(targetRetention),fsrsCard:saved
 };
}
function isReady(){return !!root.FSRS?.fsrs;}
const api={schedule,reschedule,isReady,validWeights,weights:DEFAULT_WEIGHTS,events};
if(typeof module!=='undefined')module.exports=api;
root.DefinitionFSRS=api;
})(typeof window!=='undefined'?window:globalThis);
