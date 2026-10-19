const run=document.getElementById('fsrsTrainerRun');
const status=document.getElementById('fsrsTrainerStatus');
const back=document.getElementById('fsrsTrainerBack');
const STORAGE='testCode.statutes.definitionReviews.v1';
const WEIGHTS='testCode.statutes.definitionFSRSWeights.v1';
const RETENTION='testCode.statutes.definitionRetention.v1';
const DIRTY='testCode.statutes.fsrsPendingSync.v1';
const DAY=86400000;
const validWeights=x=>Array.isArray(x)&&x.length===21&&x.every(v=>Number.isFinite(v)&&v>=0&&v<100)&&x[0]>0&&x[20]>=0.1&&x[20]<=0.8;

function studyDay(epoch) {
  const date=new Date(epoch-4*3600000);
  // A review on the same local study day receives delta_t=0.
  return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/DAY;
}
function trainingInput() {
  let raw;
  try{raw=JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch(_){raw={};}
  const ratings=[],deltaTs=[],lengths=[];
  let reviewCount=0,cardCount=0;
  for(const record of Object.values(raw||{})){
    const reviews=Array.isArray(record?.reviews)?record.reviews:[];
    const valid=reviews.filter(e=>e&&Number.isFinite(e.at)&&Number.isInteger(e.grade)&&e.grade>=0&&e.grade<=3)
      .sort((a,b)=>a.at-b.at);
    if(valid.length<2)continue;
    const grades=[],deltas=[];
    let previous=null;
    for(const event of valid){
      const day=studyDay(event.at);
      grades.push(event.grade+1);
      deltas.push(previous===null?0:Math.max(0,day-previous));
      previous=day;
    }
    reviewCount+=grades.length;
    cardCount++;
    // fsrs-rs trains from all successive review prefixes, not one
    // complete history per card. Its initial-stability dataset requires
    // prefixes with exactly one long-term review (at least two events).
    // Prefixes ending on a same-day step have no new long-term review;
    // keep those for training only when a long-term review exists.
    for(let count=2;count<=grades.length;count++){
      if(!deltas.slice(1,count).some(delta=>delta>0))continue;
      for(let i=0;i<count;i++){
        ratings.push(grades[i]);
        deltaTs.push(deltas[i]);
      }
      lengths.push(count);
    }
  }
  return {ratings:new Uint32Array(ratings),deltaTs:new Uint32Array(deltaTs),lengths:new Uint32Array(lengths),reviewCount,cardCount};
}
function setStatus(message){status.textContent=message;}
run.addEventListener('click',()=>{
  if(!globalThis.crossOriginIsolated || typeof SharedArrayBuffer==='undefined'){
    setStatus('ブラウザの分離環境を利用できません。再読み込みするか、対応ブラウザでお試しください。');return;
  }
  const input=trainingInput();
  if(input.reviewCount<400||input.cardCount<50||input.lengths.length<50){setStatus('学習履歴が不足しています（現在 '+input.ratings.length+' 回・'+input.lengths.length+' 枚）。目安は400回・50枚以上です。');return;}
  run.disabled=true;setStatus('公式fsrs-rsで最適化しています。');
  const worker=new Worker(new URL('./optimizer.worker.js',import.meta.url),{type:'module'});
  worker.onmessage=event=>{
    const data=event.data||{};
    if(data.type==='ready')setStatus('FSRSパラメータを学習しています…');
    if(data.type==='success'){
      if(!validWeights(data.weights)){setStatus('不正な最適化結果のため適用しませんでした。');run.disabled=false;worker.terminate();return;}
      try{
        localStorage.setItem(WEIGHTS,JSON.stringify(data.weights));
        localStorage.setItem(DIRTY,String(Date.now()));
        setStatus('公式fsrs-rsによる最適化が完了しました。定義カードに戻ると復習予定を再計算します。');
        back.hidden=false;
      }catch(error){setStatus('学習結果を保存できませんでした：'+error.message);}
      run.disabled=false;worker.terminate();
    }
    if(data.type==='error'){setStatus('最適化に失敗しました：'+data.message);run.disabled=false;worker.terminate();}
  };
  worker.onerror=e=>{setStatus('公式最適化器を起動できません：'+(e.message||'Worker error'));run.disabled=false;worker.terminate();};
  worker.postMessage({ratings:input.ratings,deltaTs:input.deltaTs,lengths:input.lengths});
});
const count=trainingInput();
setStatus('保存済みの評価 '+count.reviewCount+' 回・カード '+count.cardCount+' 枚。入力データは端末内で処理し、外部に送信しません。');
