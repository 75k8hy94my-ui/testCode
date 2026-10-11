(function(root){
  'use strict';
  const NAME='testCodeVideoThumbnailCache', STORE='frames', VERSION=1;
  const MAX_ITEMS=300, MAX_BYTES=30*1024*1024;
  let dbPromise;
  const failed=new Set(), pending=new Map();
  function permitted(){
    const gate=root.MangaReaderMediaAccess;
    return !!(gate && typeof gate.canReadProtectedData==='function' && gate.canReadProtectedData());
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
    if(!permitted()) return null;
    try{
      const k=await key(url,time), db=await database();
      if(!k||!db||!permitted())return null;
      return await new Promise(resolve=>{
        const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(k);
        req.onsuccess=()=>resolve(permitted()&&req.result&&req.result.blob||null);
        req.onerror=()=>resolve(null);
      });
    }catch(_){return null;}
  }
  async function write(url,time,blob){
    if(!permitted()||!blob||blob.size>300*1024)return;
    try{
      const k=await key(url,time),db=await database();
      if(!k||!db||!permitted())return;
      await new Promise(resolve=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put({key:k,blob,bytes:blob.size,used:Date.now()});
        tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;
      });
      // Keep the cache bounded even on browsers with generous storage quotas.
      const entries=await new Promise(resolve=>{
        const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
        req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>resolve([]);
      });
      entries.sort((a,b)=>(b.used||0)-(a.used||0));
      let total=0;const remove=[];
      entries.forEach((entry,i)=>{total+=entry.bytes||entry.blob&&entry.blob.size||0;if(i>=MAX_ITEMS||total>MAX_BYTES)remove.push(entry.key);});
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
    if(failed.has(signature))return Promise.resolve(null);
    if(pending.has(signature))return pending.get(signature);
    const job=new Promise(resolve=>{
      if(!root.document||!root.document.createElement){resolve(null);return;}
      const video=root.document.createElement('video');
      video.crossOrigin='anonymous';video.muted=true;video.playsInline=true;video.preload='auto';
      let done=false;
      const finish=blob=>{
        if(done)return;done=true;clearTimeout(timer);video.pause();video.removeAttribute('src');
        try{video.load();}catch(_){}
        if(!blob)failed.add(signature);
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
  async function getOrCapture(url,time){
    if(!permitted())return null;
    const t=Math.max(0,Number(time)||0.1);
    const cached=await read(url,t);
    if(cached)return cached;
    const blob=await capture(url,t);
    if(blob&&permitted())await write(url,t,blob);
    return permitted()?blob:null;
  }
  const api=Object.freeze({read,getOrCapture,permitted});
  root.MangaReaderVideoThumbnailCache=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
