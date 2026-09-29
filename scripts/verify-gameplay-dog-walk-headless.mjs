import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = process.env.DOG_WALK_QA_DIR || path.join(os.tmpdir(), 'testcode-dog-walk-qa');
const profileDir = path.join(os.tmpdir(), `testcode-dog-walk-chrome-${Date.now()}`);
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
const localUrl = `http://localhost:${server.address().port}/game/index.html?socialNpcDebug=1`;
const url = 'http://localhost:4173/game/index.html?socialNpcDebug=1';
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
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
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
  const key=async(key,code,down)=>call('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key,code,windowsVirtualKeyCode:key==='e'?69:0});
  const tapE=async()=>{await key('e','KeyE',true);await key('e','KeyE',false);await delay(100);};
  const snap=async()=>JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url});await delay(1400);
  let activeUrl=url;
  let status=await evaluate('document.readyState');
  if(status!=='complete'||!await evaluate('window.__CityDaysSocialNpcTest')){activeUrl=localUrl;await call('Page.navigate',{url:localUrl});await delay(1400);}
  const initial=JSON.parse(await evaluate(`JSON.stringify({ready:document.readyState,runtimeError:document.querySelector('.game-runtime-error')?.textContent||null,canvas:(c=>({width:c.width,height:c.height,rect:(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))(c.getBoundingClientRect())}))(document.querySelector('#gameCanvas'))})`));
  if(!await evaluate('window.__CityDaysSocialNpcTest'))throw new Error(`Local-only test hook unavailable at either localhost endpoint: ${JSON.stringify({activeUrl,initial,logs})}`);

  await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(100);await evaluate("document.querySelector('[data-phone-app=pet]')?.click()");await delay(80);await evaluate("document.querySelector('#smartphoneToggle')?.click()");await delay(80);
  await evaluate("window.__CityDaysSocialNpcTest.setMinuteForTest(600);window.__CityDaysSocialNpcTest.movePlayerNearPlace('pet-shelter')");await tapE();
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('犬を迎える'))?.click()");await delay(120);
  const adopted=await snap();
  if(adopted.petCompanion.pet?.speciesId!=='dog')throw new Error('Dog adoption via the game UI failed');

  await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('home')");await tapE();
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('自宅に入る'))?.click()");await delay(250);
  await evaluate("window.__CityDaysSocialNpcTest.movePlayerToHomeFixture('pet')");await tapE();
  const choices=await evaluate("[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim())");
  if(!choices.some(text=>text.includes('犬の散歩へ出る')))throw new Error(`Walk action missing at pet fixture: ${JSON.stringify(choices)}`);
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('犬の散歩へ出る'))?.click()");await delay(180);
  const started=await snap();
  if(!started.petWalk.active||started.player.inHome)throw new Error('Walk did not leave the house with an active trail');
  const startX=started.player.x;
  const startY=started.player.y;

  await key('Shift','ShiftLeft',true);await key('w','KeyW',true);await delay(5000);await key('w','KeyW',false);await key('Shift','ShiftLeft',false);await delay(900);
  const outbound=await snap();
  const routePoints=outbound.petWalk.trail.length;
  const followerDistance=outbound.petWalk.followerDistance;
  const followed=Math.hypot(outbound.petWalk.petX-outbound.player.x,outbound.petWalk.petY-outbound.player.y);
  const routeScreenshot=await screenshot('dog-walk-route-desktop.png');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await delay(180);
  const routeMobileScreenshot=await screenshot('dog-walk-route-mobile.png');
  const routeMobile=JSON.parse(await evaluate(`JSON.stringify({canvas:(c=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))(document.querySelector('#gameCanvas')),walkActive:window.__CityDaysSocialNpcTest.snapshot().petWalk.active})`));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await call('Emulation.setTouchEmulationEnabled',{enabled:false});await delay(80);
  if(outbound.petWalk.distance<100||routePoints<3||followerDistance<=0||followed<20)throw new Error(`Dog did not follow real player movement: ${JSON.stringify({outbound,routePoints,followed})}`);
  const saved=await evaluate('window.__CityDaysSocialNpcTest.captureGameSnapshotForTest()');
  const restoreOk=await evaluate(`window.__CityDaysSocialNpcTest.applyGameSnapshotForTest(${JSON.stringify(saved)})`);
  const restored=await snap();
  if(restoreOk!==true||!restored.petWalk.active||Math.abs(restored.petWalk.distance-outbound.petWalk.distance)>.01)throw new Error('Active dog walk did not survive snapshot round-trip');

  const guards=JSON.parse(await evaluate('JSON.stringify({car:window.__CityDaysSocialNpcTest.attemptCarBoardForTest(),train:window.__CityDaysSocialNpcTest.attemptTrainBoardForTest()})'));
  await key('Shift','ShiftLeft',true);await key('s','KeyS',true);await delay(6000);await key('s','KeyS',false);await key('Shift','ShiftLeft',false);await delay(1800);
  const nearHome=await snap();
  const returnSeparation=Math.hypot(nearHome.player.x-nearHome.petWalk.petX,nearHome.player.y-nearHome.petWalk.petY);
  if(Math.hypot(nearHome.player.x-startX,nearHome.player.y-startY)>130)throw new Error(`Player failed to walk back near home: ${JSON.stringify(nearHome.player)}`);
  if(returnSeparation>90)throw new Error(`Dog did not catch up near home: ${returnSeparation}`);
  await tapE();
  const returnChoices=await evaluate("[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim())");
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('自宅に入る'))?.click()");await delay(150);
  const returned=await snap();
  if(returned.petWalk.active||returned.petCompanion.pet.happiness<=started.petCompanion.pet.happiness)throw new Error(`Dog walk did not complete on close home return: ${JSON.stringify({returnChoices,returned})}`);

  const mobile={...routeMobile,runtimeError:await evaluate("document.querySelector('.game-runtime-error')?.textContent||null")};
  const report={url:activeUrl,initial,choices,started:{petWalk:started.petWalk,player:started.player},outbound:{distance:outbound.petWalk.distance,points:routePoints,followerDistance,player:outbound.player,dog:{x:outbound.petWalk.petX,y:outbound.petWalk.petY},separation:followed},snapshotRoundTrip:{ok:restoreOk,distance:restored.petWalk.distance},guards,return:{choices:returnChoices,separation:returnSeparation,player:nearHome.player},completed:{active:returned.petWalk.active,walksCompleted:returned.petCompanion.walksCompleted,pet:returned.petCompanion.pet},mobile,screenshots:{route:routeScreenshot,routeMobile:routeMobileScreenshot},diagnostics:logs};
  const reportFile=path.join(outputDir,'dog-walk-diagnostics.json');await fs.writeFile(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile},null,2));
  if(!initial.canvas.width||mobile.runtimeError||logs.console.length||logs.pageErrors.length||logs.failedRequests.length||logs.badResponses.length)throw new Error('Canvas or browser diagnostics failed');
  if(guards.car.inVehicle||guards.train.inTrain||!guards.car.walkActive||!guards.train.walkActive)throw new Error('Vehicle/train boarding guard check failed');
} finally {
  if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++nextId,method:'Browser.close'}));}catch{}ws.close();}
  if(chrome.exitCode==null)chrome.kill();
  await new Promise(resolve=>server.close(resolve));
}
