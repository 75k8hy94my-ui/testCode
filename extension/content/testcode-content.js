(() => {
  'use strict';
  if (window.__testcodeMangaRelayInstalled) return;
  window.__testcodeMangaRelayInstalled = true;
  const REQUEST_TYPE='testcode:manga-extension:import';
  const RESULT_TYPE='testcode:manga-extension:result';
  const READY_TYPE='testcode:manga-extension:bridge-ready';
  const DELIVERY_TIMEOUT_MS=30000;
  const pending=new Map(); let bridgeReady=false;
  const diag=(stage,ok=true,detail='')=>({stage,ok,detail:String(detail||'').slice(0,300)});
  function requestId(){return'req_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);}
  function injectBridge(){if(document.querySelector('script[data-testcode-manga-extension-bridge]'))return;const script=document.createElement('script');script.dataset.testcodeMangaExtensionBridge='1';script.src=new URL('manga-extension-bridge.js',location.href).href;script.async=false;(document.head||document.documentElement).appendChild(script);}
  function deliver(draft){return new Promise((resolve)=>{const id=requestId(),diagnostics=[diag('reader-relay-received'),diag('bridge-ready',bridgeReady,bridgeReady?'bridge接続済み':'bridge準備待ち')];const timer=setTimeout(() => {pending.delete(id);diagnostics.push(diag('bridge-timeout',false,bridgeReady?'同期処理が30秒以内に完了しませんでした':'bridgeが応答しませんでした'));resolve({status:bridgeReady?'invalid':'locked',message:bridgeReady?'testCodeの同期処理がタイムアウトしました。追加待ちに残します。':'testCodeの保管庫を開いてください。',diagnostics});}, DELIVERY_TIMEOUT_MS);pending.set(id,{resolve,timer,diagnostics});window.postMessage({type:REQUEST_TYPE,requestId:id,draft},location.origin);});}
  window.addEventListener('message',(event)=>{if(event.source!==window||!event.data)return;if(event.data.type===READY_TYPE){bridgeReady=true;chrome.runtime.sendMessage({type:'TESTCODE_READY'}).catch(()=>{});return;}if(event.data.type!==RESULT_TYPE)return;const key=String(event.data.requestId||''),waiter=pending.get(key);if(!waiter)return;pending.delete(key);clearTimeout(waiter.timer);const result=event.data.result||{status:'invalid',message:'応答形式が正しくありません。'};result.diagnostics=[...waiter.diagnostics,diag('bridge-result',true,result.status),...(Array.isArray(result.diagnostics)?result.diagnostics:[])];waiter.resolve(result);});
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{if(!message||message.type!=='DELIVER_DRAFT'||!message.item)return false;deliver(message.item.draft).then(sendResponse).catch((error)=>sendResponse({status:'invalid',message:String(error&&error.message||error),diagnostics:[diag('relay-error',false,error&&error.message||error)]}));return true;});
  injectBridge();setTimeout(()=>chrome.runtime.sendMessage({type:'TESTCODE_READY'}).catch(()=>{}),500);
})();