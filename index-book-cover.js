(()=>{
'use strict';
const text=(value)=>String(value??'').trim();
function calculateContainSize(width,height,maxEdge=800){
  const w=Number(width),h=Number(height),limit=Math.max(1,Number(maxEdge)||800);
  if(!(w>0&&h>0)) throw new Error('画像サイズが不正です。');
  const scale=Math.min(1,limit/Math.max(w,h));
  return {width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))};
}
function normalizeCover(value){
  if(!value||typeof value!=='object') return null;
  const type=value.type==='url'?'url':value.type==='upload'?'upload':'';
  const data=text(value.value);
  if(!type||!data) return null;
  if(type==='url'&&!/^https?:\/\//i.test(data)) throw new Error('画像URLは http:// または https:// で入力してください。');
  if(type==='upload'&&!/^data:image\/(?:webp|jpeg|png);base64,/i.test(data)) throw new Error('アップロード画像の形式が不正です。');
  return {type,value:data};
}
async function compressImageFile(file,{maxEdge=800,quality=.82}={}){
  if(!file||!String(file.type||'').startsWith('image/')) throw new Error('画像ファイルを選択してください。');
  const bitmap=await createImageBitmap(file);
  try{
    const size=calculateContainSize(bitmap.width,bitmap.height,maxEdge);
    const canvas=document.createElement('canvas');
    canvas.width=size.width; canvas.height=size.height;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx) throw new Error('画像を処理できませんでした。');
    ctx.drawImage(bitmap,0,0,size.width,size.height);
    const blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/webp',quality));
    if(!blob) throw new Error('画像を圧縮できませんでした。');
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||new Error('画像を読み込めませんでした。'));reader.readAsDataURL(blob);});
  }finally{if(bitmap.close)bitmap.close();}
}
const api={calculateContainSize,normalizeCover,compressImageFile};
if(typeof window!=='undefined')window.IndexBookCover=api;
if(typeof module!=='undefined')module.exports=api;
})();