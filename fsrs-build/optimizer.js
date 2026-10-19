const run=document.getElementById('fsrsTrainerRun');
const status=document.getElementById('fsrsTrainerStatus');
const back=document.getElementById('fsrsTrainerBack');
const STORAGE='testCode.statutes.definitionReviews.v1';
const WEIGHTS='testCode.statutes.definitionFSRSWeights.v1';
const RETENTION='testCode.statutes.definitionRetention.v1';
const DIRTY='testCode.statutes.fsrsPendingSync.v1';
const DAY=86400000;
const validWeights=x=>Array.isArray(x)&&x.length===21&&x.every(v=>Number.isFinite(v)&&v>0&&v<100);

function studyDay(epoch) {
  const date=new Date(epoch-4*3600000);
  // A review on the same local study day receives delta_t=0.
  return Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())/DAY;
}
function trainingInput() {
  let raw;
  try{raw=JSON.parse(localStorage.getItem(STORAGE)||'{}');}catch(_){raw={};}
  const ratings=[],deltaTs=[],lengths=[];
  for(const record of Object.values(raw||{})){
    const reviews=Array.isArray(record?.reviews)?record.reviews:[];
    const valid=reviews.filter(e=>e&&Number.isFinite(e.at)&&Number.isInteger(e.grade)&&e.grade>=0&&e.grade<=3)
      .sort((a,b)=>a.at-b.at);
    if(!valid.length)continue;
    let prev=null;
    for(const event of valid){
      const day=studyDay(event.at);
      ratings.push(event.grade+1);
      deltaTs.push(prev===null?0:Math.max(0,day-prev));
      prev=day;
    }
    lengths.push(valid.length);
  }
  return {ratings:new Uint32Array(ratings),deltaTs:new Uint32Array(deltaTs),lengths:new Uint32Array(lengths)};
}
function setStatus(message){status.textContent=message;}
run.addEventListener('click',()=>{
  if(!globalThis.crossOriginIsolated || typeof SharedArrayBuffer==='undefined'){
    setStatus('ブラウザの分離環境を利用できません。再読み込みするか、対応ブラウザでお試しください。');return;
  }
  const input=trainingInput();
  if(input.ratings.length<100){setStatus('学習履歴が不足しています（現在 '+input.ratings.length+' 回）。正確な個人最適化には、さらに復習を重ねてください。');return;}
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
setStatus('保存済みの評価 '+count.ratings.length+' 回・カード '+count.lengths.length+' 枚。入力データは端末内で処理し、外部に送信しません。');
