import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const out = process.env.PACKED_MEALS_QA_DIR || path.join(os.tmpdir(), 'testcode-packed-meals-qa');
const profile = path.join(os.tmpdir(), `testcode-packed-meals-chrome-${Date.now()}`);
const mime = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png' };
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    const file = path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('invalid path');
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream','cache-control':'no-store'});
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const freshUrl = `http://localhost:${server.address().port}/game/index.html?socialNpcDebug=1`;
const requestedUrl = process.env.PACKED_MEALS_BASE_URL || 'http://localhost:4173/game/index.html?socialNpcDebug=1';
const diagnostics={console:[],pageErrors:[],failedRequests:[],badResponses:[]};
await fs.mkdir(out,{recursive:true});
const chrome=spawn(chromePath,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
let ws,nextId=0;
const pending=new Map(),requestUrls=new Map();
try {
  let port;
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let i=0;i<160;i+=1){try{port=Number((await fs.readFile(portFile,'utf8')).split(/\r?\n/)[0]);if(port)break;}catch{}if(chrome.exitCode!=null)throw Error(`Chromium exited ${chrome.exitCode}`);await delay(100);}
  if(!port)throw Error('Chromium DevTools endpoint timeout');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message',({data})=>{
    const msg=JSON.parse(data);
    if(msg.id&&pending.has(msg.id)){const item=pending.get(msg.id);pending.delete(msg.id);msg.error?item.reject(Error(msg.error.message)):item.resolve(msg);return;}
    if(msg.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(msg.params.type))diagnostics.console.push({type:msg.params.type,text:msg.params.args.map((a)=>a.value||a.description||'').join(' ')});
    if(msg.method==='Runtime.exceptionThrown')diagnostics.pageErrors.push(msg.params.exceptionDetails.text);
    if(msg.method==='Network.requestWillBeSent')requestUrls.set(msg.params.requestId,msg.params.request.url);
    if(msg.method==='Network.loadingFailed')diagnostics.failedRequests.push({url:requestUrls.get(msg.params.requestId)||'',error:msg.params.errorText});
    if(msg.method==='Network.responseReceived'&&msg.params.response.status>=400)diagnostics.badResponses.push({url:msg.params.response.url,status:msg.params.response.status});
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`));},12000);pending.set(id,{resolve:(v)=>{clearTimeout(timer);resolve(v);},reject:(e)=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression)=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.result.exceptionDetails)throw Error(result.result.exceptionDetails.text);return result.result.result.value;};
  const shot=async(name)=>{const value=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true});const file=path.join(out,name);await fs.writeFile(file,Buffer.from(value.result.data,'base64'));return file;};
  const navigate=async(url)=>{await call('Page.navigate',{url});await delay(1700);};
  const clickChoice=async(label)=>{const ok=await evaluate(`(()=>{const b=[...document.querySelectorAll('#actionChoices button')].find(x=>x.textContent.includes(${JSON.stringify(label)}));if(!b)return false;b.click();return true})()`);if(!ok)throw Error(`Missing action choice ${label}: ${await evaluate("document.querySelector('#actionChoices')?.innerText")}`);await delay(250);};
  const pressE=async()=>{await call('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE',windowsVirtualKeyCode:69});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE',windowsVirtualKeyCode:69});await delay(150);};
  const state=async()=>JSON.parse(await evaluate('JSON.stringify(window.__PackedMealsTest.snapshot())'));
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await navigate(requestedUrl);
  const requested={url:requestedUrl,loaded:await evaluate('location.href'),statusHook:await evaluate('typeof window.__CityDaysSocialNpcTest?.movePlayerToHomeFixture'),runtimeError:await evaluate('document.querySelector(".game-runtime-error")?.textContent||null')};
  const requestedScreenshot=await shot('packed-meals-requested-4173.png');
  await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(100);
  requested.mealApp=await evaluate('!!document.querySelector("[data-phone-app=meals]")');
  requested.statusHookAfterPhone=await evaluate('typeof window.__CityDaysSocialNpcTest?.movePlayerToHomeFixture');
  await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(100);
  const fallback=!(requested.statusHook==='function'&&requested.statusHookAfterPhone==='function'&&requested.mealApp&&!requested.runtimeError);
  if(fallback)await navigate(freshUrl);
  const initial=await evaluate(`JSON.stringify({url:location.href,title:document.title,hook:typeof window.__CityDaysSocialNpcTest?.movePlayerToHomeFixture,mealApp:!!document.querySelector('[data-phone-app=meals]'),canvas:(c=>({width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight}))(document.querySelector('#gameCanvas')),runtimeError:document.querySelector('.game-runtime-error')?.textContent||null})`);
  await evaluate('window.__PackedMealsTest=window.__CityDaysSocialNpcTest');
  await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(100);await evaluate("document.querySelector('[data-phone-app=meals]')?.click()");await delay(100);
  const emptyScreen=await evaluate("document.querySelector('#smartphonePanel')?.innerText");
  const emptyShot=await shot('packed-meals-empty-desktop.png');
  await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(100);
  const start=await state();
  const moved=await evaluate("window.__PackedMealsTest.movePlayerNearPlace('home')");if(!moved)throw Error('Cannot move to home entrance');
  await pressE();await clickChoice('自宅に入る');await delay(350);
  if(!(await state()).player.inHome)throw Error('Could not enter home');
  await evaluate("window.__PackedMealsTest.movePlayerToHomeFixture('kitchen')");await pressE();
  await clickChoice('弁当を作る：家庭料理');
  let cooked=await state();
  if(cooked.packedMeals?.batches?.length!==1||cooked.groceries!==1)throw Error(`First preparation did not consume/store as expected: ${JSON.stringify(cooked)}`);
  await evaluate("window.__PackedMealsTest.movePlayerToHomeFixture('kitchen')");await pressE();await clickChoice('弁当を作る：家庭料理');
  cooked=await state();
  if(cooked.packedMeals.batches.length!==2||cooked.groceries!==0)throw Error('Second preparation did not preserve distinct prep times and consume grocery');
  const preparedNeeds={...cooked.needs};
  await evaluate("window.__PackedMealsTest.movePlayerNearPlace('park',true)");
  await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(100);await evaluate("document.querySelector('[data-phone-app=meals]')?.click()");await delay(150);
  const beforeEat=await state();
  const mealCard=await evaluate(`JSON.stringify({text:document.querySelector('#smartphonePanel .ios-meal-card')?.innerText,button:!!document.querySelector('#smartphonePanel [data-phone-action=eat-meal]:not(:disabled)')})`);
  const mealInfo=JSON.parse(mealCard);if(!mealInfo.button||!mealInfo.text?.includes('家庭料理'))throw Error(`Prepared meal not available outdoors: ${mealCard}`);
  const mealsShot=await shot('packed-meals-stocked-desktop.png');
  await evaluate("document.querySelector('#smartphonePanel [data-phone-action=eat-meal]')?.click()");await delay(250);
  const eaten=await state();
  if(eaten.packedMeals.portions!==1)throw Error(`Eating must remove one serving, got ${eaten.packedMeals.portions}`);
  if(eaten.minute===beforeEat.minute)throw Error('Eating did not advance game time');
  if(eaten.needs.hunger<=preparedNeeds.hunger)throw Error('Meal effect was not applied after eating');
  const eatenShot=await shot('packed-meals-after-eating-desktop.png');
  const eatScreen=await evaluate("document.querySelector('#smartphonePanel')?.innerText");
  await evaluate("window.__PackedMealsTest.advanceTimeForTest(1440)");await delay(100);
  const expired=await state();
  if(expired.packedMeals.portions!==0)throw Error(`Meals should expire after 24h, got ${expired.packedMeals.portions}`);
  const staleMealId=eaten.packedMeals.batches[0]?.mealId;
  const beforeStale={minute:expired.minute,needs:{...expired.needs}};
  const stale=await evaluate(`window.__PackedMealsTest.eatMealForTest(${JSON.stringify(staleMealId)})`);
  const afterStale=await state();
  if(stale!==false||Math.abs(afterStale.minute-beforeStale.minute)>.2||Math.abs(afterStale.needs.hunger-beforeStale.needs.hunger)>.1)throw Error(`Expired stale meal action changed game state: ${JSON.stringify({stale,beforeStale,after:afterStale})}`);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await delay(150);
  const mobile=JSON.parse(await evaluate(`JSON.stringify({text:document.querySelector('#smartphonePanel')?.innerText,phone:(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))(document.querySelector('#smartphonePanel').getBoundingClientRect()),canvas:(c=>({width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight}))(document.querySelector('#gameCanvas')),overflow:document.querySelector('#smartphonePanel .ios-app-content')?.scrollHeight>document.querySelector('#smartphonePanel .ios-app-content')?.clientHeight,runtimeError:document.querySelector('.game-runtime-error')?.textContent||null})`));
  const mobileShot=await shot('packed-meals-mobile-expired.png');
  const report={requested,requestedScreenshot,fallback,freshUrl,initial,baseline:{minute:start.minute,groceries:start.groceries},prepared:{minute:cooked.minute,groceries:cooked.groceries,portions:cooked.packedMeals.portions,batches:cooked.packedMeals.batches},eaten:{minute:eaten.minute,portions:eaten.packedMeals.portions,needs:eaten.needs},expired:{portions:expired.packedMeals.portions},stale,eatScreen,mobile,screenshots:{empty:emptyShot,stocked:mealsShot,eaten:eatenShot,mobile:mobileShot},diagnostics};
  const reportPath=path.join(out,'packed-meals-diagnostics.json');await fs.writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportPath},null,2));
  if(!emptyScreen.includes('持ち歩きの食事はありません')||mobile.phone.width!==390||mobile.phone.height!==844||mobile.runtimeError)throw Error('Phone app visual/empty/mobile verification failed');
  if(diagnostics.console.length||diagnostics.pageErrors.length||diagnostics.failedRequests.length||diagnostics.badResponses.length)throw Error('Browser diagnostics contains console/page/request failures');
} finally {
  if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++nextId,method:'Browser.close'}));}catch{}ws.close();}
  if(chrome.exitCode==null)chrome.kill();
  await new Promise((resolve)=>server.close(resolve));
}
