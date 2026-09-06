(()=>{
'use strict';
const Page=window.IndexSearchPage,Schema=window.LegalIndexSchema,Cover=window.IndexBookCover,Cache=window.EncryptedChunkCache,Crypto=window.EncryptedChunkCrypto,Vault=window.MangaVault;
if(!Page||!Schema||!Cover||!Cache||!Crypto||!Vault)return;
const list=()=>document.getElementById('bookManagerList');
const split=(value)=>[...new Set(String(value||'').split(/[、,;；\n]+/).map(v=>v.trim()).filter(Boolean))];
const style=document.createElement('style');
style.textContent=`.bookCoverThumb{width:48px;height:68px;object-fit:cover;border-radius:7px;border:1px solid var(--line);background:var(--surface-strong);flex:none}.bookMainWrap{display:flex;gap:10px;align-items:center;min-width:0}.bookEditOverlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:16px}.bookEditDialog{width:min(560px,100%);max-height:min(760px,92vh);overflow:auto;border:1px solid var(--glass-border);border-radius:22px;background:var(--surface-strong);box-shadow:0 24px 80px rgba(0,0,0,.32);padding:18px}.bookEditDialog h2{margin:0 0 14px}.bookEditGrid{display:grid;gap:11px}.bookEditGrid label{display:grid;gap:5px;font-size:12px;font-weight:750}.bookEditGrid input,.bookEditGrid select{width:100%;min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--surface-strong);color:var(--text);padding:8px 10px}.bookCoverPreview{width:110px;height:156px;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:var(--bg)}.bookCoverArea{display:flex;gap:12px;align-items:flex-start}.bookCoverFields{flex:1;display:grid;gap:8px}.bookEditNote{font-size:11px;color:var(--sub);line-height:1.5}.bookEditError{min-height:18px;color:var(--danger);font-size:12px}.bookEditActions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}@media(max-width:520px){.bookCoverArea{display:grid}.bookEditDialog{padding:14px}.bookCoverPreview{width:90px;height:128px}}`;
document.head.append(style);
function coverSrc(book){return book&&book.book&&book.book.cover&&book.book.cover.value||'';}
function enhanceRows(){
  const container=list();if(!container)return;
  const books=Page.getBooks().slice().sort((a,b)=>a.book.title.localeCompare(b.book.title,'ja'));
  [...container.querySelectorAll('.bookRow')].forEach((row,index)=>{
    const book=books[index];if(!book||row.dataset.editorReady==='1')return;row.dataset.editorReady='1';
    const main=row.firstElementChild;
    if(main){const wrap=document.createElement('div');wrap.className='bookMainWrap';const src=coverSrc(book);if(src){const img=document.createElement('img');img.className='bookCoverThumb';img.src=src;img.alt='';img.loading='lazy';wrap.append(img);}main.replaceWith(wrap);wrap.append(main);}
    const actions=row.querySelector('.bookActions');if(actions){const edit=document.createElement('button');edit.type='button';edit.className='smallBtn';edit.textContent='編集';edit.addEventListener('click',()=>openEditor(book));const remove=actions.querySelector('.danger');actions.insertBefore(edit,remove||null);}
  });
}
async function saveBook(original,values){
  const session=Vault.loadSession(),active=Vault.loadActive();
  if(!session||!session.user||!session.user.id||!active||!active.rawKey)throw new Error('保管庫のセッションを確認できません。');
  const cache=await Cache.createCache({dbName:Page.cacheDbNameForUser(session.user.id)});
  try{
    const record=await cache.get(original.chunkId);if(!record)throw new Error('書籍のキャッシュが見つかりません。');
    const normalized={schemaVersion:original.schemaVersion,book:{...original.book,title:values.title,authors:values.authors,subjects:values.subjects,cover:values.cover},matterEntries:original.matterEntries,caseEntries:original.caseEntries,statuteEntries:original.statuteEntries};
    const chunk=Schema.createIndexBookChunk(normalized,{bookId:original.bookId,chunkId:original.chunkId});
    const payload=await Crypto.encryptChunk(active.rawKey,original.chunkId,chunk);
    await cache.put({...record,payload,pendingAction:'upsert'});
  }finally{cache.close();}
  await Page.reload();if(navigator.onLine)Page.sync();
}
function openEditor(book){
  const overlay=document.createElement('div');overlay.className='bookEditOverlay';
  const dialog=document.createElement('div');dialog.className='bookEditDialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','書籍情報を編集');
  const title=document.createElement('input');title.value=book.book.title||'';
  const authors=document.createElement('input');authors.value=(book.book.authors||[]).join('、');authors.placeholder='例：宇賀克也';
  const subjects=document.createElement('input');subjects.value=(book.book.subjects||[]).join('、');subjects.placeholder='例：行政法、行政救済法';
  const mode=document.createElement('select');mode.innerHTML='<option value="none">画像なし</option><option value="url">画像URL</option><option value="upload">画像アップロード</option>';
  const current=book.book.cover||null;mode.value=current?current.type:'none';
  const url=document.createElement('input');url.type='url';url.placeholder='https://…';url.value=current&&current.type==='url'?current.value:'';
  const file=document.createElement('input');file.type='file';file.accept='image/*';
  let uploaded=current&&current.type==='upload'?current.value:'';
  const preview=document.createElement('img');preview.className='bookCoverPreview';preview.alt='表紙プレビュー';preview.src=current?current.value:'';preview.hidden=!preview.src;
  const note=document.createElement('div');note.className='bookEditNote';note.textContent='アップロード画像は長辺800px以内・WebPへ圧縮してから暗号化保存します。画像URLはURLのみ保存します。';
  const error=document.createElement('div');error.className='bookEditError';
  const fields=document.createElement('div');fields.className='bookCoverFields';
  function syncMode(){url.hidden=mode.value!=='url';file.hidden=mode.value!=='upload';if(mode.value==='none'){preview.hidden=true;}else{const src=mode.value==='url'?url.value.trim():uploaded;preview.src=src;preview.hidden=!src;}}
  mode.addEventListener('change',syncMode);url.addEventListener('input',syncMode);
  file.addEventListener('change',async()=>{error.textContent='';if(!file.files[0])return;try{file.disabled=true;uploaded=await Cover.compressImageFile(file.files[0],{maxEdge:800,quality:.82});syncMode();}catch(e){error.textContent=e&&e.message?e.message:'画像を処理できませんでした。';}finally{file.disabled=false;}});
  fields.append(mode,url,file,note);const coverArea=document.createElement('div');coverArea.className='bookCoverArea';coverArea.append(preview,fields);
  const grid=document.createElement('div');grid.className='bookEditGrid';
  const labeled=(name,input)=>{const label=document.createElement('label');label.append(document.createTextNode(name),input);return label;};
  grid.append(labeled('書名',title),labeled('著者（複数は「、」区切り）',authors),labeled('科目（複数は「、」区切り）',subjects),labeled('書籍画像',coverArea),error);
  const cancel=document.createElement('button');cancel.type='button';cancel.className='smallBtn';cancel.textContent='キャンセル';cancel.addEventListener('click',()=>overlay.remove());
  const save=document.createElement('button');save.type='button';save.className='glassBtn primary';save.textContent='保存';
  save.addEventListener('click',async()=>{error.textContent='';const name=title.value.trim();if(!name){error.textContent='書名を入力してください。';title.focus();return;}try{save.disabled=true;let cover=null;if(mode.value==='url')cover=Cover.normalizeCover({type:'url',value:url.value});else if(mode.value==='upload')cover=Cover.normalizeCover({type:'upload',value:uploaded});await saveBook(book,{title:name,authors:split(authors.value),subjects:split(subjects.value),cover});overlay.remove();}catch(e){error.textContent=e&&e.message?e.message:'保存できませんでした。';}finally{save.disabled=false;}});
  const actions=document.createElement('div');actions.className='bookEditActions';actions.append(cancel,save);dialog.append(Object.assign(document.createElement('h2'),{textContent:'書籍情報を編集'}),grid,actions);overlay.append(dialog);document.body.append(overlay);syncMode();title.focus();
  overlay.addEventListener('click',(e)=>{if(e.target===overlay)overlay.remove();});
}
const observer=new MutationObserver(enhanceRows);const start=()=>{const container=list();if(!container)return;observer.observe(container,{childList:true});enhanceRows();};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();