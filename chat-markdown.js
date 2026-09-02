(()=>{
'use strict';
const TICK=String.fromCharCode(96);
const escapeHtml=(value)=>String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function safeUrl(raw){try{const url=new URL(String(raw||''));return url.protocol==='http:'||url.protocol==='https:'?url.href:null}catch(_){return null}}
function inline(text){
  const source=String(text==null?'':text);
  let out='',i=0;
  while(i<source.length){
    if(source[i]===TICK){
      const end=source.indexOf(TICK,i+1);
      if(end!==-1){out+='<code>'+escapeHtml(source.slice(i+1,end))+'</code>';i=end+1;continue}
    }
    if(source.startsWith('**',i)){
      const end=source.indexOf('**',i+2);
      if(end!==-1){out+='<strong>'+inline(source.slice(i+2,end))+'</strong>';i=end+2;continue}
    }
    if(source[i]==='['){
      const close=source.indexOf('](',i+1),end=close===-1?-1:source.indexOf(')',close+2);
      if(close!==-1&&end!==-1){
        const label=source.slice(i+1,close),rawUrl=source.slice(close+2,end),url=safeUrl(rawUrl);
        if(url){out+='<a href="'+escapeHtml(url)+'" target="_blank" rel="noopener noreferrer">'+inline(label)+'</a>';i=end+1;continue}
        out+=escapeHtml(source.slice(i,end+1));i=end+1;continue
      }
    }
    const nextCandidates=[source.indexOf(TICK,i+1),source.indexOf('**',i+1),source.indexOf('[',i+1)].filter(x=>x!==-1);
    const next=nextCandidates.length?Math.min.apply(null,nextCandidates):source.length;
    out+=escapeHtml(source.slice(i,next));i=next;
  }
  return out;
}
function fenceMatch(line){
  const prefix=TICK+TICK+TICK;
  if(!line.startsWith(prefix))return null;
  const rest=line.slice(3).trim();
  return /^[A-Za-z0-9_+.-]*$/.test(rest)?rest:null;
}
function render(value){
  const lines=String(value==null?'':value).replace(/\r\n?/g,'\n').split('\n');
  const out=[];let i=0;
  while(i<lines.length){
    const line=lines[i];
    const language=fenceMatch(line);
    if(language!==null){
      const code=[];i++;
      const fence=TICK+TICK+TICK;
      while(i<lines.length&&lines[i].trim()!==fence){code.push(lines[i]);i++}
      if(i<lines.length)i++;
      const attr=language?' data-language="'+escapeHtml(language)+'"':'';
      out.push('<pre><code'+attr+'>'+escapeHtml(code.join('\n'))+'\n</code></pre>');continue
    }
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){const level=heading[1].length;out.push('<h'+level+'>'+inline(heading[2])+'</h'+level+'>');i++;continue}
    if(/^\s*-\s+/.test(line)){
      const items=[];
      while(i<lines.length&&/^\s*-\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*-\s+/,''));i++}
      out.push('<ul>'+items.map(item=>'<li>'+inline(item)+'</li>').join('')+'</ul>');continue
    }
    if(!line.trim()){i++;continue}
    const paragraph=[line];i++;
    while(i<lines.length&&lines[i].trim()&&fenceMatch(lines[i])===null&&!/^(#{1,3})\s+/.test(lines[i])&&!/^\s*-\s+/.test(lines[i])){paragraph.push(lines[i]);i++}
    out.push('<p>'+paragraph.map(inline).join('<br>')+'</p>');
  }
  return out.join('\n');
}
const api={escapeHtml,safeUrl,render};
if(typeof window!=='undefined')window.ChatMarkdown=api;
if(typeof module!=='undefined')module.exports=api;
})();
