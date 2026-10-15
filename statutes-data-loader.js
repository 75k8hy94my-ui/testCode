(() => {
  'use strict';
  const page = document.querySelector('#routeContent.statutesMain');
  if (!page || !document.documentElement.classList.contains('statutes-page')) return;
  const originalMarkup = page.innerHTML;
  const store = new Map();
  let generation = 0;
  const sections = {
    constitution:['constitution'],
    'civil-general':['civil',1,174], 'civil-property':['civil',175,398],
    'civil-obligations-general':['civil',399,520],
    'civil-obligations-special':['civil',521,724],
    'civil-family':['civil',725,1050],
    'criminal-general':['criminal',1,72],
    'criminal-special':['criminal',73,264],
    'civil-procedure':['civil-procedure'], 'criminal-procedure':['criminal-procedure'],
    corporations:['corporations'],
    'administrative-litigation':['administrative-litigation'],
    'administrative-procedure':['administrative-procedure'],
    'administrative-appeal':['administrative-appeal'],
    'administrative-execution':['administrative-execution'],
    'state-compensation':['state-compensation'],
    'local-autonomy':['local-autonomy'],
    'information-disclosure':['information-disclosure'],
    'labor-standards':['labor-standards'],'labor-contract':['labor-contract'],
    'labor-unions':['labor-unions'],'labor-relations':['labor-relations'],
    'labor-safety':['labor-safety'],'labor-dispatch':['labor-dispatch'],
    'minimum-wage':['minimum-wage'],'equal-employment':['equal-employment'],
    'childcare-leave':['childcare-leave']
  };
  const articleOrder = s => parseInt(s.replace(/[０-９]/g,c=>String('０１２３４５６７８９'.indexOf(c))),10);

  function buildCard(row) {
    const [number,chapter,body]=row;
    const card=document.createElement('section');
    card.className='statuteCard';
    const title=document.createElement('div');
    title.className='statuteTitle';
    const num=document.createElement('span');
    num.className='statuteNumber';
    num.textContent=number;
    title.appendChild(num);
    if (chapter) {
      const small=document.createElement('span');
      small.className='statuteHeading';
      small.textContent=chapter;
      title.appendChild(small);
    }
    const paragraph=document.createElement('p');
    paragraph.className='statuteText';
    const lines=String(body || '').split('\n');
    lines.forEach((line,index)=>{
      if(index) paragraph.appendChild(document.createTextNode('\n'));
      const m=line.match(/^([０-９]+)[ 　]+/);
      if(m){
        const prefix=document.createElement('span');
        prefix.className='statuteUnselectable';
        prefix.textContent=m[1]+'　';
        paragraph.appendChild(prefix);
      }
      const span=document.createElement('span');
      span.className='statuteSelectable';
      span.textContent=m?line.slice(m[0].length):line;
      paragraph.appendChild(span);
    });
    card.append(title,paragraph);
    return card;
  }
  function refresh(section) {
    window.StatutesReferences?.refresh?.();
    window.StatutesDefinitions?.refresh?.(section);
  }
  function displayMessage(message) {
    const p=document.createElement('p');
    p.className='statuteDataMessage';
    p.textContent=message;
    page.replaceChildren(p);
  }
  async function load(section) {
    const generationId=++generation;
    const config=sections[section];
    if (!config) { displayMessage('法令を選択してください。');return; }
    if(section==='civil-general' && !store.has('civil')) {
      // Keep the existing article list until the full dataset is ready.
    } else displayMessage('条文を読み込み中…');
    try {
      const [key,start,end]=config;
      let data=store.get(key);
      if (!data) {
        const res=await fetch('statutes-data/'+encodeURIComponent(key)+'.json?v=20261015-corpus-1',{cache:'force-cache'});
        if (!res.ok) throw Error('HTTP '+res.status);
        data=await res.json();
        if (!Array.isArray(data.articles)) throw Error('Invalid law data');
        store.set(key,data);
      }
      if (generationId!==generation) return;
      const rows=data.articles.filter(row=>{
        if(!start)return true;
        const n=articleOrder(row[0]);
        return n>=start && n<=end;
      });
      const fragment=document.createDocumentFragment();
      if (section==='constitution' && data.preamble) {
        const preamble=document.createElement('section');
        preamble.className='statuteCard';
        const header=document.createElement('div');
        header.className='statuteTitle';
        header.textContent='前文';
        const body=document.createElement('p');
        body.className='statuteText';
        body.textContent=data.preamble;
        preamble.append(header,body);
        fragment.appendChild(preamble);
      }
      rows.forEach(row=>fragment.appendChild(buildCard(row)));
      if (!rows.length) displayMessage('この分類の条文は未登録です。');
      else page.replaceChildren(fragment);
      refresh(section);
    } catch(error) {
      if(generationId!==generation)return;
      // Never present another subject's text as if it belonged to this subject.
      if (section==='civil-general' && page.innerHTML===originalMarkup) return;
      displayMessage('条文データを読み込めませんでした。');
      refresh(section);
    }
  }
  window.StatutesData={load};
})();
