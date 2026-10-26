(function(root){
  'use strict';
  const NAME='testCodeVideoThumbnailCache', STORE='frames', VERSION=1;
  // Long-lived IndexedDB cache (no time-based expiry); recently viewed items
  // must count as recent, even when they were originally saved months ago.
  const MAX_ITEMS=900, MAX_BYTES=96*1024*1024;
  const HOT_ITEMS=120, HOT_BYTES=20*1024*1024;
  const FAILED_RETRY_MS=5*60*1000;
  let dbPromise, hotBytes=0;
  const hot=new Map(), failed=new Map(), pending=new Map();
  function clearHot(){hot.clear();hotBytes=0;}
  function remember(k,blob){
    if(!blob||!permitted()||blob.size>HOT_BYTES)return;
    if(hot.has(k)){hotBytes-=hot.get(k).size;hot.delete(k);}
    hot.set(k,blob);hotBytes+=blob.size;
    while(hot.size>HOT_ITEMS||hotBytes>HOT_BYTES){
      const oldest=hot.keys().next().value;
      hotBytes-=hot.get(oldest).size;hot.delete(oldest);
    }
  }
  function permitted(){
    const gate=root.MangaReaderMediaAccess;
    const allowed=!!(gate && typeof gate.canReadProtectedData==='function' && gate.canReadProtectedData());
    if(!allowed)clearHot();
    return allowed;
  }
  function database(){
    if(!root.indexedDB) return Promise.resolve(null);
    if(!dbPromise) dbPromise=new Promise(resolve=>{
      try {
        const req=root.indexedDB.open(NAME,VERSION);
        req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'key'});};
        req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db);};
        req.onerror=()=>resolve(null);
        req.onblocked=()=>resolve(null);
      } catch(_){resolve(null);}
    });
    return dbPromise;
  }
  async function key(url,time){
    // Do not store potentially private media URLs in plaintext as database keys.
    if(!root.crypto || !root.crypto.subtle || !root.TextEncoder) return null;
    const data=new root.TextEncoder().encode(String(url)+'\n'+String(time));
    const digest=await root.crypto.subtle.digest('SHA-256',data);
    return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function read(url,time){
    if(!permitted())return null;
    try{
      const k=await key(url,time);
      if(!k||!permitted())return null;
      if(hot.has(k)){
        const blob=hot.get(k);remember(k,blob);
        // Refresh the disk LRU as well, even for memory hits.
        touch(k);
        return permitted()?blob:null;
      }
      const db=await database();
      if(!db||!permitted())return null;
      const blob=await new Promise(resolve=>{
        let found=null;
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),req=store.get(k);
        req.onsuccess=()=>{
          if(!permitted()||!req.result||!req.result.blob)return;
          found=req.result.blob;
          store.put({...req.result,used:Date.now()});
        };
        tx.oncomplete=()=>resolve(found);
        tx.onerror=()=>resolve(null);
        tx.onabort=()=>resolve(null);
      });
      if(blob&&permitted()){remember(k,blob);return blob;}
      return null;
    }catch(_){return null;}
  }
  async function touch(k){
    try{
      const db=await database();
      if(!db||!permitted())return;
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
      const req=store.get(k);
      req.onsuccess=()=>{if(req.result&&permitted())store.put({...req.result,used:Date.now()});};
    }catch(_){/* The in-memory cache is still usable. */}
  }
  async function write(url,time,blob){
    if(!permitted()||!blob||blob.size>300*1024)return;
    try{
      const k=await key(url,time);
      if(!k||!permitted())return;
      // Keep a short-term cache even when IndexedDB is unavailable or full.
      remember(k,blob);
      const db=await database();
      if(!db||!permitted())return;
      const saved=await new Promise(resolve=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put({key:k,blob,bytes:blob.size,used:Date.now()});
        tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);
      });
      if(!saved)return;
      // Keep the cache bounded even on browsers with generous storage quotas.
      const entries=await new Promise(resolve=>{
        const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
        req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([]);
      });
      entries.sort((a,b)=>(b.used||0)-(a.used||0));
      let total=0,kept=0;const remove=[];
      entries.forEach(entry=>{
        const size=entry.bytes||(entry.blob&&entry.blob.size)||0;
        if(kept>=MAX_ITEMS||total+size>MAX_BYTES)remove.push(entry.key);
        else{total+=size;kept++;}
      });
      if(remove.length)await new Promise(resolve=>{
        const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE);
        remove.forEach(k=>os.delete(k));
        tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
      });
    }catch(_){/* Best-effort cache; never block playback. */}
  }
  function capture(url,time){
    if(!permitted())return Promise.resolve(null);
    const signature=String(url)+'\n'+time;
    const lastFailure=failed.get(signature);
    if(lastFailure&&Date.now()-lastFailure<FAILED_RETRY_MS)return Promise.resolve(null);
    failed.delete(signature);
    if(pending.has(signature))return pending.get(signature);
    const job=new Promise(resolve=>{
      if(!root.document||!root.document.createElement){resolve(null);return;}
      const video=root.document.createElement('video');
      video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';
      let done=false;
      const finish=blob=>{
        if(done)return;done=true;clearTimeout(timer);video.pause();video.removeAttribute('src');
        try{video.load();}catch(_){}
        if(!blob)failed.set(signature,Date.now());
        else failed.delete(signature);
        resolve(blob||null);
      };
      const timer=setTimeout(()=>finish(null),12000);
      video.addEventListener('error',()=>finish(null));
      video.addEventListener('loadedmetadata',()=>{
        const duration=Number(video.duration);
        const target=Number.isFinite(duration)&&duration>0?Math.min(time,Math.max(0,duration-0.05)):time;
        try{video.currentTime=target;}catch(_){finish(null);}
      });
      video.addEventListener('seeked',()=>{
        if(done||!permitted()){finish(null);return;}
        try{
          const w=Number(video.videoWidth),h=Number(video.videoHeight);
          if(!(w>0&&h>0)){finish(null);return;}
          const canvas=root.document.createElement('canvas'),scale=Math.min(1,320/w,180/h);
          canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
          canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
          canvas.toBlob(blob=>finish(blob),'image/webp',0.72);
        }catch(_){finish(null);}
      });
      video.src=url;
    }).finally(()=>pending.delete(signature));
    pending.set(signature,job);return job;
  }
  async function captureAndStore(url,time){
    if(!permitted())return null;
    const t=Math.max(0,Number(time)||0.1);
    const blob=await capture(url,t);
    if(blob&&permitted())await write(url,t,blob);
    return permitted()?blob:null;
  }
  async function getOrCapture(url,time){
    if(!permitted())return null;
    const t=Math.max(0,Number(time)||0.1);
    const cached=await read(url,t);
    return cached||captureAndStore(url,t);
  }
  if(root.document&&typeof root.document.addEventListener==='function'){
    root.document.addEventListener('manga-reader-vpn-status',()=>{if(!permitted())clearHot();});
  }
  const api=Object.freeze({read,getOrCapture,captureAndStore,permitted});
  root.MangaReaderVideoThumbnailCache=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
