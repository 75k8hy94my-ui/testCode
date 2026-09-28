import fs from 'node:fs/promises';

const cdp='http://localhost:9222';
const url='http://localhost:4174/game/index.html?overtake-route-test=1';
const screenshot='game/live-overtake-route-headless.png';
const target=await (await fetch(`${cdp}/json/new?${encodeURIComponent(url)}`,{ method:'PUT' })).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
let serial=0;
const waiters=new Map();
const diagnostics={ console:[],pageErrors:[],failedRequests:[],badResponses:[] };
const call=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial;
  const timeout=setTimeout(()=>{ waiters.delete(id);reject(new Error(`CDP timeout: ${method}`)); },10000);
  waiters.set(id,message=>{ clearTimeout(timeout);message.error?reject(new Error(message.error.message)):resolve(message); });
  ws.send(JSON.stringify({ id,method,params }));
});
const setup=`
;window.__routeTest=(()=>{
  const edge=mapModel.getEdge('residential-home-south');
  const hit=mapModel.nearestRoad(personalCar.x,personalCar.y,{vehicleOnly:true});
  const parked=trafficAlongAtRoadHit(edge,hit);
  const make=(seed,direction,along,color)=>({
    edgeId:edge.id,edgeLength:polylineLength(edge.points),directionSign:direction,laneOffset:20,
    secondaryLane:false,along,speed:0,cruise:75,color,type:'compact',brakeGlow:0,seed,
    routeEdgeIds:[edge.id],routeIndex:0,routeTrips:0,routeGoalNodeId:direction>0?edge.to:edge.from,
    overtakePlan:null,collisionYield:0,junctionWait:0,trafficStall:0,playerFlowPriority:0,
    stuckRecoveryCooldown:0,stuckRecoveryCount:0
  });
  const passer=make(56101,1,parked-200,'#8b78a4');
  const oncoming=make(56102,-1,parked+320,'#bd705f');
  oncoming.speed=0;
  Object.assign(passer,trafficPoseAt(passer,passer.along));
  Object.assign(oncoming,trafficPoseAt(oncoming,oncoming.along));
  traffic.splice(0,traffic.length,passer,oncoming);
  pedestrians.length=0;
  state.player.inHome=true;
  const samples=[];
  let sawBlockedWait=false;
  let resumedAfterWait=false;
  let passedBesideParked=false;
  let returnedToLane=false;
  let signalWhileBlocked=false;
  let passingSignal=null;
  return {
    read(){
      const oncomingDistance=(oncoming.along-passer.along)*passer.directionSign;
      if(passer.speed<2&&passer.laneOffset>16&&oncomingDistance>0&&oncomingDistance<400)sawBlockedWait=true;
      if(sawBlockedWait&&passer.overtakePlan)resumedAfterWait=true;
      if(passer.along>=parked&&passer.laneOffset < -16)passedBesideParked=true;
      if(passer.along>=parked+150&&passer.laneOffset>16&&!passer.overtakePlan)returnedToLane=true;
      const signal=passer.overtakePlan?trafficOvertake.signalFor(passer.overtakePlan,0):null;
      if(sawBlockedWait&&!passer.overtakePlan&&signal)signalWhileBlocked=true;
      if(passer.overtakePlan&&passer.laneOffset>16)passingSignal=signal;
      samples.push({along:passer.along,offset:passer.laneOffset,speed:passer.speed,plan:Boolean(passer.overtakePlan),oncomingDistance});
      return {parked,along:passer.along,offset:passer.laneOffset,speed:passer.speed,active:Boolean(passer.overtakePlan),oncomingDistance,passerEdge:passer.edgeId,oncomingEdge:oncoming.edgeId,sawBlockedWait,resumedAfterWait,passedBesideParked,returnedToLane,signalWhileBlocked,passingSignal,events:samples.slice(-12)};
    }
  };
})();
`;
ws.addEventListener('message',async({data})=>{
  const message=JSON.parse(data);
  if(message.id&&waiters.has(message.id)){waiters.get(message.id)(message);waiters.delete(message.id);return;}
  if(message.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(message.params.type))diagnostics.console.push({type:message.params.type,text:message.params.args.map(a=>a.value||a.description||'').join(' ')});
  if(message.method==='Runtime.exceptionThrown')diagnostics.pageErrors.push(message.params.exceptionDetails.text);
  if(message.method==='Network.loadingFailed')diagnostics.failedRequests.push(message.params.errorText);
  if(message.method==='Network.responseReceived'&&message.params.response.status>=400)diagnostics.badResponses.push({url:message.params.response.url,status:message.params.response.status});
  if(message.method!=='Fetch.requestPaused')return;
  const {requestId,responseStatusCode,request}=message.params;
  if(!/\/game\.js(?:\?|$)/.test(request.url)){await call('Fetch.continueRequest',{requestId});return;}
  const result=await call('Fetch.getResponseBody',{requestId});
  const original=result.result.base64Encoded?Buffer.from(result.result.body,'base64').toString():result.result.body;
  const anchor='  seedPedestriansNearActor();';
  if(!original.includes(anchor)){diagnostics.pageErrors.push('Initialization anchor not found');await call('Fetch.continueRequest',{requestId});return;}
  await call('Fetch.fulfillRequest',{requestId,responseCode:responseStatusCode||200,responseHeaders:[{name:'content-type',value:'text/javascript; charset=utf-8'},{name:'cache-control',value:'no-store'}],body:Buffer.from(original.replace(anchor,anchor+setup)).toString('base64')});
});
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Log.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});
await call('Fetch.enable',{patterns:[{urlPattern:'*game.js*',requestStage:'Response'}]});
await call('Page.navigate',{url});
const evalValue=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true});if(result.result.exceptionDetails)throw Error(result.result.exceptionDetails.text);return result.result.result.value;};
const deadline=Date.now()+12000;
while(Date.now()<deadline&&!(await evalValue('Boolean(window.__routeTest)')))await new Promise(resolve=>setTimeout(resolve,100));
if(!(await evalValue('Boolean(window.__routeTest)')))throw Error('route test setup missing');
let state;
const end=Date.now()+60000;
let sawSafeWait=false;
while(Date.now()<end){
  state=await evalValue('window.__routeTest.read()');
  sawSafeWait ||= state.oncomingDistance > -80 && state.oncomingDistance < 300 && state.offset > -16;
  if(state.events.some(e=>e.along>=state.parked+150&&e.offset>16&&!e.plan))break;
  await new Promise(resolve=>setTimeout(resolve,50));
}
state=await evalValue('window.__routeTest.read()');
const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(screenshot,Buffer.from(shot.result.data,'base64'));
const summary={sawSafeWait,...state};
delete summary.events;
console.log(JSON.stringify({state:summary,screenshot,diagnostics},null,2));
await call('Target.closeTarget',{targetId:target.id});ws.close();
if(!sawSafeWait||!summary.sawBlockedWait||!summary.resumedAfterWait||summary.signalWhileBlocked||summary.passingSignal?.side!=='right'||!summary.passedBesideParked||!summary.returnedToLane||diagnostics.pageErrors.length||diagnostics.failedRequests.length||diagnostics.badResponses.length)process.exitCode=1;
