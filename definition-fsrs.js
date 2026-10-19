/* FSRS-6, default open-spaced-repetition parameters (2025-05).
 * Grades supplied by UI: 0 Again, 1 Hard, 2 Good, 3 Easy.
 * Retention 90%; short Again relearning step is UI policy, not FSRS stability.
 */
(function(root) {
'use strict';
const W=[0.2172,1.1771,3.2602,16.1507,7.0114,0.57,2.0966,0.0069,1.5261,0.112,1.0178,1.849,0.1133,0.3127,2.2934,0.2191,3.0004,0.7536,0.3332,0.1437,0.2];
const DAY=86400000, RETENTION=0.9, FACTOR=Math.pow(RETENTION,-1/W[20])-1;
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
const initD=g=>clamp(W[4]-Math.exp(W[5]*(g-1))+1,1,10);
const retrievability=(days,s)=>Math.pow(1+FACTOR*Math.max(0,days)/s,-W[20]);
const interval=s=>Math.max(1,Math.round(s/FACTOR*(Math.pow(RETENTION,-1/W[20])-1)));
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
function schedule(previous,grade,now=Date.now()) {
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
 const days=grade===0?0:interval(current.s);
 const due=grade===0?now+60000:now+days*DAY;
 return {...p,algorithm:'fsrs6',stability:current.s,difficulty:current.d,retention:RETENTION,
   interval:days,due,lastReviewed:now,lastGrade:grade,
   reps:(Number(p.reps)||0)+(grade===0?0:1),lapses:(Number(p.lapses)||0)+(grade===0?1:0),
   reviews:[...reviews,{at:now,grade,due}]};
}
const api={schedule,retrievability,interval,weights:W};
if (typeof module!=='undefined') module.exports=api;
root.DefinitionFSRS=api;
})(typeof window!=='undefined'?window:globalThis);
