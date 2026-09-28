import fs from 'node:fs/promises';

const cdpBase = 'http://localhost:9222';
const pageUrl = 'http://localhost:4174/game/index.html?headless-overtake=1';
const screenshotPath = 'game/live-overtake-headless-20260928.png';
const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(pageUrl)}`, { method:'PUT' });
if (!response.ok) throw new Error(`Could not create headless page: HTTP ${response.status}`);
const target = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const diagnostics = { console:[], pageErrors:[], failedRequests:[], badResponses:[] };

const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`CDP command timed out: ${method}`));
  }, 10000);
  pending.set(id, (message) => {
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message);
  });
  socket.send(JSON.stringify({ id,method,params }));
});

const scenarioInjection = `
;window.__overtakeScenario = (() => {
  const edge = mapModel.getEdge("arterial-west-core");
  if (!edge) throw new Error("Temporary traffic fixture did not find the test road");
  const parkedAlong = 1050;
  const parkedPose = pointAndTangentOnPolyline(edge.points,parkedAlong);
  const parkedHit = { edgeId:edge.id,segmentIndex:parkedPose.segmentIndex,t:parkedPose.t,point:parkedPose.point };
  const tangent = parkedPose.tangent;
  personalCar.x = parkedPose.point.x - tangent.y * 23;
  personalCar.y = parkedPose.point.y + tangent.x * 23;
  personalCar.angle = Math.atan2(tangent.y,tangent.x);
  personalCar.speed = 0;
  const car = {
    edgeId:edge.id,
    edgeLength:polylineLength(edge.points),
    directionSign:1,
    laneOffset:20,
    secondaryLane:false,
    along:parkedAlong - 240,
    speed:0,
    cruise:90,
    color:"#89769e",
    type:"compact",
    brakeGlow:0,
    seed:912344,
    routeEdgeIds:[],
    routeIndex:0,
    routeTrips:0,
    overtakePlan:null,
    collisionYield:0,
    junctionWait:0,
    trafficStall:0,
    playerFlowPriority:0,
    stuckRecoveryCooldown:0,
    stuckRecoveryCount:0
  };
  const oncoming = {
    edgeId:edge.id,
    edgeLength:car.edgeLength,
    directionSign:-1,
    laneOffset:20,
    secondaryLane:false,
    along:parkedAlong - 180 + 900,
    speed:90,
    cruise:90,
    color:"#b76f61",
    type:"compact",
    brakeGlow:0,
    seed:912345,
    routeEdgeIds:[],
    routeIndex:0,
    routeTrips:0,
    overtakePlan:null,
    collisionYield:0,
    junctionWait:0,
    trafficStall:0,
    playerFlowPriority:0,
    stuckRecoveryCooldown:0,
    stuckRecoveryCount:0
  };
  oncoming.routeEdgeIds = [edge.id];
  oncoming.routeIndex = 0;
  oncoming.routeGoalNodeId = edge.from;
  Object.assign(oncoming, trafficPoseAt(oncoming, oncoming.along));
  car.routeEdgeIds = [edge.id];
  car.routeIndex = 0;
  car.routeGoalNodeId = edge.to;
  Object.assign(car, trafficPoseAt(car, car.along));
  traffic.length = 0;
  pedestrians.length = 0;
  traffic.push(car,oncoming);
  state.player.inHome = true;
  const history = [];
  const plannerHistory = [];
  const originalPlanner = trafficOvertakePlan;
  trafficOvertakePlan = function(candidate, obstacle) {
    const result = originalPlanner(candidate, obstacle);
    if (candidate === car) plannerHistory.push({
      speed:car.speed,
      parkedDistance:obstacle?.actualDistance,
      centerGap:obstacle?.centerGap,
      blocksLane:obstacle?.blocksLane,
      endpointDistance:trafficDistanceToEndpoint(car,edge),
      oncomingDistance:(oncoming.along - car.along) * car.directionSign,
      oncomingSpeed:oncoming.speed,
      result:Boolean(result)
    });
    return result;
  };
  const updateOvertake = updateTrafficOvertake;
  updateTrafficOvertake = function(candidate, dt, stationaryParkedBlock) {
    const complete = updateOvertake(candidate, dt, stationaryParkedBlock);
    if (candidate === car) history.push({
      along:car.along,
      laneOffset:car.laneOffset,
      speed:car.speed,
      active:Boolean(car.overtakePlan),
      complete:Boolean(complete)
    });
    return complete;
  };
  const originalUpdateTraffic = updateTraffic;
  updateTraffic = function(dt) {
    car.edgeId = edge.id;
    car.directionSign = 1;
    car.edgeLength = polylineLength(edge.points);
    car.routeEdgeIds = [edge.id];
    car.routeIndex = 0;
    car.laneOffset = 20;
    oncoming.edgeId = edge.id;
    oncoming.directionSign = -1;
    oncoming.edgeLength = car.edgeLength;
    oncoming.routeEdgeIds = [edge.id];
    oncoming.routeIndex = 0;
    oncoming.laneOffset = 20;
    originalUpdateTraffic(dt);
  };
  const originalFrame = frame;
  frame = function(now) {
    const parkedPosition = pointAndTangentOnPolyline(edge.points,parkedAlong);
    const carPosition = pointAndTangentOnPolyline(edge.points,car.along);
    const ahead = (parkedAlong - car.along) > 0;
    if (ahead && parkedAlong - car.along > 55 && car.speed < 8) car.speed = 80;
    Object.assign(car,trafficPoseAt(car,car.along));
    Object.assign(oncoming,trafficPoseAt(oncoming,oncoming.along));
    originalFrame(now);
  };
  return {
    snapshot() {
      const point = pointAndTangentOnPolyline(edge.points, car.along).point;
      return {
        playerIndoors:state.player.inHome,
        edgeId:car.edgeId,
        along:car.along,
        distanceToParked:parkedAlong - car.along,
        laneOffset:car.laneOffset,
        speed:car.speed,
      activePlan:car.overtakePlan ? { ...car.overtakePlan } : null,
      endpointDistance:trafficDistanceToEndpoint(car,edge),
      oncomingAlong:oncoming.along,
      oncomingSpeed:oncoming.speed,
      separation:(oncoming.along - car.along) * car.directionSign,
      oncomingPassed:(oncoming.along - car.along) * car.directionSign < 0,
        completed:history.some((event) => event.complete),
        changedLane:history.some((event) => event.laneOffset < -16),
        passedWhileOpposingLane:history.some((event) => event.along >= parkedAlong && event.laneOffset < -16),
        finalEvents:history.slice(-8),
        plannerEvents:plannerHistory.slice(-20),
        carPoint:point,
        parkedPoint:{ x:personalCar.x,y:personalCar.y }
      };
    },
    reveal() { state.player.inHome = false; }
  };
})();
`;

socket.addEventListener('message', async ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(message.params.type)) {
    diagnostics.console.push({ type:message.params.type,text:message.params.args.map((arg) => arg.value || arg.description || '').join(' ') });
  }
  if (message.method === 'Runtime.exceptionThrown') diagnostics.pageErrors.push(message.params.exceptionDetails.text);
  if (message.method === 'Network.loadingFailed') diagnostics.failedRequests.push(message.params.errorText);
  if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
    diagnostics.badResponses.push({ url:message.params.response.url,status:message.params.response.status });
  }
  if (message.method !== 'Fetch.requestPaused') return;
  const { requestId,responseStatusCode,request } = message.params;
  if (!/\/game\.js(?:\?|$)/.test(request.url)) {
    await command('Fetch.continueRequest',{ requestId });
    return;
  }
  try {
    const bodyResult = await command('Fetch.getResponseBody',{ requestId });
    const source = bodyResult.result.base64Encoded
      ? Buffer.from(bodyResult.result.body,'base64').toString('utf8')
      : bodyResult.result.body;
    const anchor = '  seedPedestriansNearActor();';
    if (!source.includes(anchor)) throw new Error('Could not find game initialization point for the temporary scenario');
    const instrumented = source.replace(anchor,anchor + scenarioInjection);
    await command('Fetch.fulfillRequest',{
      requestId,
      responseCode:responseStatusCode || 200,
      responseHeaders:[{ name:'content-type',value:'text/javascript; charset=utf-8' },{ name:'cache-control',value:'no-store' }],
      body:Buffer.from(instrumented,'utf8').toString('base64')
    });
  } catch (error) {
    diagnostics.pageErrors.push(`Test scenario injection failed: ${error.message}`);
    await command('Fetch.continueRequest',{ requestId });
  }
});

await new Promise((resolve,reject) => {
  socket.addEventListener('open',resolve,{ once:true });
  socket.addEventListener('error',reject,{ once:true });
});
await command('Runtime.enable');
await command('Page.enable');
await command('Network.enable');
await command('Log.enable');
await command('Emulation.setDeviceMetricsOverride',{ width:1365,height:768,deviceScaleFactor:1,mobile:false });
await command('Fetch.enable',{ patterns:[{ urlPattern:'*game.js*',requestStage:'Response' }] });
await command('Page.navigate',{ url:pageUrl });

const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate',{ expression,returnByValue:true,awaitPromise:true });
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
  return result.result.result.value;
};

const setupDeadline = Date.now() + 10000;
while (Date.now() < setupDeadline) {
  if (await evaluate('Boolean(window.__overtakeScenario)')) break;
  await new Promise((resolve) => setTimeout(resolve,50));
}
if (!(await evaluate('Boolean(window.__overtakeScenario)'))) throw new Error('Headless scenario was not initialized');

let passScreenshot = false;
let snapshot = null;
  const runDeadline = Date.now() + 30000;
while (Date.now() < runDeadline) {
  snapshot = await evaluate('window.__overtakeScenario.snapshot()');
  if (!passScreenshot && snapshot.oncomingPassed && snapshot.activePlan && snapshot.distanceToParked <= 28 && snapshot.distanceToParked >= -28 && snapshot.laneOffset < -16) {
    await evaluate('window.__overtakeScenario.reveal()');
    await new Promise((resolve) => setTimeout(resolve,120));
    const shot = await command('Page.captureScreenshot',{ format:'png',captureBeyondViewport:true });
    await fs.writeFile(screenshotPath,Buffer.from(shot.result.data,'base64'));
    passScreenshot = true;
  }
  if (snapshot.completed && snapshot.laneOffset > 16 && !snapshot.activePlan) break;
  await new Promise((resolve) => setTimeout(resolve,35));
}

snapshot = await evaluate('window.__overtakeScenario.snapshot()');
if (!passScreenshot) {
  await evaluate('window.__overtakeScenario.reveal()');
  const shot = await command('Page.captureScreenshot',{ format:'png',captureBeyondViewport:true });
  await fs.writeFile(screenshotPath,Buffer.from(shot.result.data,'base64'));
}
const result = {
  status:snapshot.completed && snapshot.passedWhileOpposingLane && snapshot.oncomingPassed && snapshot.laneOffset > 16 && !snapshot.activePlan ? 'passed' : 'failed',
  snapshot,
  screenshotPath,
  passScreenshot,
  diagnostics
};
console.log(JSON.stringify(result,null,2));
await command('Target.closeTarget',{ targetId:target.id });
socket.close();
if (result.status !== 'passed' || diagnostics.pageErrors.length || diagnostics.failedRequests.length || diagnostics.badResponses.length) process.exitCode = 1;
