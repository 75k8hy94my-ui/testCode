import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const errors = [];
const warnings = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const body = await fs.readFile(file);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };
    response.writeHead(200, { 'content-type':types[path.extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', onExit);
  });
}

async function removeTemporaryProfile(directory) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rm(directory, { recursive:true, force:true });
      return;
    } catch (error) {
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error.code) || attempt >= 9) throw error;
      await wait(100 * (attempt + 1));
    }
  }
}

const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'city-days-headless-'));
let chrome;
let socket;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const gameUrl = `http://127.0.0.1:${server.address().port}/game/index.html?socialNpcDebug=1`;
  chrome = spawn(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, gameUrl
  ], { stdio:['ignore','ignore','pipe'], windowsHide:true });
  let chromeStderr = '';
  chrome.stderr.setEncoding('utf8').on('data', (chunk) => { chromeStderr += chunk; });

  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  let debugPort = null;
  for (let attempt = 0; attempt < 100 && !debugPort; attempt += 1) {
    try { debugPort = Number((await fs.readFile(activePortFile, 'utf8')).split(/\r?\n/)[0]); } catch {}
    if (!debugPort) await wait(100);
  }
  if (!debugPort) throw new Error('Chrome did not expose a DevTools port: ' + chromeStderr);
  let targets;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json()); } catch {}
    if (targets?.some((target) => target.type === 'page')) break;
    await wait(100);
  }
  const page = targets?.find((target) => target.type === 'page');
  if (!page) throw new Error('Chrome did not create a page target');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once:true });
    socket.addEventListener('error', reject, { once:true });
  });
  let commandId = 0;
  const pending = new Map();
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const entry = { type:message.params.type, text:message.params.args.map((arg) => arg.value || arg.description || '').join(' ') };
      if (entry.type === 'error') errors.push(entry);
      if (entry.type === 'warning' || entry.type === 'warn') warnings.push(entry);
    } else if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    } else if (message.method === 'Log.entryAdded') {
      const entry = message.params.entry;
      if (entry.level === 'error') errors.push({ source:entry.source, text:entry.text });
      if (entry.level === 'warning' || entry.level === 'warn') warnings.push({ source:entry.source, text:entry.text });
    } else if (message.method === 'Network.loadingFailed') {
      failedRequests.push({ url:message.params.requestId, error:message.params.errorText, canceled:message.params.canceled });
    } else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      badResponses.push({ status:message.params.response.status, url:message.params.response.url });
    }
  });
  await Promise.all(['Runtime.enable','Log.enable','Network.enable','Page.enable'].map((method) => command(method)));
  await wait(1800);
  const viewports = [
    { name:'desktop', width:1280, height:800, mobile:false },
    { name:'mobile', width:390, height:844, mobile:true }
  ];
  const captures = [];
  let simulationProbe = null;
  for (const viewport of viewports) {
    await command('Emulation.setDeviceMetricsOverride', {
      width:viewport.width, height:viewport.height, deviceScaleFactor:1, mobile:viewport.mobile
    });
    await command('Page.reload', { ignoreCache:true });
    await wait(2300);
    if (viewport.name === 'desktop') {
      const openPanels = await command('Runtime.evaluate', {
        returnByValue:true,
        expression:`(() => {const ui=window.__CityDaysSocialNpcTest?.setPanelsForTest({action:true,help:true});return {ui,...window.__CityDaysSocialNpcTest?.snapshot()}})()`
      });
      await wait(1400);
      const duringPanels = await command('Runtime.evaluate', { returnByValue:true, expression:'window.__CityDaysSocialNpcTest?.snapshot()' });
      await command('Runtime.evaluate', { returnByValue:true, expression:'window.__CityDaysSocialNpcTest?.setPanelsForTest({})' });
      const targetId = await command('Runtime.evaluate', { returnByValue:true, expression:"window.__CityDaysSocialNpcTest?.openConversationForTest('aoi')" });
      const beforeConversation = await command('Runtime.evaluate', { returnByValue:true, expression:'window.__CityDaysSocialNpcTest?.snapshot()' });
      await wait(1400);
      const afterConversation = await command('Runtime.evaluate', { returnByValue:true, expression:'window.__CityDaysSocialNpcTest?.snapshot()' });
      const targetKey = targetId.result.value;
      const beforeData = beforeConversation.result.value;
      const afterData = afterConversation.result.value;
      const targetBefore = beforeData?.pedestrians?.find((ped) => ped.id === targetKey);
      const targetAfter = afterData?.pedestrians?.find((ped) => ped.id === targetKey);
      const otherDeltas = (beforeData?.pedestrians || [])
        .filter((ped) => ped.id !== targetKey && ['walking','waiting'].includes(ped.state))
        .map((ped) => {
          const moved = afterData?.pedestrians?.find((candidate) => candidate.id === ped.id);
          return moved ? Math.hypot(moved.x - ped.x, moved.y - ped.y) : 0;
        });
      simulationProbe = {
        panelsOpened:Boolean(openPanels.result.value?.ui?.actionOpen && openPanels.result.value?.ui?.helpOpen),
        clockBefore:{ day:openPanels.result.value?.day, minute:openPanels.result.value?.minute },
        clockAfter:{ day:duringPanels.result.value?.day, minute:duringPanels.result.value?.minute },
        playerPoseBefore:openPanels.result.value?.player,
        playerPoseAfter:duringPanels.result.value?.player,
        conversationTargetId:targetKey,
        targetPositionDelta:targetBefore && targetAfter ? Math.hypot(targetAfter.x - targetBefore.x, targetAfter.y - targetBefore.y) : null,
        maxOtherWalkerPositionDelta:otherDeltas.length ? Math.max(...otherDeltas) : null
      };
      await command('Runtime.evaluate', { returnByValue:true, expression:'window.__CityDaysSocialNpcTest?.setPanelsForTest({})' });
    } else {
      await command('Runtime.evaluate', { returnByValue:true, expression:"window.__CityDaysSocialNpcTest?.setPlayerContextForTest('home')" });
      await wait(250);
    }
    const evaluated = await command('Runtime.evaluate', {
      returnByValue:true,
      expression:`(() => {const snapshot=window.__CityDaysSocialNpcTest?.snapshot();const walkers=snapshot?.pedestrians?.filter(p=>p.state==='walking'||p.state==='waiting')||[];const map=window.CityDaysMapModel?.createMapModel?.();const segments=map?.pedestrianNavigation?.segmentsById;return {title:document.title,readyState:document.readyState,viewport:{width:innerWidth,height:innerHeight},canvas:(()=>{const c=document.querySelector('#gameCanvas');const r=c?.getBoundingClientRect();return c?{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height}:null})(),minimap:(()=>{const c=document.querySelector('#minimap');const r=c?.getBoundingClientRect();return c?{width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height}:null})(),runtimeError:document.querySelector('.game-runtime-error')?.textContent||null,scene:{inHome:snapshot?.player?.inHome,fixtureCount:snapshot?.homeFixtureCount},pedestrianRoutes:{total:snapshot?.pedestrians?.length||0,moving:walkers.length,typed:walkers.filter(p=>p.segmentId&&segments?.has(p.segmentId)).length,crossing:walkers.filter(p=>p.segmentType==='crosswalk').length,invalid:walkers.filter(p=>!p.segmentId||!segments?.has(p.segmentId)).slice(0,5)},traffic:{count:snapshot?.traffic?.length||0,activeJunctionTrajectories:snapshot?.traffic?.filter(car=>car.junctionTrajectoryActive).length,crossingClaims:snapshot?.crossingClaims?.length||0}}})()`
    });
    const screenshot = await command('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
    const screenshotPath = path.join(os.tmpdir(), `city-days-${viewport.name}-${Date.now()}.png`);
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    captures.push({ viewport:viewport.name, state:evaluated.result.value, screenshot:screenshotPath });
  }
  process.stdout.write(JSON.stringify({ url:gameUrl, captures, simulationProbe, consoleErrors:errors, consoleWarnings:warnings, pageErrors, failedRequests, badResponses, chromeStderr }, null, 2) + '\n');
} finally {
  try { socket?.close(); } catch {}
  if (chrome?.pid && process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio:'ignore', windowsHide:true });
      killer.once('close', resolve);
      setTimeout(resolve, 3000).unref();
    });
  } else if (chrome && !chrome.killed) {
    chrome.kill();
  }
  if (chrome && !await waitForExit(chrome)) {
    chrome.kill('SIGKILL');
    await waitForExit(chrome, 2000);
  }
  chrome?.unref();
  chrome?.stderr?.destroy();
  server.closeAllConnections?.();
  server.close();
  await removeTemporaryProfile(profileDir);
}
