import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root=path.resolve(import.meta.dirname,'..');
const chromePath=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const out=path.join(os.tmpdir(),'testcode-wardrobe-qa');
const profile=path.join(os.tmpdir(),`testcode-wardrobe-chrome-${Date.now()}`);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('bad path');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end('not found');}});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const url=`http://localhost:${server.address().port}/game/index.html?socialNpcDebug=1`;
const requestedUrl=process.env.WARDROBE_QA_BASE_URL||'http://localhost:4173/game/index.html?socialNpcDebug=1';
const diagnostics={console:[],pageErrors:[],failedRequests:[],badResponses:[]};
await fs.mkdir(out,{recursive:true});
const chrome=spawn(chromePath,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,nextId=0;const pending=new Map(),requestUrls=new Map();
try{
  let port;const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<160;i+=1){try{port=Number((await fs.readFile(portFile,'utf8')).split(/\r?\n/)[0]);if(port)break;}catch{}if(chrome.exitCode!=null)throw Error(`Chromium exited ${chrome.exitCode}`);await delay(100);}
  if(!port)throw Error('Chromium DevTools endpoint timeout');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message',({data})=>{const msg=JSON.parse(data);if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg);return;}if(msg.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(msg.params.type))diagnostics.console.push({type:msg.params.type,text:msg.params.args.map((a)=>a.value||a.description||'').join(' ')});if(msg.method==='Runtime.exceptionThrown')diagnostics.pageErrors.push(msg.params.exceptionDetails.text);if(msg.method==='Network.requestWillBeSent')requestUrls.set(msg.params.requestId,msg.params.request.url);if(msg.method==='Network.loadingFailed')diagnostics.failedRequests.push({url:requestUrls.get(msg.params.requestId)||'',error:msg.params.errorText});if(msg.method==='Network.responseReceived'&&msg.params.response.status>=400)diagnostics.badResponses.push({url:msg.params.response.url,status:msg.params.response.status});});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`));},12000);pending.set(id,{resolve:(v)=>{clearTimeout(timer);resolve(v);},reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression)=>{const v=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(v.result.exceptionDetails)throw Error(v.result.exceptionDetails.text);return v.result.result.value;};
  const shot=async(name)=>{const img=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true});const file=path.join(out,name);await fs.writeFile(file,Buffer.from(img.result.data,'base64'));return file;};
  const navigate=async(targetUrl)=>{await call('Page.navigate',{url:targetUrl});await delay(1400);};
  const pressE=async()=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE',windowsVirtualKeyCode:69});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE',windowsVirtualKeyCode:69});await delay(120);};
  const click=async(label)=>{const ok=await evaluate(`(()=>{const b=[...document.querySelectorAll('#actionChoices button')].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!b)return false;b.click();return true})()`);if(!ok)throw Error(`Action not found: ${label} / ${await evaluate("document.querySelector('#actionSheet')?.innerText")}`);await delay(220);};
  const state=async()=>JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Log.enable');await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await navigate(requestedUrl);
  const requested={url:requestedUrl,loaded:await evaluate('location.href'),hasWardrobe:await evaluate('Boolean(window.CityDaysWardrobe&&window.__CityDaysSocialNpcTest?.snapshot()?.wardrobe)'),error:await evaluate('document.querySelector(".game-runtime-error")?.textContent||null')};
  const requestedScreenshot=await shot('wardrobe-requested-4173.png');
  const fallback=!requested.hasWardrobe||Boolean(requested.error);
  if(fallback){for(const entries of Object.values(diagnostics))entries.length=0;requestUrls.clear();await navigate(url);}
  if(await evaluate('typeof window.__CityDaysSocialNpcTest?.snapshot')!=='function')throw Error('Game test hook did not load');
  const test=await evaluate('window.__CityDaysSocialNpcTest');
  const legacy=await evaluate("window.__CityDaysSocialNpcTest.applyGameSnapshotForTest({version:1,day:1,minute:480,cash:8000,player:{x:1200,y:1200}})");
  const migrated=await state();if(migrated.wardrobe.equippedOutfitId!=='everyday'||migrated.wardrobe.ownedOutfitIds.join()!=='everyday')throw Error(`Legacy migration failed ${JSON.stringify(migrated.wardrobe)}`);
  const defaultAppearance=await evaluate('window.__CityDaysSocialNpcTest.playerAppearanceForTest()');
  const baseline=await state();if(!(await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('store')")))throw Error('Cannot position at store');await pressE();
  const shopBefore=await evaluate("document.querySelector('#actionSheet')?.innerText||''");
  await click('藍染めデニム');const bought=await state();
  if(!bought.wardrobe.ownedOutfitIds.includes('indigo-denim')||bought.cash!==baseline.cash-1200||Math.abs(bought.minute-baseline.minute-10)>.5||bought.wardrobe.equippedOutfitId!=='everyday')throw Error(`Purchase transition invalid ${JSON.stringify({before:baseline,after:bought})}`);
  const shopAfter=await evaluate("document.querySelector('#actionSheet')?.innerText||''");if(!shopAfter.includes('藍染めデニム')||!shopAfter.includes('購入済み'))throw Error(`Shop not refreshed after purchase: ${shopAfter}`);
  const duplicateDisabled=await evaluate("(()=>[...document.querySelectorAll('#actionChoices button')].find(x=>x.textContent.includes('藍染めデニム'))?.disabled)()");if(duplicateDisabled!==true)throw Error('Owned outfit remained purchasable');
  const afterDisabledRepeat=await state();if(afterDisabledRepeat.cash!==bought.cash||afterDisabledRepeat.minute!==bought.minute)throw Error('Rejected duplicate purchase changed cash or time');
  const shopShot=await shot('wardrobe-shop-purchased.png');
  await evaluate("document.querySelector('#actionClose').click()");
  await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('home')");await pressE();await click('自宅に入る');await delay(160);
  if(!(await state()).player.inHome)throw Error('Could not enter home');
  const outsideEquip=await evaluate("window.__CityDaysSocialNpcTest.equipOutfitForTest('indigo-denim')");if(outsideEquip!==false)throw Error('Outfit could be changed outside closet');
  await evaluate("window.__CityDaysSocialNpcTest.movePlayerToHomeFixture('closet')");await pressE();
  const closetBefore=await evaluate("document.querySelector('#actionSheet')?.innerText||''");if(!closetBefore.includes('藍染めデニム'))throw Error(`Purchased outfit missing from closet: ${closetBefore}`);
  await click('藍染めデニム');const equipped=await state();
  if(equipped.wardrobe.equippedOutfitId!=='indigo-denim'||Math.abs(equipped.minute-bought.minute-5)>.5)throw Error(`Equip transition invalid ${JSON.stringify({bought:bought.minute,equipped:equipped.minute,wardrobe:equipped.wardrobe})}`);
  const closetAfter=await evaluate("document.querySelector('#actionSheet')?.innerText||''");if(!closetAfter.includes('着用中'))throw Error(`Closet did not refresh active outfit: ${closetAfter}`);
  const homeShot=await shot('wardrobe-closet-equipped.png');const homeAppearance=await evaluate('window.__CityDaysSocialNpcTest.playerAppearanceForTest()');
  await evaluate("window.__CityDaysSocialNpcTest.setPlayerContextForTest('street');document.querySelector('#actionClose').click()");if((await state()).player.inHome)throw Error('Could not leave home');
  const streetAppearance=await evaluate('window.__CityDaysSocialNpcTest.playerAppearanceForTest()');if(homeAppearance.outfitId!=='indigo-denim'||streetAppearance.outfitId!=='indigo-denim'||homeAppearance.top!==streetAppearance.top||streetAppearance.top===defaultAppearance.top)throw Error('Outfit appearance differs between scenes or does not visibly change');
  const streetShot=await shot('wardrobe-street-equipped.png');
  const mobileShot=await (async()=>{await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);return shot('wardrobe-mobile.png')})();
  const metrics=await evaluate("(()=>{const c=document.querySelector('#gameCanvas'),r=c.getBoundingClientRect();return {canvas:{width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight},bounds:{x:r.x,y:r.y,width:r.width,height:r.height},error:document.querySelector('.game-runtime-error')?.textContent||null}})()");
  const report={requested,requestedScreenshot,fallback,url,legacy,migratedWardrobe:migrated.wardrobe,defaultAppearance,shopBefore,shopAfter,duplicateDisabled,bought:{cash:bought.cash,minute:bought.minute,wardrobe:bought.wardrobe},closetBefore,closetAfter,equipped:{minute:equipped.minute,wardrobe:equipped.wardrobe},homeAppearance,streetAppearance,metrics,screenshots:{shop:shopShot,home:homeShot,street:streetShot,mobile:mobileShot},diagnostics};
  await fs.writeFile(path.join(out,'wardrobe-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(metrics.error||Object.values(diagnostics).some((rows)=>rows.length))throw Error('Browser diagnostics reported an error/warning/request failure');
}finally{
  if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++nextId,method:'Browser.close'}));}catch{}ws.close();}
  if(chrome.exitCode==null)chrome.kill();await new Promise((resolve)=>server.close(resolve));
}
