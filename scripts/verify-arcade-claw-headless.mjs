import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = process.env.ARCADE_QA_DIR || path.join(os.tmpdir(), 'testcode-arcade-qa');
const profileDir = path.join(os.tmpdir(), `testcode-arcade-chrome-${Date.now()}`);
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
const ephemeralUrl = `http://localhost:${server.address().port}/game/index.html?socialNpcDebug=1`;
const requestedUrl = 'http://localhost:4173/game/index.html?socialNpcDebug=1';
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
  const key=async(keyName,code,down)=>call('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',key:keyName,code,windowsVirtualKeyCode:({ArrowLeft:37,ArrowRight:39,Enter:13,Space:32})[keyName]||0});
  const click=async(selector)=>{const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return r&&{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);if(!rect||!rect.width||!rect.height)throw new Error(`No visible target for ${selector}: ${JSON.stringify(rect)}`);await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});await call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});await delay(80);};
  const waitUntil=async(predicate,timeoutMs=10000)=>{const end=Date.now()+timeoutMs;while(Date.now()<end){if(await evaluate(predicate))return true;await delay(80);}return false;};
  const snap=async()=>JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:requestedUrl});
  let activeUrl=requestedUrl;
  if(!await waitUntil("document.readyState==='complete'&&!!document.querySelector('#arcadePanel')",5000)){activeUrl=ephemeralUrl;await call('Page.navigate',{url:ephemeralUrl});}
  if(!await waitUntil("document.readyState==='complete'&&!!window.__CityDaysSocialNpcTest&&!!document.querySelector('#arcadePanel')",12000))throw new Error('Game, arcade overlay, and local debug hook did not become ready');
  const initial=JSON.parse(await evaluate(`JSON.stringify({runtimeError:document.querySelector('.game-runtime-error')?.textContent||null,mapVersion:CityDaysMapModel.createMapModel().version,prizeCount:CityDaysArcadeGames.PRIZE_CATALOG.length,canvas:(c=>({width:c.width,height:c.height,rect:(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))(c.getBoundingClientRect())}))(document.querySelector('#gameCanvas'))})`));
  if(initial.runtimeError||initial.prizeCount!==6)throw new Error(`Initial arcade runtime invalid: ${JSON.stringify(initial)}`);
  if(!await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('arcade',true)"))throw new Error('Could not position the player at the arcade entrance');
  await evaluate("window.__CityDaysSocialNpcTest.setCashForTest(600);window.__CityDaysSocialNpcTest.openPlaceForTest('arcade')");
  const menu=await evaluate("JSON.stringify({title:document.querySelector('#actionTitle').textContent,choices:[...document.querySelectorAll('#actionChoices button')].map(x=>x.textContent.trim())})");
  const menuState=JSON.parse(menu);
  if(!menuState.choices.some((choice)=>choice.includes('クレーンゲーム')))throw new Error(`Arcade play option missing: ${menu}`);
  const mapScreenshot=await screenshot('arcade-facility-desktop.png');

  await click('#actionChoices button');
  if(!await waitUntil("!document.querySelector('#arcadePanel').hidden"))throw new Error('Arcade panel did not open');
  let state=await snap();
  if(state.cash!==300||!state.arcade.activePlay||state.arcadeUi.mode!=='aiming')throw new Error(`Play start did not charge exactly once: ${JSON.stringify(state)}`);
  const aimingScreenshot=await screenshot('arcade-machine-desktop.png');
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  state=await snap();
  if(state.arcadeUi.position!==40)throw new Error(`Keyboard aim failed: ${JSON.stringify(state.arcadeUi)}`);

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await delay(150);
  const mobileLayout=JSON.parse(await evaluate(`JSON.stringify((()=>{const p=document.querySelector('#arcadePanel').getBoundingClientRect();const c=document.querySelector('#arcadeCanvas').getBoundingClientRect();const b=[...document.querySelectorAll('.arcade-controls button')].map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}});return{viewport:{width:innerWidth,height:innerHeight},panel:{x:p.x,y:p.y,right:p.right,bottom:p.bottom,width:p.width,height:p.height},canvas:{width:c.width,height:c.height},buttons:b}})())`));
  const mobileScreenshot=await screenshot('arcade-machine-mobile.png');
  if(mobileLayout.buttons.some((button)=>!button.width||button.x<0||button.right>390||button.bottom>844))throw new Error(`Mobile arcade controls exceed viewport: ${JSON.stringify(mobileLayout)}`);
  const touchButton=await evaluate(`(()=>{const r=document.querySelector('#arcadeRight').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchButton.x,y:touchButton.y,id:1}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(100);
  state=await snap();
  if(state.arcadeUi.position!==45)throw new Error(`Touch aim failed: ${JSON.stringify(state.arcadeUi)}`);

  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Emulation.setTouchEmulationEnabled',{enabled:false});await delay(100);
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  await key('ArrowLeft','ArrowLeft',true);await key('ArrowLeft','ArrowLeft',false);
  state=await snap();
  if(state.arcadeUi.position!==37.5)throw new Error(`Keyboard fine aim failed: ${JSON.stringify(state.arcadeUi)}`);
  await evaluate('window.__CityDaysSocialNpcTest.setArcadeRandomForTest(.1)');
  const beforeResult=state;
  await click('#arcadeGrab');
  state=await snap();
  if(state.arcade.plays!==1||state.arcade.wins!==1||state.arcade.activePlay||state.cash!==300||state.minute<beforeResult.minute+4.99)throw new Error(`Successful play was not applied exactly once: ${JSON.stringify(state)}`);
  const winningState=state;
  const saved=await evaluate('window.__CityDaysSocialNpcTest.captureGameSnapshotForTest()');
  if(saved.arcade.wins!==1||await evaluate(`window.__CityDaysSocialNpcTest.applyGameSnapshotForTest(${JSON.stringify(saved)})`)!==true)throw new Error('Arcade snapshot restore failed');
  state=await snap();
  if(state.arcade.prizes['star-rabbit']!==1)throw new Error(`Prize did not survive save restoration: ${JSON.stringify(state.arcade)}`);

  await click('#arcadeReplay');
  state=await snap();
  if(state.cash!==0||!state.arcade.activePlay)throw new Error('Replay price was not charged once');
  await evaluate('window.__CityDaysSocialNpcTest.setArcadeRandomForTest(.999999)');
  const beforeMiss=state;
  await click('#arcadeGrab');
  state=await snap();
  if(state.arcade.plays!==2||state.arcade.wins!==1||state.cash!==0||state.minute<beforeMiss.minute+4.99)throw new Error(`Miss/repeat resolution was incorrect: ${JSON.stringify(state)}`);
  await key('Enter','Enter',true);await key('Enter','Enter',false);await delay(100);
  const afterRepeat=await snap();
  if(afterRepeat.arcade.plays!==2)throw new Error('Repeated grab created an extra play');
  const resultScreenshot=await screenshot('arcade-result-desktop.png');
  await click('#arcadeReturn');
  if(!await waitUntil("document.querySelector('#actionSheet').hidden===false"))throw new Error('Returning from the arcade did not restore its facility menu');
  const noMoneyChoice=await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('クレーンゲーム'))?.disabled");
  if(!noMoneyChoice)throw new Error('Insufficient funds did not disable replay');
  await click('#actionChoices button:nth-child(2)');
  state=await snap();
  const collectionText=await evaluate("document.querySelector('#arcadePrizeCollection').textContent");
  if(state.arcadeUi.mode!=='collection'||!state.arcadeUi.panelOpen||!collectionText.includes('所持 1個'))throw new Error('Prize collection view did not show the earned plush');
  await click('#arcadeReturn');
  if(!await waitUntil("document.querySelector('#actionSheet').hidden===false"))throw new Error('Collection view did not return to the arcade menu');

  await evaluate("window.__CityDaysSocialNpcTest.setCashForTest(300);window.__CityDaysSocialNpcTest.openPlaceForTest('arcade')");
  await click('#actionChoices button');
  if(!await waitUntil("!document.querySelector('#arcadePanel').hidden"))throw new Error('Could not start the exit-path play');
  state=await snap();
  const beforeAbandon=state;
  await key('Escape','Escape',true);await key('Escape','Escape',false);await delay(100);
  state=await snap();
  if(state.arcade.plays!==beforeAbandon.arcade.plays+1||state.arcade.wins!==beforeAbandon.arcade.wins||state.arcade.activePlay||state.cash!==0||state.minute<beforeAbandon.minute+4.99)throw new Error(`Leaving mid-play did not safely settle the paid attempt: ${JSON.stringify(state)}`);
  const abandonedState=state;

  const oldSnapshot=await evaluate('window.__CityDaysSocialNpcTest.captureGameSnapshotForTest()');
  delete oldSnapshot.arcade;
  await evaluate(`window.__CityDaysSocialNpcTest.applyGameSnapshotForTest(${JSON.stringify(oldSnapshot)})`);
  state=await snap();
  if(state.arcade.plays!==0||state.arcade.wins!==0||Object.values(state.arcade.prizes).some(Boolean))throw new Error('Old save did not migrate to an empty arcade collection');

  const report={url:activeUrl,initial,menu:menuState,mobileLayout,successfulPlay:{cash:winningState.cash,plays:winningState.arcade.plays,wins:winningState.arcade.wins,prizes:winningState.arcade.prizes},missAndReplay:{plays:afterRepeat.arcade.plays,wins:afterRepeat.arcade.wins,cash:afterRepeat.cash},abandonedPlay:{plays:abandonedState.arcade.plays,wins:abandonedState.arcade.wins,cash:abandonedState.cash},oldSnapshotMigration:{plays:state.arcade.plays,prizes:state.arcade.prizes},screenshots:{map:mapScreenshot,aiming:aimingScreenshot,mobile:mobileScreenshot,result:resultScreenshot},diagnostics:logs};
  const reportFile=path.join(outputDir,'arcade-diagnostics.json');await fs.writeFile(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile},null,2));
  if(logs.console.length||logs.pageErrors.length||logs.failedRequests.length||logs.badResponses.length)throw new Error('Browser diagnostics failed');
} finally {
  if(ws?.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify({id:++nextId,method:'Browser.close'}));}catch{}ws.close();}
  if(chrome.exitCode==null)chrome.kill();
  await new Promise(resolve=>server.close(resolve));
}
