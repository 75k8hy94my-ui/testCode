import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = process.env.LIBRARY_READING_QA_DIR || path.join(os.tmpdir(), 'testcode-library-reading-qa');
const profileDir = path.join(os.tmpdir(), `testcode-library-chrome-${Date.now()}`);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2' };
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
const fallbackUrl = `http://localhost:${server.address().port}/game/index.html`;
const requestedBaseUrl = process.env.LIBRARY_READING_BASE_URL || 'http://localhost:4173/game/index.html';
let baseUrl = fallbackUrl;
try {
  const response = await fetch(requestedBaseUrl, { signal:AbortSignal.timeout(2500) });
  if (response.ok) baseUrl = requestedBaseUrl;
} catch {}
const debugUrl = new URL(baseUrl);
debugUrl.searchParams.set('socialNpcDebug', '1');
const url = debugUrl.href;
let flowUrl = url;
const diagnostics = { console:[], pageErrors:[], failedRequests:[], expectedAborts:[], badResponses:[] };
await fs.mkdir(outputDir, { recursive:true });
const chrome = spawn(chromePath, [
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-extensions',
  '--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,'about:blank'
], { stdio:'ignore', windowsHide:true });
let ws;
let nextId = 0;
const pending = new Map();
const requestUrls = new Map();
let intentionalFallbackNavigation = false;
try {
  let port;
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  for (let i=0;i<160;i+=1) {
    try { port = Number((await fs.readFile(activePortFile,'utf8')).split(/\r?\n/)[0]); if (port) break; } catch {}
    if (chrome.exitCode != null) throw new Error(`Chromium exited early (${chrome.exitCode})`);
    await delay(100);
  }
  if (!port) throw new Error('Timed out waiting for Chromium debugging endpoint');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(message.params.type)) {
      diagnostics.console.push({type:message.params.type,text:message.params.args.map((arg)=>arg.value || arg.description || '').join(' ')});
    }
    if (message.method === 'Runtime.exceptionThrown') diagnostics.pageErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') requestUrls.set(message.params.requestId,message.params.request.url);
    if (message.method === 'Network.loadingFailed') {
      const failure = {requestId:message.params.requestId,url:requestUrls.get(message.params.requestId) || '',error:message.params.errorText};
      if (message.params.errorText === 'net::ERR_ABORTED' && message.params.type === 'Document' && intentionalFallbackNavigation) diagnostics.expectedAborts.push(failure);
      else diagnostics.failedRequests.push(failure);
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) diagnostics.badResponses.push({url:message.params.response.url,status:message.params.response.status});
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  const call = (method,params={}) => new Promise((resolve,reject)=>{
    const id=++nextId; const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},12000);
    pending.set(id,{resolve:(value)=>{clearTimeout(timeout);resolve(value);},reject:(error)=>{clearTimeout(timeout);reject(error);}});
    ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async (expression) => {
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.result.exceptionDetails) throw new Error(JSON.stringify({text:result.result.exceptionDetails.text,exception:result.result.exceptionDetails.exception?.description,url}));
    return result.result.result.value;
  };
  const screenshot = async (name) => {
    const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true});
    const file=path.join(outputDir,name); await fs.writeFile(file,Buffer.from(result.result.data,'base64')); return file;
  };
  const pressE = async () => {
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE',windowsVirtualKeyCode:69});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE',windowsVirtualKeyCode:69});
    await delay(100);
  };
  const clickChoice = async (text) => {
    const clicked = await evaluate(`(()=>{const b=[...document.querySelectorAll('#actionChoices button')].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`);
    if (!clicked) {
      const evidence = await evaluate(`JSON.stringify({title:document.querySelector('#actionTitle')?.textContent,choices:[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim()),nearest:window.__LibraryReadingTestHook.snapshot().nearestInteraction,libraryReading:window.__LibraryReadingTestHook.snapshot().libraryReading})`);
      throw new Error(`Action choice not found: ${text}; UI=${evidence}`);
    }
    await delay(180);
  };
  const state = async () => JSON.parse(await evaluate('JSON.stringify(window.__LibraryReadingTestHook.snapshot())'));

  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable'); await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url}); await delay(1700);
  const initial = JSON.parse(await evaluate(`JSON.stringify({title:document.title,hook:typeof window.__CityDaysSocialNpcTest?.movePlayerNearPlace,
    canvas:((c)=>c?{width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}:null)(document.querySelector('#gameCanvas')),
    runtimeError:document.querySelector('.game-runtime-error')?.textContent||null,href:location.href})`));
  if (initial.runtimeError) throw new Error(`Game did not start cleanly: ${JSON.stringify(initial)}`);
  const requestedBooksApp = await evaluate('!!document.querySelector("[data-phone-app=books]")');
  await evaluate('window.__LibraryReadingTestHook = window.__CityDaysSocialNpcTest');

  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  const hookAfterOpen = await evaluate('typeof window.__CityDaysSocialNpcTest');
  await evaluate("document.querySelector('[data-phone-app=books]')?.click()"); await delay(120);
  const hookAfterBooks = await evaluate('typeof window.__CityDaysSocialNpcTest');
  let emptyShelf = await evaluate("document.querySelector('#smartphonePanel .ios-books-empty')?.textContent || ''");
  let emptyPhoneShot = await screenshot(baseUrl === requestedBaseUrl ? 'library-empty-bookshelf-requested-server.png' : 'library-empty-bookshelf-desktop.png');
  const hookAfterScreenshot = await evaluate('typeof window.__CityDaysSocialNpcTest');
  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);

  const hookState = await evaluate('JSON.stringify({href:location.href, original:typeof window.__CityDaysSocialNpcTest, saved:typeof window.__LibraryReadingTestHook})');
  let fallbackReason = null;
  if (initial.hook !== 'function' || !hookState.includes('"saved":"object"')) {
    fallbackReason = initial.hook !== 'function'
      ? `The requested localhost page loaded without the local-only gameplay test hook (initial type: ${initial.hook})${requestedBooksApp ? '' : ' or the new 本棚 phone app'}; UI/screenshot checks were captured before falling back to the current workspace.`
      : `The requested localhost server clears the local-only test hook after its phone-toggle interaction (${hookState}; phases=${hookAfterOpen}/${hookAfterBooks}/${hookAfterScreenshot}).`;
    const fallbackDebugUrl = new URL(fallbackUrl);
    fallbackDebugUrl.searchParams.set('socialNpcDebug', '1');
    flowUrl = fallbackDebugUrl.href;
    intentionalFallbackNavigation = true;
    await call('Page.navigate',{url:fallbackDebugUrl.href}); await delay(1300);
    await evaluate('window.__LibraryReadingTestHook = window.__CityDaysSocialNpcTest');
    await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
    await evaluate("document.querySelector('[data-phone-app=books]')?.click()"); await delay(120);
    emptyShelf = await evaluate("document.querySelector('#smartphonePanel .ios-books-empty')?.textContent || ''");
    emptyPhoneShot = await screenshot('library-empty-bookshelf-desktop.png');
    await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  }
  await evaluate("window.__LibraryReadingTestHook.setMinuteForTest(480)"); await delay(120);
  const baseline = await state();
  await evaluate("window.__LibraryReadingTestHook.movePlayerNearPlace('library', true)");
  const atLibrary = await state();
  await pressE();
  const libraryMenu = JSON.parse(await evaluate(`JSON.stringify({title:document.querySelector('#actionTitle')?.textContent,
    choices:[...document.querySelectorAll('#actionChoices button')].map(b=>b.textContent.trim())})`));
  if (!libraryMenu.choices.some((choice)=>choice.includes('『はじめての家庭料理』を借りる'))) {
    throw new Error(`Library interaction missing; hook=${JSON.stringify(atLibrary.nearestInteraction)}, menu=${JSON.stringify(libraryMenu)}`);
  }
  const libraryShot = await screenshot('library-borrow-menu-desktop.png');
  await clickChoice('『はじめての家庭料理』を借りる');
  let borrowed = await state();
  if (borrowed.libraryReading.loans.length !== 1) throw new Error('Borrow action did not create a loan');

  await evaluate("window.__LibraryReadingTestHook.movePlayerNearPlace('home')"); await pressE();
  await clickChoice('自宅に入る'); await delay(350);
  const home = await state();
  if (!home.player.inHome) throw new Error('Could not enter home through the home interaction');
  await evaluate("window.__LibraryReadingTestHook.movePlayerToHomeFixture('sofa')"); await pressE();
  const beforeChapterOne = await state();
  await clickChoice('『はじめての家庭料理』を読む');
  let chapterOne = await state();
  if (chapterOne.libraryReading.loans[0]?.chaptersRead !== 1) throw new Error('Sofa reading did not record chapter one');
  const chapterElapsed = chapterOne.minute - beforeChapterOne.minute;
  if (chapterElapsed < 45 || chapterElapsed > 47) throw new Error(`A chapter should add 45 game minutes (allowing for real-time clock drift): ${beforeChapterOne.minute} -> ${chapterOne.minute}`);

  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await evaluate("document.querySelector('[data-phone-app=books]')?.click()"); await delay(300);
  const firstShelf = JSON.parse(await evaluate(`JSON.stringify({name:document.querySelector('#smartphonePanel .ios-book-card b')?.textContent,
    progress:document.querySelector('#smartphonePanel .ios-book-card small')?.textContent,
    completed:document.querySelector('#smartphonePanel .ios-books-summary b')?.textContent,
    phone:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(document.querySelector('#smartphonePanel').getBoundingClientRect())})`));
  const desktopPhoneShot = await screenshot('library-bookshelf-progress-desktop.png');

  for (let chapter=2;chapter<=3;chapter+=1) {
    await evaluate("window.__LibraryReadingTestHook.movePlayerToHomeFixture('sofa')"); await pressE();
    await clickChoice('『はじめての家庭料理』を読む');
    await delay(330);
  }
  const complete = await state();
  const liveShelf = JSON.parse(await evaluate(`JSON.stringify({progress:document.querySelector('#smartphonePanel .ios-book-card small')?.textContent,
    complete:document.querySelector('#smartphonePanel .ios-book-card em')?.textContent,
    count:document.querySelector('#smartphonePanel .ios-books-summary b')?.textContent})`));
  const completedShot = await screenshot('library-bookshelf-complete-desktop.png');
  if (complete.libraryReading.loans[0]?.chaptersRead !== 3 || complete.libraryReading.completedBookIds.length !== 1) {
    throw new Error(`Completion state invalid: ${JSON.stringify(complete.libraryReading)}`);
  }
  if (complete.skills.cooking !== baseline.skills.cooking + 3) throw new Error(`First completion skill reward should be +3: ${baseline.skills.cooking} -> ${complete.skills.cooking}`);
  if (!liveShelf.progress?.includes('第3章') || liveShelf.complete !== '読了' || liveShelf.count !== '読了 1冊') {
    throw new Error(`Open bookshelf did not live-update after reading: ${JSON.stringify(liveShelf)}`);
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await delay(180);
  const ownedMobile = JSON.parse(await evaluate(`JSON.stringify({name:document.querySelector('#smartphonePanel .ios-book-card b')?.textContent,
    progress:document.querySelector('#smartphonePanel .ios-book-card small')?.textContent,
    phone:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(document.querySelector('#smartphonePanel').getBoundingClientRect()),
    canvas:((c)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))(document.querySelector('#gameCanvas'))})`));
  const ownedMobileShot = await screenshot('library-bookshelf-owned-mobile.png');

  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false}); await delay(100);
  await evaluate("window.__LibraryReadingTestHook.setMinuteForTest(480)"); await delay(250);
  await evaluate("window.__LibraryReadingTestHook.movePlayerNearPlace('library', true)"); await pressE();
  await clickChoice('『はじめての家庭料理』を返す');
  const returned = await state();
  if (returned.libraryReading.loans.length !== 0 || returned.libraryReading.completedBookIds.length !== 1) {
    throw new Error(`Return did not preserve completed history: ${JSON.stringify(returned.libraryReading)}`);
  }

  await evaluate("window.__LibraryReadingTestHook.movePlayerNearPlace('library', true)"); await pressE();
  await clickChoice('『はじめての家庭料理』を借りる');
  await evaluate("window.__LibraryReadingTestHook.movePlayerNearPlace('home')"); await pressE(); await clickChoice('自宅に入る'); await delay(250);
  for (let chapter=1;chapter<=3;chapter+=1) {
    await evaluate("window.__LibraryReadingTestHook.movePlayerToHomeFixture('sofa')"); await pressE();
    await clickChoice('『はじめての家庭料理』を読む');
  }
  const reread = await state();
  if (reread.skills.cooking !== complete.skills.cooking || reread.libraryReading.completedBookIds.length !== 1) {
    throw new Error(`Re-reading a completed title must not farm skill: ${complete.skills.cooking} -> ${reread.skills.cooking}`);
  }
  await evaluate("window.__LibraryReadingTestHook.movePlayerNearPlace('library', true)"); await pressE();
  await clickChoice('『はじめての家庭料理』を返す');
  const finalShelfState = await state();

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5}); await delay(180);
  await evaluate("document.querySelector('#smartphoneToggle')?.click()"); await delay(100);
  await evaluate("document.querySelector('[data-phone-app=books]')?.click()"); await delay(120);
  const mobile = JSON.parse(await evaluate(`JSON.stringify({completed:document.querySelector('#smartphonePanel .ios-books-summary b')?.textContent,
    empty:document.querySelector('#smartphonePanel .ios-books-empty')?.textContent,
    phone:((r)=>({x:r.x,y:r.y,width:r.width,height:r.height}))(document.querySelector('#smartphonePanel').getBoundingClientRect()),
    canvas:((c)=>({width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}))(document.querySelector('#gameCanvas')),
    overflow:document.querySelector('#smartphonePanel .ios-app-content')?.scrollHeight > document.querySelector('#smartphonePanel .ios-app-content')?.clientHeight,
    runtimeError:document.querySelector('.game-runtime-error')?.textContent||null})`));
  const mobileShot = await screenshot('library-bookshelf-mobile.png');
  const report = {requestedUrl:url,flowUrl,initial,requestedBooksApp,requestedServerFallback:fallbackReason,emptyShelf,libraryMenu,borrowed:borrowed.libraryReading,chapterOne:chapterOne.libraryReading,firstShelf,completed:complete.libraryReading,liveShelf,firstSkillReward:{before:baseline.skills.cooking,after:complete.skills.cooking},returned:returned.libraryReading,reread:{skills:reread.skills,progress:reread.libraryReading},finalShelfState:finalShelfState.libraryReading,mobile,
    ownedMobile,screenshots:{empty:emptyPhoneShot,library:libraryShot,desktop:desktopPhoneShot,complete:completedShot,ownedMobile:ownedMobileShot,mobile:mobileShot},diagnostics};
  const reportPath = path.join(outputDir,'library-reading-diagnostics.json');
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,reportPath},null,2));

  if (!emptyShelf.includes('市立図書館') || !emptyShelf.includes('貸出中の本はありません')) throw new Error('Empty bookshelf guidance did not render');
  if (firstShelf.name !== 'はじめての家庭料理' || !firstShelf.progress.includes('第1章')) throw new Error('Phone shelf missed the first chapter');
  if (ownedMobile.name !== 'はじめての家庭料理' || !ownedMobile.progress.includes('第3章') || ownedMobile.phone.width !== 390 || ownedMobile.phone.height !== 844) throw new Error('Mobile owned-shelf card did not fit the phone viewport');
  if (!mobile.empty?.includes('市立図書館') || mobile.completed !== '読了 1冊' || mobile.phone.width !== 390 || mobile.phone.height !== 844 || mobile.runtimeError) throw new Error('Mobile shelf layout or completion display failed');
  if (initial.canvas.width <= 0 || initial.canvas.height <= 0 || diagnostics.console.length || diagnostics.pageErrors.length || diagnostics.failedRequests.length || diagnostics.badResponses.length) {
    throw new Error('Canvas or browser diagnostics check failed');
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify({id:++nextId,method:'Browser.close'})); } catch {} ws.close(); }
  if (chrome.exitCode == null) chrome.kill();
  await new Promise((resolve)=>server.close(resolve));
}
