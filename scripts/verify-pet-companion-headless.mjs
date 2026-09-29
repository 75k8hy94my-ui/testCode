import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = process.env.PET_COMPANION_QA_DIR || path.join(os.tmpdir(), 'testcode-pet-companion-qa');
const profileDir = path.join(os.tmpdir(), `testcode-pet-chrome-${Date.now()}`);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2' };
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid path');
    const body = await fs.readFile(target);
    response.writeHead(200, { 'content-type':mime[path.extname(target)] || 'application/octet-stream', 'cache-control':'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://localhost:${server.address().port}/game/index.html`;
const debugUrl = `${baseUrl}?socialNpcDebug=1`;
const logs = { console:[], pageErrors:[], failedRequests:[], badResponses:[] };
await fs.mkdir(outputDir, { recursive:true });
const chrome = spawn(chromePath, [
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions',
  '--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,'about:blank'
], { stdio:'ignore', windowsHide:true });

let ws;
let nextId = 0;
const pending = new Map();
try {
  let port;
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  for (let i=0;i<160;i+=1) {
    try { port = Number((await fs.readFile(activePortFile,'utf8')).split(/\r?\n/)[0]); if (port) break; } catch {}
    if (chrome.exitCode != null) throw new Error(`Chromium exited early (${chrome.exitCode})`);
    await delay(100);
  }
  if (!port) throw new Error('Timed out waiting for Chromium debugging endpoint');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(debugUrl)}`,{method:'PUT'})).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(message.params.type)) {
      logs.console.push({type:message.params.type,text:message.params.args.map((arg)=>arg.value || arg.description || '').join(' ')});
    }
    if (message.method === 'Runtime.exceptionThrown') logs.pageErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.loadingFailed') logs.failedRequests.push({requestId:message.params.requestId,error:message.params.errorText});
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) logs.badResponses.push({url:message.params.response.url,status:message.params.response.status});
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call = (method,params={}) => new Promise((resolve,reject)=>{
    const id=++nextId; const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},12000);
    pending.set(id,{resolve:(value)=>{clearTimeout(timeout);resolve(value);},reject:(error)=>{clearTimeout(timeout);reject(error);}});
    ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async (expression) => {
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
    return result.result.result.value;
  };
  const screenshot = async (name) => {
    const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true});
    const file=path.join(outputDir,name); await fs.writeFile(file,Buffer.from(result.result.data,'base64')); return file;
  };
  const pressE = async () => {
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE',windowsVirtualKeyCode:69});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE',windowsVirtualKeyCode:69});
  };
  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable'); await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:debugUrl}); await delay(1600);
  const initial = JSON.parse(await evaluate(`JSON.stringify({title:document.title,hook:typeof window.__CityDaysSocialNpcTest?.movePlayerNearPlace,
    canvas:((c)=>c?{width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}:null)(document.querySelector('#gameCanvas')),
    runtimeError:document.querySelector('.game-runtime-error')?.textContent||null})`));
  if (!initial.hook) throw new Error('Local-only test hook did not load');
  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await evaluate("document.querySelector('[data-phone-app=pet]')?.click()"); await delay(100);
  const noPetPrompt = await evaluate("document.querySelector('#smartphonePanel .ios-pet-empty')?.textContent || ''");
  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await evaluate("window.__CityDaysSocialNpcTest.setMinuteForTest(600); window.__CityDaysSocialNpcTest.movePlayerNearPlace('pet-shelter')"); await pressE(); await delay(100);
  const shelter = JSON.parse(await evaluate(`JSON.stringify({title:document.querySelector('#actionTitle')?.textContent,
    choices:[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim())})`));
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('犬を迎える'))?.click()");
  await delay(200);
  const adopted = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot().petCompanion)'));
  if (adopted.pet?.speciesId !== 'dog') throw new Error(`Dog adoption through shelter UI failed: ${JSON.stringify({shelter,adopted})}`);
  await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('pet-shelter')"); await pressE(); await delay(100);
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('ペットフードを買う'))?.click()"); await delay(100);
  const adoptedWithFood = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot().petCompanion)'));

  await evaluate("window.__CityDaysSocialNpcTest.movePlayerNearPlace('home')"); await pressE(); await delay(100);
  const homeChoices = await evaluate("[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim())");
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('自宅に入る'))?.click()"); await delay(350);
  const homeScreenshot = await screenshot('pet-companion-home-desktop.png');
  const homeCanvas = JSON.parse(await evaluate(`JSON.stringify({inHome:window.__CityDaysSocialNpcTest.snapshot().player.inHome,
    canvas:((c)=>({width:c.width,height:c.height,rect:(r=>({x:r.x,y:r.y,width:r.width,height:r.height}))(c.getBoundingClientRect())}))(document.querySelector('#gameCanvas'))})`));

  await evaluate("window.__CityDaysSocialNpcTest.movePlayerToHomeFixture('pet')"); await pressE(); await delay(100);
  const care = JSON.parse(await evaluate(`JSON.stringify({title:document.querySelector('#actionTitle')?.textContent,
    choices:[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim())})`));
  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(150);
  await evaluate("document.querySelector('[data-phone-app=pet]')?.click()"); await delay(120);
  const phoneBeforeCare = JSON.parse(await evaluate(`JSON.stringify({app:document.querySelector('#smartphonePanel .ios-app-header strong')?.textContent,
    petName:document.querySelector('#smartphonePanel .ios-pet-card strong')?.textContent,
    condition:document.querySelector('#smartphonePanel .ios-pet-card small')?.textContent,
    food:document.querySelector('#smartphonePanel .ios-pet-food')?.textContent,
    panel:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(document.querySelector('#smartphonePanel').getBoundingClientRect())})`));
  const feedBefore = adoptedWithFood.pet.hunger;
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('ごはんをあげる'))?.click()"); await delay(120);
  const fed = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot().petCompanion)'));
  await delay(300);
  const phoneAfterCare = JSON.parse(await evaluate(`JSON.stringify({name:document.querySelector('#smartphonePanel .ios-pet-card strong')?.textContent,
    food:document.querySelector('#smartphonePanel .ios-pet-food')?.textContent,
    stats:[...document.querySelectorAll('#smartphonePanel .ios-pet-row b')].map(node=>node.textContent)})`));
  const phoneScreenshot = await screenshot('pet-companion-phone-desktop.png');

  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await evaluate("window.__CityDaysSocialNpcTest.movePlayerToHomeFixture('pet')"); await pressE(); await delay(100);
  const playBefore = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot().petCompanion.pet)'));
  await evaluate("[...document.querySelectorAll('#actionChoices button')].find(b=>b.textContent.includes('遊ぶ'))?.click()"); await delay(120);
  const played = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot().petCompanion.pet)'));
  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await evaluate("document.querySelector('[data-phone-app=pet]')?.click()"); await delay(100);
  const phoneAfterPlay = JSON.parse(await evaluate(`JSON.stringify({happiness:document.querySelectorAll('#smartphonePanel .ios-pet-row b')[1]?.textContent,
    bond:document.querySelectorAll('#smartphonePanel .ios-pet-row b')[3]?.textContent})`));

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await delay(180);
  await evaluate("document.querySelector('[data-phone-app=pet]')?.click()"); await delay(100);
  const mobileScreenshot = await screenshot('pet-companion-phone-mobile.png');
  const mobile = JSON.parse(await evaluate(`JSON.stringify({canvas:((c)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))(document.querySelector('#gameCanvas')),
    phoneRect:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(document.querySelector('#smartphonePanel').getBoundingClientRect()),
    phoneName:document.querySelector('#smartphonePanel .ios-pet-card strong')?.textContent,
    overflow:document.querySelector('#smartphonePanel .ios-app-content')?.scrollHeight > document.querySelector('#smartphonePanel .ios-app-content')?.clientHeight,
    runtimeError:document.querySelector('.game-runtime-error')?.textContent||null})`));
  const report={url:debugUrl,initial,noPetPrompt,shelter,homeChoices,homeCanvas,care,phone:phoneBeforeCare,phoneAfterCare,
    feed:{hungerBefore:feedBefore,hungerAfter:fed.pet?.hunger,foodAfter:fed.food},play:{happinessBefore:playBefore.happiness,happinessAfter:played.happiness,bondBefore:playBefore.bond,bondAfter:played.bond,phoneAfterPlay},mobile,
    screenshots:{home:homeScreenshot,phone:phoneScreenshot,mobile:mobileScreenshot},diagnostics:logs};
  const reportFile=path.join(outputDir,'pet-companion-diagnostics.json'); await fs.writeFile(reportFile,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,reportFile},null,2));
  if (!homeCanvas.inHome || !homeCanvas.canvas.width || phoneBeforeCare.petName !== adopted.pet.name || mobile.phoneName !== adopted.pet.name || mobile.phoneRect.width !== 390 || mobile.phoneRect.height !== 844 || phoneAfterCare.food !== '🍖 フード2個') throw new Error('Pet rendering, live refresh, or responsive phone check failed');
  if (!noPetPrompt.includes('家族を迎えよう') || !(played.happiness > playBefore.happiness) || !(played.bond > playBefore.bond)) throw new Error('No-pet prompt or play care action failed');
  if (!(fed.pet.hunger > feedBefore) || fed.food !== adoptedWithFood.food-1) throw new Error('Home feeding did not update pet data');
  if (report.initial.runtimeError || report.mobile.runtimeError) throw new Error('Game runtime error surfaced');
  if (logs.console.length || logs.pageErrors.length || logs.failedRequests.length || logs.badResponses.length) throw new Error('Browser diagnostics contain errors');
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({id:++nextId,method:'Browser.close'})); } catch {} ws.close(); }
  if (chrome.exitCode == null) chrome.kill();
  await new Promise((resolve)=>server.close(resolve));
}
