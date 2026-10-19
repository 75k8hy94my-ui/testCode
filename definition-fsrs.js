/* FSRS-6, default open-spaced-repetition parameters (2025-05).
 * Grades supplied by UI: 0 Again, 1 Hard, 2 Good, 3 Easy.
 * Retention 90%; short Again relearning step is UI policy, not FSRS stability.
 */
(function(root) {
'use strict';
const W=[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];
const DAY=86400000, DEFAULT_RETENTION=0.9, FACTOR=Math.pow(DEFAULT_RETENTION,-1/W[20])-1;
const validRetention = x => Number.isFinite(x) && x>=0.7 && x<=0.97 ? x : DEFAULT_RETENTION;
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
const initD=g=>clamp(W[4]-Math.exp(W[5]*(g-1))+1,1,10);
const retrievability=(days,s)=>Math.pow(1+FACTOR*Math.max(0,days)/s,-W[20]);
const interval=(s,retention=DEFAULT_RETENTION)=>Math.max(1,Math.round(s/FACTOR*(Math.pow(validRetention(retention),-1/W[20])-1)));
function nextState(s,d,lastAt,grade,at) {
 const g=grade+1;
 if (!s || !d || !Number.isFinite(lastAt)) return {s:Math.max(0.1,W[g-1]),d:initD(g)};
 const elapsed=Math.max(0,(at-lastAt)/DAY);
 const nextD=clamp(W[7]*initD(4)+(1-W[7])*clamp(d-W[6]*(g-3)*(10-d)/9,1,10),1,10);
 let nextS;
 if (elapsed<1) {
   nextS=s*Math.exp(W[17]*(g-3+W[18]))*Math.pow(s,-W[19]);
   if (g>=3) nextS=Math.max(s,nextS);
 } else {
   const r=retrievability(elapsed,s);
   if (g===1) {
     nextS=W[11]*Math.pow(d,-W[12])*(Math.pow(s+1,W[13])-1)*Math.exp(W[14]*(1-r));
     nextS=Math.min(nextS,s);
   } else {
     const hard=g===2?W[15]:1, easy=g===4?W[16]:1;
     nextS=s*(1+Math.exp(W[8])*(11-d)*Math.pow(s,-W[9])*(Math.exp(W[10]*(1-r))-1)*hard*easy);
   }
 }
 return {s:clamp(nextS,0.1,36500),d:nextD};
}
function schedule(previous,grade,now=Date.now(),options={}) {
 const retention=validRetention(options.retention);
 if (!Number.isInteger(grade)||grade<0||grade>3) throw Error('Invalid rating');
 const p=previous&&typeof previous==='object'?previous:{};
 const reviews=Array.isArray(p.reviews)?p.reviews:[];
 // Reconstruct from real historical grades; legacy SM-2 history is preserved.
 let state=null,lastAt=NaN;
 for (const event of reviews) {
   if (!event||!Number.isFinite(event.at)||!Number.isInteger(event.grade)||event.grade<0||event.grade>3) continue;
   if (Number.isFinite(lastAt)&&event.at<lastAt) continue;
   state=nextState(state?.s,state?.d,lastAt,event.grade,event.at);
   lastAt=event.at;
 }
 if (!state && p.algorithm==='fsrs6' && Number.isFinite(p.stability)&&Number.isFinite(p.difficulty)) {
   state={s:p.stability,d:p.difficulty};lastAt=p.lastReviewed;
 }
 const current=nextState(state?.s,state?.d,lastAt,grade,now);
 const days=grade===0?0:interval(current.s,retention);
 const due=grade===0?now+60000:now+days*DAY;
 return {...p,algorithm:'fsrs6',stability:current.s,difficulty:current.d,retention,
   interval:days,due,lastReviewed:now,lastGrade:grade,
   reps:(Number(p.reps)||0)+(grade===0?0:1),lapses:(Number(p.lapses)||0)+(grade===0?1:0),
   reviews:[...reviews,{at:now,grade,due}]};
}
function reschedule(record,retention=DEFAULT_RETENTION) {
 if (!record || record.algorithm!=='fsrs6'||!Number.isFinite(record.stability)||!Number.isFinite(record.lastReviewed)) return record;
 const target=validRetention(retention),days=record.lastGrade===0?0:interval(record.stability,target);
 return {...record,retention:target,interval:days,due:record.lastReviewed+(record.lastGrade===0?60000:days*DAY)};
}
const api={schedule,reschedule,retrievability,interval,weights:W};
if (typeof module!=='undefined') module.exports=api;
root.DefinitionFSRS=api;
})(typeof window!=='undefined'?window:globalThis);
