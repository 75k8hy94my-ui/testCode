import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import socialNpcSystem from '../game/social-npc-system.js';

const baseUrl = process.env.SOCIAL_NPC_TEST_URL || 'http://localhost:4173/game/index.html';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputDir = process.env.SOCIAL_NPC_QA_DIR || path.join(os.tmpdir(), 'testcode-social-npc-qa');
const profileDir = path.join(os.tmpdir(), `testcode-social-npc-chrome-${Date.now()}`);
const logs = { console:[], pageErrors:[], failedRequests:[], badResponses:[] };
const debugUrl = new URL(baseUrl);
debugUrl.searchParams.set('socialNpcDebug', '1');

await fs.mkdir(outputDir, { recursive:true });
const response = await fetch(baseUrl, { method:'HEAD' });
if (!response.ok) throw new Error(`Game endpoint returned HTTP ${response.status}: ${baseUrl}`);

const chrome = spawn(chromePath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-extensions', '--disable-background-networking', '--no-first-run',
  '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
  'about:blank'
], { stdio:'ignore', windowsHide:true });

let ws;
let targetId;
let nextId = 0;
const pending = new Map();
try {
  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 160; i += 1) {
    try {
      port = Number((await fs.readFile(activePortFile, 'utf8')).split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) break;
    } catch {}
    if (chrome.exitCode != null) throw new Error(`Chromium exited early (${chrome.exitCode})`);
    await delay(100);
  }
  if (!port) throw new Error('Timed out waiting for Chromium remote debugging endpoint');

  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(baseUrl)}`, { method:'PUT' })).json();
  targetId = target.id;
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(message.params.type)) {
      logs.console.push({ type:message.params.type, text:message.params.args.map((arg) => arg.value || arg.description || '').join(' ') });
    }
    if (message.method === 'Runtime.exceptionThrown') logs.pageErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.loadingFailed') logs.failedRequests.push({ requestId:message.params.requestId, error:message.params.errorText });
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      logs.badResponses.push({ url:message.params.response.url, status:message.params.response.status });
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once:true });
    ws.addEventListener('error', reject, { once:true });
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10000);
    pending.set(id, {
      resolve:(message) => { clearTimeout(timeout); resolve(message); },
      reject:(error) => { clearTimeout(timeout); reject(error); }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
    return result.result.result.value;
  };
  const screenshot = async (name) => {
    const result = await call('Page.captureScreenshot', { format:'png', captureBeyondViewport:true, fromSurface:true });
    const file = path.join(outputDir, name);
    await fs.writeFile(file, Buffer.from(result.result.data, 'base64'));
    return file;
  };

  await call('Runtime.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Log.enable');
  await call('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await call('Page.navigate', { url:baseUrl });
  await delay(500);
  const debugHookHiddenWithoutOptIn = await evaluate('typeof window.__CityDaysSocialNpcTest === "undefined"');
  await call('Page.navigate', { url:debugUrl.href });
  await delay(1800);

  const desktop = await evaluate(`JSON.stringify({
    title:document.title,
    canvas:((c)=>c?{width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}:null)(document.querySelector('#gameCanvas')),
    socialCatalog:window.CityDaysSocialNpcSystem?.catalog?.length ?? null,
    debugHook:typeof window.__CityDaysSocialNpcTest?.snapshot === 'function',
    debugHookHiddenWithoutOptIn:${debugHookHiddenWithoutOptIn},
    runtimeError:document.querySelector('.game-runtime-error')?.textContent || null
  })`);
  const desktopScreenshot = await screenshot('social-npc-desktop.png');

  await evaluate("document.querySelector('#smartphoneToggle')?.click()");
  await delay(150);
  await evaluate("document.querySelector('[data-phone-app=phone]')?.click()");
  await delay(150);
  const contacts = await evaluate(`JSON.stringify({
    count:document.querySelectorAll('#smartphonePanel .ios-contact-row').length,
    names:[...document.querySelectorAll('#smartphonePanel .ios-contact-row b')].map((node)=>node.textContent),
    colors:[...new Set([...document.querySelectorAll('#smartphonePanel .ios-avatar')].map((node)=>getComputedStyle(node).getPropertyValue('--avatar').trim()))],
    panelHidden:document.querySelector('#smartphonePanel')?.hidden
  })`);
  const phoneScreenshot = await screenshot('social-npc-phone-desktop.png');

  await call('Emulation.setDeviceMetricsOverride', { width:390, height:844, deviceScaleFactor:1, mobile:true });
  await call('Emulation.setTouchEmulationEnabled', { enabled:true, maxTouchPoints:5 });
  await delay(250);
  const mobile = await evaluate(`JSON.stringify({
    canvas:((c)=>c?{width:c.width,height:c.height,cssWidth:c.clientWidth,cssHeight:c.clientHeight}:null)(document.querySelector('#gameCanvas')),
    phoneRect:((r)=>r?{x:r.x,y:r.y,width:r.width,height:r.height}:null)(document.querySelector('#smartphonePanel')?.getBoundingClientRect()),
    contactCount:document.querySelectorAll('#smartphonePanel .ios-contact-row').length,
    runtimeError:document.querySelector('.game-runtime-error')?.textContent || null
  })`);
  const mobileScreenshot = await screenshot('social-npc-mobile.png');

  await call('Emulation.setDeviceMetricsOverride', { width:1440, height:900, deviceScaleFactor:1, mobile:false });
  await call('Emulation.setTouchEmulationEnabled', { enabled:false });
  await delay(150);
  await evaluate("document.querySelector('[data-phone-action=home-screen]')?.click()");
  await delay(120);
  await evaluate("document.querySelector('[data-phone-app=find]')?.click()");
  await delay(120);
  let friendFinder = JSON.parse(await evaluate(`JSON.stringify({
    markerCount:document.querySelectorAll('#smartphonePanel .find-friend-marker').length,
    hiddenRows:[...document.querySelectorAll('#smartphonePanel .ios-list-row')].filter((row)=>row.textContent.includes('位置非表示')).length,
    contactIds:[...document.querySelectorAll('#smartphonePanel [data-contact-id]')].map((node)=>node.getAttribute('data-contact-id')),
    markers:[...document.querySelectorAll('#smartphonePanel .find-friend-marker')].map((node)=>({id:node.dataset.contactId,style:node.getAttribute('style'),label:node.getAttribute('aria-label')}))
  })`));
  const findScreenshot = await screenshot('social-npc-friend-finder.png');

  const interactionAttempt = { targetId:null, actionTitle:null, choices:[], friendshipAfter:null, inviteAccepted:false, routeSamples:[] };
  const initialSnapshot = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
  interactionAttempt.initialCitizenStates = initialSnapshot.citizens.map(({ id, state, currentActivityId, visible }) => ({ id, state, currentActivityId, visible }));
  const availableTargets = initialSnapshot.citizens
    .filter((citizen) => friendFinder.contactIds.includes(citizen.id) && citizen.visible && citizen.state === 'walking' && citizen.currentActivityId !== 'park');
  let openedAction = null;
  for (const candidate of availableTargets) {
    if (!await evaluate(`window.__CityDaysSocialNpcTest.movePlayerNear(${JSON.stringify(candidate.id)})`)) continue;
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'e', code:'KeyE', windowsVirtualKeyCode:69 });
    await call('Input.dispatchKeyEvent', { type:'keyUp', key:'e', code:'KeyE', windowsVirtualKeyCode:69 });
    await delay(100);
    openedAction = JSON.parse(await evaluate(`JSON.stringify({
      hidden:document.querySelector('#actionSheet')?.hidden ?? true,
      title:document.querySelector('#actionTitle')?.textContent || '',
      choices:[...document.querySelectorAll('#actionChoices button')].map((button)=>button.textContent.trim())
    })`));
    if (openedAction.title === candidate.name && openedAction.choices.some((choice) => choice.startsWith('公園に誘う'))) {
      interactionAttempt.targetId = candidate.id;
      interactionAttempt.expectedName = candidate.name;
      interactionAttempt.actionTitle = openedAction.title;
      interactionAttempt.choices = openedAction.choices;
      if (!interactionAttempt.screenshots) interactionAttempt.screenshots = [];
      interactionAttempt.screenshots.push(await screenshot(`social-npc-conversation-${candidate.id}.png`));
      await evaluate("[...document.querySelectorAll('#actionChoices button')].find((button)=>button.textContent.startsWith('公園に誘う'))?.click()");
      await delay(120);
      interactionAttempt.toast = await evaluate("document.querySelector('#toast')?.textContent || ''");
      const afterInvite = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
      const invited = afterInvite.citizens.find((citizen) => citizen.id === candidate.id);
      interactionAttempt.inviteAccepted = /誘|予定|向か|一緒/.test(interactionAttempt.toast) && Boolean(invited?.socialActivityRequest);
      if (interactionAttempt.inviteAccepted) break;
      interactionAttempt.rejections = [...(interactionAttempt.rejections || []), { id:candidate.id, toast:interactionAttempt.toast }];
      await call('Input.dispatchKeyEvent', { type:'keyDown', key:'e', code:'KeyE', windowsVirtualKeyCode:69 });
      await call('Input.dispatchKeyEvent', { type:'keyUp', key:'e', code:'KeyE', windowsVirtualKeyCode:69 });
      await delay(80);
      continue;
    }
    await call('Input.dispatchKeyEvent', { type:'keyDown', key:'e', code:'KeyE', windowsVirtualKeyCode:69 });
    await call('Input.dispatchKeyEvent', { type:'keyUp', key:'e', code:'KeyE', windowsVirtualKeyCode:69 });
    await delay(80);
  }
  if (interactionAttempt.targetId) {
    const afterInvite = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'));
    const invited = afterInvite.citizens.find((citizen) => citizen.id === interactionAttempt.targetId);
    interactionAttempt.inviteAccepted = /誘|予定|向か|一緒/.test(interactionAttempt.toast) && Boolean(invited?.socialActivityRequest);
    for (let sample = 0; sample < 5 && invited; sample += 1) {
      await delay(500);
      const current = JSON.parse(await evaluate('JSON.stringify(window.__CityDaysSocialNpcTest.snapshot())'))
        .citizens.find((citizen) => citizen.id === interactionAttempt.targetId);
      if (!current) break;
      interactionAttempt.routeSamples.push({ x:current.x, y:current.y, state:current.state, currentActivityId:current.currentActivityId,
        routeEdgeIds:current.routeEdgeIds, routeIndex:current.routeIndex, request:Boolean(current.socialActivityRequest) });
    }
  }

  const diagnosticFile = path.join(outputDir, 'social-npc-diagnostics.json');
  const report = {
    url:baseUrl,
    endpointStatus:response.status,
    desktop:JSON.parse(desktop),
    contacts:JSON.parse(contacts),
    mobile:JSON.parse(mobile),
    friendFinder,
    interactionAttempt,
    screenshots:{ desktop:desktopScreenshot, phone:phoneScreenshot, mobile:mobileScreenshot, friendFinder:findScreenshot },
    diagnostics:logs
  };
  await fs.writeFile(diagnosticFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, diagnosticFile }, null, 2));
  if (report.desktop.socialCatalog !== 10) throw new Error(`Expected ten catalog entries, got ${report.desktop.socialCatalog}`);
  if (!report.desktop.debugHook) throw new Error('Local-only headless NPC test instrumentation was not installed');
  if (!report.desktop.debugHookHiddenWithoutOptIn) throw new Error('NPC test instrumentation is exposed without the explicit debug query');
  if (report.contacts.count !== 10) throw new Error(`Expected ten phone contacts, got ${report.contacts.count}`);
  const expectedNames = socialNpcSystem.catalog.map((profile) => profile.name);
  if (JSON.stringify(report.contacts.names) !== JSON.stringify(expectedNames)) {
    throw new Error(`Served page is not using this checkout's NPC catalog: ${report.contacts.names.join(', ')}`);
  }
  if (report.contacts.colors.length !== 10) throw new Error(`Expected ten profile colors, got ${report.contacts.colors.length}`);
  if (report.mobile.contactCount !== 10) throw new Error(`Expected ten contacts on mobile, got ${report.mobile.contactCount}`);
  if (!report.interactionAttempt.inviteAccepted) throw new Error('Could not complete a real NPC invitation through the game UI');
  if (report.interactionAttempt.routeSamples.length < 3) throw new Error('Could not sample the invited NPC route over time');
  if (Math.hypot(report.interactionAttempt.routeSamples.at(-1).x - report.interactionAttempt.routeSamples[0].x,
    report.interactionAttempt.routeSamples.at(-1).y - report.interactionAttempt.routeSamples[0].y) < 1) {
    throw new Error('Invited NPC did not advance along its walking route during observation');
  }
  for (let i = 1; i < report.interactionAttempt.routeSamples.length; i += 1) {
    const before = report.interactionAttempt.routeSamples[i - 1];
    const after = report.interactionAttempt.routeSamples[i];
    if (Math.hypot(after.x - before.x, after.y - before.y) > 180) throw new Error('NPC position jumped during route observation');
  }
  if (report.desktop.runtimeError || report.mobile.runtimeError) throw new Error('Game runtime surfaced an error');
  if (logs.console.length || logs.pageErrors.length || logs.failedRequests.length || logs.badResponses.length) {
    throw new Error('Headless browser diagnostics contain errors; see the report above');
  }
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ id:++nextId, method:'Browser.close' })); } catch {}
    ws.close();
  }
  if (chrome.exitCode == null) chrome.kill();
}
