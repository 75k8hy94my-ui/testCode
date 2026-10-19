import init,{initThreadPool,Fsrs} from 'fsrs-browser/fsrs_browser';
let initialized=false;
self.onmessage=async ({data})=>{
  try{
    if(!initialized){
      await init();
      await initThreadPool(Math.max(1,Math.min(4,navigator.hardwareConcurrency||2)));
      initialized=true;
    }
    self.postMessage({type:'ready'});
    const model=new Fsrs();
    try{
      const parameters=model.computeParameters(
        data.ratings,data.deltaTs,data.lengths,null,true,null,1,null
      );
      self.postMessage({type:'success',weights:Array.from(parameters)});
    }finally{model.free();}
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};
