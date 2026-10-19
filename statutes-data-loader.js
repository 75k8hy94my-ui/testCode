(() => {
  'use strict';
  const page = document.querySelector('#routeContent.statutesMain');
  if (!page || !document.documentElement.classList.contains('statutes-page')) return;
  const originalMarkup = page.innerHTML;
  const store = new Map();
  const requests = new Map();
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
  const fullwidth = value => String(value).replace(/[0-9]/g,c=>'０１２３４５６７８９'[Number(c)]);
  function kanjiNumber(source) {
    const digits = {〇:0,零:0,一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
    const units = {十:10,百:100,千:1000,万:10000};
    let sum=0,part=0,current=0;
    for(const ch of source) {
      if(ch in digits) { current=digits[ch]; continue; }
      if(ch==='万') { sum+=(part+current||1)*10000; part=0;current=0;continue; }
      if(!(ch in units)) return null;
      part+=(current||1)*units[ch];current=0;
    }
    return sum+part+current;
  }
  const normalizeReferences = source => String(source).replace(
    /第([〇零一二三四五六七八九十百千万]+)(条|項|号)(?:の([〇零一二三四五六七八九十百千万]+))?/g,
    (match,number,unit,suffix) => {
      const converted=kanjiNumber(number);
      if(converted===null)return match;
      const extra=suffix?kanjiNumber(suffix):null;
      return '第'+fullwidth(converted)+unit+(extra!==null?'の'+fullwidth(extra):'');
    }
  );
  let activeKey=null;
  function activeData() { return activeKey ? store.get(activeKey) : null; }
  function createReferencedCard(number) {
    const data=activeData();
    const row=data?.articles.find(item=>item[0]===number);
    return row ? buildCard(row) : null;
  }
  function hasReferencedArticle(number) {
    return Boolean(activeData()?.articles.some(row=>row[0]===number));
  }

  // e-Gov's markdown export encodes ruby as fullwidth-space-delimited
  // base text and kana: e.g. "　昏　こん　酔" => <ruby>昏<rt>こん</rt></ruby>酔.
  // Only convert this explicit pattern; never guess readings for ordinary kanji.
  const officialRubyPattern = /　([一-龯々〆ヵヶ]{1,12})　([ぁ-ゖー]{1,24})　/g;
  function appendOfficialRuby(target, source) {
    const value = String(source);
    let offset = 0;
    for (const match of value.matchAll(officialRubyPattern)) {
      if (match.index > offset) target.appendChild(document.createTextNode(value.slice(offset,match.index)));
      const ruby=document.createElement('ruby');
      ruby.appendChild(document.createTextNode(match[1]));
      const rt=document.createElement('rt');
      rt.textContent=match[2];
      ruby.appendChild(rt);
      target.appendChild(ruby);
      offset=match.index+match[0].length;
    }
    if (offset<value.length) target.appendChild(document.createTextNode(value.slice(offset)));
  }
  // Official captions are stored as the fourth entry in each static article row.
  function buildCard(row) {
    const [number,_chapter,body,articleCaption]=row;
    const card=document.createElement('section');
    card.className='statuteCard';
    const title=document.createElement('div');
    title.className='statuteTitle';
    const num=document.createElement('span');
    num.className='statuteNumber';
    num.textContent=number;
    title.appendChild(num);
    // Chapter/section labels in the legacy corpus are not article captions.
    // Render only a separately verified per-article caption (fourth field).
    const visibleCaption = typeof articleCaption === 'string' ? articleCaption.trim() : '';
    if (visibleCaption) {
      const small=document.createElement('span');
      small.className='statuteHeading';
      small.textContent=visibleCaption;
      title.appendChild(small);
    }
    const paragraph=document.createElement('p');
    paragraph.className='statuteText';
    // Some bundled statutes contain inline item labels separated by fullwidth
    // spaces instead of newlines (notably Companies Act article 2).
    // Split only unambiguous numbered item prefixes, preserving the wording.
    const formatted=String(body || '').replace(/[ 　]+(?=[一二三四五六七八九十]+[ 　]+)/g,'\n');
    const lines=formatted.split('\n');
    lines.forEach((line,index)=>{
      if(index) paragraph.appendChild(document.createTextNode('\n'));
      const m=line.match(/^([０-９]+|[一二三四五六七八九十]+)[ 　]+/);
      if(m){
        const prefix=document.createElement('span');
        prefix.className='statuteUnselectable';
        prefix.textContent=m[1]+'　';
        paragraph.appendChild(prefix);
      }
      const span=document.createElement('span');
      span.className='statuteSelectable';
      appendOfficialRuby(span,normalizeReferences(m?line.slice(m[0].length):line));
      paragraph.appendChild(span);
    });
    card.append(title,paragraph);
    return card;
  }
  // Combine runs of deleted whole-number articles; leave single deletions alone.
  function isDeleted(row) { return String(row[2] || '').trim() === '削除'; }
  function wholeArticleNumber(row) {
    const match=String(row[0]).normalize('NFKC').match(/^([0-9]+)条$/);
    return match ? Number(match[1]) : null;
  }
  function appendGroupedArticles(fragment, rows) {
    for (let i=0;i<rows.length;) {
      let end=i;
      if (isDeleted(rows[i]) && wholeArticleNumber(rows[i]) !== null) {
        while (end+1<rows.length && isDeleted(rows[end+1])
          && wholeArticleNumber(rows[end+1]) === wholeArticleNumber(rows[end])+1) end++;
      }
      if (end>i) {
        const card=document.createElement('section');
        card.className='statuteCard statuteDeletedRange';
        const title=document.createElement('div');
        title.className='statuteTitle';
        const number=document.createElement('span');
        number.className='statuteNumber';
        number.textContent=rows[i][0]+'〜'+rows[end][0];
        title.appendChild(number);
        const caption=document.createElement('span');
        caption.className='statuteHeading';
        caption.textContent='削除';
        title.appendChild(caption);
        card.appendChild(title);
        fragment.appendChild(card);
      } else {
        fragment.appendChild(buildCard(rows[i]));
      }
      i=end+1;
    }
  }
  function refresh(section) {
    // Annotation errors must not erase successfully loaded statutory text.
    try { window.StatutesReferences?.refresh?.(); } catch (error) { console.error('Statutes references:',error); }
    try { window.StatutesDefinitions?.refresh?.(section); } catch (error) { console.error('Statutes definitions:',error); }
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
    // Do not replace existing text with a transient loading/error screen.
    if (!page.querySelector('.statuteCard')) displayMessage('条文を読み込み中…');
    try {
      const [key,start,end]=config;
      let data=store.get(key);
      if (!data) {
        if (!requests.has(key)) {
          const url='statutes-data/'+encodeURIComponent(key)+'.json?v=20261017-reload';
          const request=(async()=>{
            let lastError;
            for (let attempt=0;attempt<2;attempt++) {
              try {
                const res=await fetch(url,{cache:attempt===0?'no-cache':'reload'});
                if (!res.ok) throw Error('HTTP '+res.status+' ('+key+')');
                const result=await res.json();
                if (!Array.isArray(result.articles)) throw Error('Invalid law data: '+key);
                store.set(key,result);
                return result;
              } catch(error) {
                lastError=error;
                if(attempt===0) console.warn('Retrying statute data:',key,error);
              }
            }
            throw lastError;
          })().finally(()=>requests.delete(key));
          requests.set(key,request);
        }
        data=await requests.get(key);
      }
      if (generationId!==generation) return;
      activeKey=key;
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
      appendGroupedArticles(fragment,rows);
      if (!rows.length) displayMessage('この分類の条文は未登録です。');
      else page.replaceChildren(fragment);
      refresh(section);
    } catch(error) {
      if(generationId!==generation)return;
      console.error('Statute data load failed:',section,error);
      // Keep existing text when possible, but never show a different law as the selected law.
      if (section==='civil-general' && page.innerHTML===originalMarkup) return;
      const message=document.createElement('div');
      message.className='statuteDataMessage';
      message.textContent='条文データを読み込めませんでした。';
      const retry=document.createElement('button');
      retry.type='button';
      retry.textContent='再読み込み';
      retry.style.cssText='margin-left:12px;padding:6px 10px;font:inherit;cursor:pointer';
      retry.addEventListener('click',()=>load(section));
      message.appendChild(retry);
      page.replaceChildren(message);
    }
  }
  window.StatutesData={load,hasReferencedArticle,createReferencedCard};
})();
