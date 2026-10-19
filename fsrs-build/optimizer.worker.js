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
    // A wasm-bindgen panic can leave a mutable borrow active. Freeing the
    // object in that case masks the original diagnostic with a borrow error.
    const parameters=model.computeParameters(
      data.ratings,data.deltaTs,data.lengths,undefined,true,undefined,1,undefined
    );
    const weights=Array.from(parameters);
    model.free();
    self.postMessage({type:'success',weights});
  }catch(error){self.postMessage({type:'error',message:String(error?.message||error)});}
};
