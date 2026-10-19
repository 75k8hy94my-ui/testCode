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
const initD=(g,w=W)=>clamp(w[4]-Math.exp(w[5]*(g-1))+1,1,10);
const retrievability=(days,s)=>Math.pow(1+FACTOR*Math.max(0,days)/s,-W[20]);
const interval=(s,retention=DEFAULT_RETENTION)=>Math.max(1,Math.round(s/FACTOR*(Math.pow(validRetention(retention),-1/W[20])-1)));
function nextState(s,d,lastAt,grade,at,w=W) {
 const g=grade+1;
 if (!s || !d || !Number.isFinite(lastAt)) return {s:Math.max(0.1,w[g-1]),d:initD(g,w)};
 const elapsed=Math.max(0,(at-lastAt)/DAY);
 const nextD=clamp(w[7]*initD(4,w)+(1-w[7])*clamp(d-w[6]*(g-3)*(10-d)/9,1,10),1,10);
 let nextS;
 if (elapsed<1) {
   nextS=s*Math.exp(w[17]*(g-3+w[18]))*Math.pow(s,-w[19]);
   if (g>=3) nextS=Math.max(s,nextS);
 } else {
   const r=retrievability(elapsed,s);
   if (g===1) {
     nextS=w[11]*Math.pow(d,-w[12])*(Math.pow(s+1,w[13])-1)*Math.exp(w[14]*(1-r));
     nextS=Math.min(nextS,s);
   } else {
     const hard=g===2?w[15]:1, easy=g===4?w[16]:1;
     nextS=s*(1+Math.exp(w[8])*(11-d)*Math.pow(s,-w[9])*(Math.exp(w[10]*(1-r))-1)*hard*easy);
   }
 }
 return {s:clamp(nextS,0.1,36500),d:nextD};
}
function schedule(previous,grade,now=Date.now(),options={}) {
 const weights=validWeights(options.weights)?options.weights:W;
 const retention=validRetention(options.retention);
 if (!Number.isInteger(grade)||grade<0||grade>3) throw Error('Invalid rating');
 const p=previous&&typeof previous==='object'?previous:{};
 const reviews=Array.isArray(p.reviews)?p.reviews:[];
 // Reconstruct from real historical grades; legacy SM-2 history is preserved.
 let state=null,lastAt=NaN;
 for (const event of reviews) {
   if (!event||!Number.isFinite(event.at)||!Number.isInteger(event.grade)||event.grade<0||event.grade>3) continue;
   if (Number.isFinite(lastAt)&&event.at<lastAt) continue;
   state=nextState(state?.s,state?.d,lastAt,event.grade,event.at,weights);
   lastAt=event.at;
 }
 if (!state && p.algorithm==='fsrs6' && Number.isFinite(p.stability)&&Number.isFinite(p.difficulty)) {
   state={s:p.stability,d:p.difficulty};lastAt=p.lastReviewed;
 }
 const current=nextState(state?.s,state?.d,lastAt,grade,now,weights);
 const days=grade===0?0:interval(current.s,retention);
 const due=grade===0?now+60000:now+days*DAY;
 return {...p,algorithm:'fsrs6',stability:current.s,difficulty:current.d,retention,
   interval:days,due,lastReviewed:now,lastGrade:grade,
   reps:(Number(p.reps)||0)+(grade===0?0:1),lapses:(Number(p.lapses)||0)+(grade===0?1:0),
   reviews:[...reviews,{at:now,grade,due}]};
}
function reschedule(record,retention=DEFAULT_RETENTION,weights=W) {
 if(record && Array.isArray(record.reviews) && record.reviews.length && validWeights(weights)) {
   const events=record.reviews.filter(e=>Number.isFinite(e.at)&&Number.isInteger(e.grade)&&e.grade>=0&&e.grade<=3).sort((a,b)=>a.at-b.at);
   let state=null,last=NaN;
   for(const e of events){state=nextState(state?.s,state?.d,last,e.grade,e.at,weights);last=e.at;}
   if(state){const lastGrade=events[events.length-1].grade;
     const days=lastGrade===0?0:interval(state.s,retention);
     return {...record,algorithm:'fsrs6',stability:state.s,difficulty:state.d,retention:validRetention(retention),interval:days,due:last+(lastGrade===0?60000:days*DAY)};
   }
 }
 if (!record || record.algorithm!=='fsrs6'||!Number.isFinite(record.stability)||!Number.isFinite(record.lastReviewed)) return record;
 const target=validRetention(retention),days=record.lastGrade===0?0:interval(record.stability,target);
 return {...record,retention:target,interval:days,due:record.lastReviewed+(record.lastGrade===0?60000:days*DAY)};
}

function validWeights(value) {
 return Array.isArray(value)&&value.length===21&&value.every((v,i)=>Number.isFinite(v)&&v>=WEIGHT_BOUNDS[i][0]&&v<=WEIGHT_BOUNDS[i][1]);
}
// Conservative safety constraints; do not fit unconstrained parameters.
const WEIGHT_BOUNDS=[
 [0.05,5],[0.1,12],[0.2,24],[0.5,60],[1,10],[0.01,4],[0.1,6],[0.0001,0.2],
 [0.2,6],[0.01,0.8],[0.1,3],[0.1,5],[0.01,1],[0.05,1],[0.1,6],
 [0.1,1],[1,6],[0.05,2],[0.01,2],[0.01,0.5],[0.05,0.4]
];
function observations(history) {
 const samples=[];
 for(const record of Object.values(history||{})){
   const events=Array.isArray(record?.reviews)?record.reviews:[], sorted=events.filter(e=>Number.isFinite(e.at)&&Number.isInteger(e.grade)&&e.grade>=0&&e.grade<=3).sort((a,b)=>a.at-b.at);
   if(sorted.length<2)continue;
   samples.push(sorted);
 }
 return samples;
}
function evaluate(weights, sequences) {
 let loss=0,n=0;
 for(const events of sequences){
   let state=null,last=NaN;
   for(const e of events){
     if(state&&e.at-last>=DAY){
       const r=clamp(retrievability((e.at-last)/DAY,state.s),0.00001,0.99999);
       const y=e.grade===0?0:1;
       loss-=y*Math.log(r)+(1-y)*Math.log(1-r);
       n++;
     }
     state=nextState(state?.s,state?.d,last,e.grade,e.at,weights);
     last=e.at;
   }
 }
 return {loss:n?loss/n:Infinity,count:n};
}
// Coordinate descent with regularization and chronological data split.
// Deliberately require substantial evidence before any personalization.
function optimize(history) {
 const sequences=observations(history);
 const total=evaluate(W,sequences);
 if(total.count<150||sequences.length<30)return {status:'insufficient',samples:total.count,needed:150};
 const train=sequences.filter((_,i)=>i%5!==0),validation=sequences.filter((_,i)=>i%5===0);
 if(evaluate(W,validation).count<20)return {status:'insufficient',samples:total.count,needed:150};
 let weights=W.slice();
 const objective=w=>{
   const l=evaluate(w,train).loss;
   return l+0.04*w.reduce((sum,v,i)=>sum+Math.pow(Math.log(v/W[i]),2),0)/21;
 };
 let current=objective(weights);
 for(let pass=0;pass<3;pass++){
   for(let i=0;i<21;i++){
     let winner=weights[i],best=current;
     for(const scale of [0.8,1.25]){
       const candidate=clamp(weights[i]*scale,...WEIGHT_BOUNDS[i]);
       const trial=weights.slice();trial[i]=candidate;
       const score=objective(trial);
       if(score<best-1e-8){best=score;winner=candidate;}
     }
     weights[i]=winner;current=best;
   }
 }
 const baseline=evaluate(W,validation),personal=evaluate(weights,validation);
 if(!(personal.loss<baseline.loss-0.002)) return {status:'no-improvement',samples:total.count,baseline:baseline.loss,validation:personal.loss};
 return {status:'optimized',samples:total.count,baseline:baseline.loss,validation:personal.loss,weights};
}
const api={schedule,reschedule,retrievability,interval,optimize,validWeights,weights:W};
if (typeof module!=='undefined') module.exports=api;
root.DefinitionFSRS=api;
})(typeof window!=='undefined'?window:globalThis);
