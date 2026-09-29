import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = process.env.PREPARED_MEALS_QA_DIR || path.join(os.tmpdir(), 'testcode-prepared-meals-qa');
const profileDir = path.join(os.tmpdir(), `testcode-prepared-meals-chrome-${Date.now()}`);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid path');
    response.writeHead(200, { 'content-type':mime[path.extname(target)] || 'application/octet-stream', 'cache-control':'no-store' });
    response.end(await fs.readFile(target));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fallbackUrl = `http://localhost:${server.address().port}/game/index.html?socialNpcDebug=1`;
const logs = { console:[], pageErrors:[], failedRequests:[], badResponses:[] };
await fs.mkdir(outputDir, { recursive:true });
const chrome = spawn(chromePath, ['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profileDir}`,'about:blank'], { stdio:'ignore', windowsHide:true });
let ws;
let nextId = 0;
const pending = new Map();
try {
  let port;
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  for (let i=0;i<160;i+=1) {
    try { port=Number((await fs.readFile(activePortFile,'utf8')).split(/\r?\n/)[0]); if(port) break; } catch {}
    if(chrome.exitCode!=null) throw new Error(`Chromium exited early (${chrome.exitCode})`);
    await delay(100);
  }
  if(!port) throw new Error('Timed out waiting for Chromium CDP');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message',({data})=>{
    const message=JSON.parse(data);
    if(message.id&&pending.has(message.id)){const waiter=pending.get(message.id);pending.delete(message.id);if(message.error)waiter.reject(new Error(message.error.message));else waiter.resolve(message);return;}
    if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))logs.console.push({type:message.params.type,text:message.params.args.map(arg=>arg.value||arg.description||'').join(' ')});
    if(message.method==='Runtime.exceptionThrown')logs.pageErrors.push(message.params.exceptionDetails.text);
    if(message.method==='Network.loadingFailed')logs.failedRequests.push({error:message.params.errorText});
    if(message.method==='Network.responseReceived'&&message.params.response.status>=400)logs.badResponses.push({url:message.params.response.url,status:message.params.response.status});
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.result.exceptionDetails)throw new Error(result.result.exceptionDetails.text);return result.result.result.value;};
  const screenshot=async name=>{const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true});const file=path.join(outputDir,name);await fs.writeFile(file,Buffer.from(result.result.data,'base64'));return file;};
  const click=async(selector)=>{const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r&&{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);if(!rect||!rect.width||!rect.height)throw new Error(`No visible target for ${selector}`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});await call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});await delay(100);};
  const waitUntil=async(predicate,timeoutMs=10000)=>{const end=Date.now()+timeoutMs;while(Date.now()<end){if(await evaluate(predicate))return true;await delay(80);}return false;};
  const snapshot=async()=>JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  let activeUrl='http://localhost:4173/game/index.html?socialNpcDebug=1';
  await call('Page.navigate',{url:activeUrl});
  if(!await waitUntil("document.readyState==='complete'&&!!window.__CityDaysSocialNpcTest&&!!window.CityDaysStorePreparedFood",3500)){activeUrl=fallbackUrl;await call('Page.navigate',{url:activeUrl});}
  if(!await waitUntil("document.readyState==='complete'&&!!window.__CityDaysSocialNpcTest&&!!window.CityDaysStorePreparedFood",12000))throw new Error('Prepared-food game runtime and local test hook did not become ready');
  const initial=await snapshot();
  if(!initial.storePreparedFood||initial.storePreparedFood.remaining['onigiri-set']!==8)throw new Error(`Prepared-food inventory did not initialize: ${JSON.stringify(initial.storePreparedFood)}`);
  if(!await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('store',true)"))throw new Error('Could not position player near supermarket');
  await evaluate("window.__CityDaysSocialNpcTest.setPausedForTest(true);window.__CityDaysSocialNpcTest.openPlaceForTest('store')");
  const menu=JSON.parse(await evaluate("JSON.stringify([...document.querySelectorAll('#actionChoices button')].map(button=>({text:button.textContent.trim(),disabled:button.disabled,rect:(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom}))(button.getBoundingClientRect())})))"));
  const mealChoice=menu.find((item)=>item.text.includes('おにぎりセット'));
  if(!mealChoice||mealChoice.disabled||!mealChoice.text.includes('残り 8個'))throw new Error(`Store meal UI missing stock or enabled purchase: ${JSON.stringify(menu)}`);
  const desktopShot=await screenshot('prepared-meals-store-desktop.png');
  await click('#actionChoices button');
  let state=await snapshot();
  if(state.cash!==7720||state.storePreparedFood.remaining['onigiri-set']!==7||state.packedMeals.portions!==1)throw new Error(`UI purchase was not applied exactly once: ${JSON.stringify({cash:state.cash,stock:state.storePreparedFood,meals:state.packedMeals})}`);
  await evaluate("window.__CityDaysSocialNpcTest.buyPreparedFoodForTest('onigiri-set')");
  state=await snapshot();
  if(state.cash!==7440||state.storePreparedFood.remaining['onigiri-set']!==6||state.packedMeals.portions!==2)throw new Error('Second purchase did not debit once and persist stock');
  const batch=state.packedMeals.batches[0];
  const beforeHunger=state.needs.hunger;
  if(!await evaluate(`window.__CityDaysSocialNpcTest.eatMealForTest(${JSON.stringify(batch.mealId)})`))throw new Error('Fresh prepared meal could not be eaten');
  state=await snapshot();
  if(state.packedMeals.portions!==1||state.needs.hunger<=beforeHunger)throw new Error('Eating prepared meal did not consume one portion and restore hunger');
  const saved=await evaluate('window.__CityDaysSocialNpcTest.captureGameSnapshotForTest()');
  await evaluate("window.__CityDaysSocialNpcTest.setClockForTest(2,480)");
  state=await snapshot();
  if(state.storePreparedFood.remaining['onigiri-set']!==8)throw new Error('Daily store stock did not replenish');
  const legacy=structuredClone(saved);
  delete legacy.storePreparedFood;
  await evaluate(`window.__CityDaysSocialNpcTest.applyGameSnapshotForTest(${JSON.stringify(legacy)})`);
  state=await snapshot();
  if(state.storePreparedFood.remaining['onigiri-set']!==8)throw new Error('Legacy snapshot did not initialize the daily stock');
  await evaluate(`window.__CityDaysSocialNpcTest.applyGameSnapshotForTest(${JSON.stringify(saved)})`);
  state=await snapshot();
  if(state.day!==1||state.storePreparedFood.remaining['onigiri-set']!==6||state.packedMeals.portions!==1)throw new Error('Snapshot restoration did not restore daily stock and food inventory');
  await evaluate("window.__CityDaysSocialNpcTest.setCashForTest(0);window.__CityDaysSocialNpcTest.openPlaceForTest('store')");
  const noFunds=await evaluate("(()=>{const button=[...document.querySelectorAll('#actionChoices button')].find(item=>item.textContent.includes('おにぎりセット'));return button&&{disabled:button.disabled,text:button.textContent}})()");
  if(!noFunds?.disabled||!noFunds.text.includes('所持金不足'))throw new Error(`Insufficient funds were not shown as unavailable: ${JSON.stringify(noFunds)}`);
  await evaluate("window.__CityDaysSocialNpcTest.setCashForTest(1000)");

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await evaluate("window.__CityDaysSocialNpcTest.openPlaceForTest('store')");
  const mobile=JSON.parse(await evaluate("JSON.stringify({viewport:{width:innerWidth,height:innerHeight},buttons:[...document.querySelectorAll('#actionChoices button')].slice(0,3).map(button=>{const r=button.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}})})"));
  const mobileShot=await screenshot('prepared-meals-store-mobile.png');
  if(mobile.buttons.some(button=>button.x<0||button.right>390||button.y<0||button.bottom>844||!button.width))throw new Error(`Prepared-food controls exceed mobile viewport: ${JSON.stringify(mobile)}`);
  const report={url:activeUrl,initialStock:initial.storePreparedFood,menu,afterTwoPurchases:{cash:7440,stock:6,portions:2},afterEating:{portions:state.packedMeals.portions,hunger:state.needs.hunger},noFunds,mobile,screenshots:{desktop:desktopShot,mobile:mobileShot},diagnostics:logs};
  const reportFile=path.join(outputDir,'prepared-meals-diagnostics.json');await fs.writeFile(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile},null,2));
  if(logs.console.length||logs.pageErrors.length||logs.failedRequests.length||logs.badResponses.length)throw new Error('Browser diagnostics failed');
} finally {
  if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++nextId,method:'Browser.close'}));}catch{}ws.close();}
  if(chrome.exitCode==null)chrome.kill();
  await new Promise(resolve=>server.close(resolve));
}
