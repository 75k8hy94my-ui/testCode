import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import phoneModule from '../game/phone-system.js';

const phoneSource = fs.readFileSync(new URL('../game/phone-system.js', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game/game.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../game/game.css', import.meta.url), 'utf8');

test('phone system exposes a broad app catalog', () => {
  assert.equal(phoneModule.appCount, 20);
  assert.equal(typeof phoneModule.createPhoneSystem, 'function');
  for (const id of [
    'phone','messages','maps','camera','photos','weather','calendar','clock',
    'notes','reminders','wallet','health','find','transit','mail','news',
    'music','calculator','home','settings'
  ]) {
    assert.match(phoneSource, new RegExp('"' + id + '"'));
  }
});

test('phone system is loaded before the game runtime', () => {
  assert.match(html, /phone-system\.js\?v=[^"]+/);
  assert.ok(html.indexOf('phone-system.js') < html.indexOf('game.js'));
  assert.match(gameSource, /CityDaysPhoneSystem\?\.createPhoneSystem/);
});

test('phone has iPhone-style system surfaces', () => {
  assert.match(phoneSource, /dynamic-island/);
  assert.match(phoneSource, /ios-home-indicator/);
  assert.match(phoneSource, /通知センター/);
  assert.match(phoneSource, /コントロールセンター/);
  assert.match(phoneSource, /ios-lock-screen/);
  assert.match(css, /\.dynamic-island/);
  assert.match(css, /\.ios-dock/);
  assert.match(css, /\.ios-home-indicator/);
});

test('phone maps integrate with walking and driving destinations', () => {
  assert.match(gameSource, /function setPhoneWaypoint\(placeId\)/);
  assert.match(gameSource, /state\.phone\.waypoint = place\.id/);
  assert.match(gameSource, /if \(state\.player\.inVehicle\)[\s\S]*setDrivingDestination\(place\)/);
  assert.match(gameSource, /徒歩ナビ:/);
  assert.match(gameSource, /const phoneWaypoint = PLACES\.find/);
});

test('phone camera stores actual game canvas captures', () => {
  assert.match(gameSource, /function capturePhonePhoto\(\)/);
  assert.match(gameSource, /tctx\.drawImage\(canvas/);
  assert.match(gameSource, /toDataURL\("image\/jpeg", \.72\)/);
  assert.match(phoneSource, /data-phone-action="take-photo"/);
  assert.match(phoneSource, /ios-photo-grid/);
});

test('phone receives live game data for health, contacts, transport and wallet', () => {
  assert.match(gameSource, /function phoneModelSnapshot\(\)/);
  assert.match(gameSource, /needs:\{ \.\.\.state\.needs \}/);
  assert.match(gameSource, /npcs:NPCS\.map/);
  assert.match(gameSource, /stations:TRAIN_STATIONS\.map/);
  assert.match(gameSource, /trains:trains\.map/);
  assert.match(gameSource, /nextRentDay:nextRentDay\(\)/);
});

test('phone waypoint persists in game snapshots', () => {
  assert.match(gameSource, /phone:\s*\{[\s\S]*waypoint: state\.phone\?\.waypoint/);
  assert.match(gameSource, /saved\.phone && typeof saved\.phone\.waypoint === "string"/);
});

test('phone health app displays the sixth health need and includes it in its overall condition', () => {
  const root = {
    hidden:false,
    innerHTML:"",
    classList:{ toggle() {} },
    style:{ setProperty() {} },
    addEventListener() {}
  };
  const phone = phoneModule.createPhoneSystem({ root });
  phone.update({ needs:{ hunger:80, energy:70, hygiene:60, social:50, fun:40, health:25 } });
  phone.openApp('health');

  assert.match(root.innerHTML, /健康/);
  assert.match(root.innerHTML, /<strong>54%<\/strong>/);
});

test('phone health app refreshes when health falls all the way to zero', () => {
  const root = {
    hidden:false,
    innerHTML:"",
    classList:{ toggle() {} },
    style:{ setProperty() {} },
    addEventListener() {}
  };
  const phone = phoneModule.createPhoneSystem({ root });
  const needs = { hunger:70, energy:70, hygiene:70, social:70, fun:70, health:100 };
  phone.update({ needs });
  phone.openApp('health');
  needs.health = 0;
  phone.update({ needs });

  assert.match(root.innerHTML, /<b>0<\/b><\/div><\/section>/);
  assert.match(root.innerHTML, /<strong>58%<\/strong>/);
});

test('friend finder only exposes visible NPC coordinates and tracks a temporary walking target', () => {
  assert.match(gameSource, /distance:npc\.hidden \? null : distance\(p\.x, p\.y, npc\.x, npc\.y\)/);
  assert.match(gameSource, /mapDX:npc\.hidden \? null/);
  assert.match(gameSource, /mapDY:npc\.hidden \? null/);
  assert.match(gameSource, /phoneFriendWaypointTarget\(\)/);
  const snapshotSource = gameSource.slice(gameSource.indexOf('function phoneModelSnapshot()'),gameSource.indexOf('function setPhoneWaypoint('));
  assert.match(snapshotSource, /friendWaypoint:\s*friendWaypoint\s*\? \{[\s\S]*hidden:Boolean\(friendWaypoint\.hidden\)[\s\S]*friendWaypoint\.hidden \? \{\} : \{[\s\S]*distance:distance\(p\.x, p\.y, friendWaypoint\.x, friendWaypoint\.y\)/);
  assert.match(gameSource, /function setPhoneFriendWaypoint\(npcId\)/);
  assert.match(gameSource, /if \(state\.player\.inHome \|\| state\.player\.inVehicle \|\| state\.player\.inTrain\)/);
  assert.match(gameSource, /friendRoute:\(npcId\) => setPhoneFriendWaypoint\(npcId\)/);
  assert.match(gameSource, /friendWaypointId: null/);
  assert.match(phoneSource, /data-phone-action="friend-route"/);
});

test('Find shows live visible friends and starts a friend waypoint without exposing indoor locations', () => {
  const handlers = new Map();
  const root = {
    hidden:false,
    innerHTML:"",
    classList:{ toggle() {} },
    style:{ setProperty() {} },
    addEventListener(type, handler) { handlers.set(type, handler); }
  };
  const routed = [];
  const cleared = [];
  const phone = phoneModule.createPhoneSystem({
    root,
    callbacks:{ friendRoute:(id) => routed.push(id),clearRoute:() => cleared.push(true) }
  });
  const clickAction = (phoneAction, extra = {}) => handlers.get("click")({
    target:{ closest(selector) {
      return selector === "[data-phone-action]" ? { dataset:{ phoneAction,...extra } } : null;
    } }
  });
  const clickApp = (phoneApp) => handlers.get("click")({
    target:{ closest(selector) {
      return selector === "[data-phone-app]" ? { dataset:{ phoneApp } } : null;
    } }
  });
  phone.update({
    day:1,
    minute:510,
    npcs:[
      { id:"aoi",name:"アオイ",hidden:false,distance:42,activity:"公園で休憩",mapDX:240,mapDY:-120 },
      { id:"mei",name:"メイ",hidden:false,distance:45,activity:"読書・勉強",mapDX:250,mapDY:-115 },
      { id:"sora",name:"ソラ",hidden:true,distance:null,activity:"勤務中",mapDX:null,mapDY:null }
    ]
  });
  phone.openApp("find");

  assert.match(root.innerHTML,/アオイ/);
  assert.match(root.innerHTML,/data-phone-action="friend-route" data-contact-id="aoi"/);
  const friendMarkerPositions = [...root.innerHTML.matchAll(/class="find-friend-marker"[^>]*style="left:(\d+)%;top:(\d+)%"/g)]
    .map((match) => ({ x:Number(match[1]),y:Number(match[2]) }));
  assert.equal(friendMarkerPositions.length,2);
  assert.match(root.innerHTML,/<button class="find-friend-marker"[^>]*data-phone-action="friend-route"[^>]*data-contact-id="aoi"[^>]*aria-label="アオイに会いに行く"/);
  assert.match(root.innerHTML,/<button class="find-friend-marker"[^>]*data-phone-action="friend-route"[^>]*data-contact-id="mei"[^>]*aria-label="メイに会いに行く"/);
  assert.ok(Math.hypot(
    (friendMarkerPositions[0].x - friendMarkerPositions[1].x) * 3.46,
    (friendMarkerPositions[0].y - friendMarkerPositions[1].y) * 1.74
  ) >= 23);
  assert.match(root.innerHTML,/ソラ/);
  assert.match(root.innerHTML,/屋内/);
  assert.doesNotMatch(root.innerHTML,/data-contact-id="sora"/);

  clickAction("friend-route",{contactId:"aoi"});
  clickAction("friend-route",{contactId:"mei"});
  assert.deepEqual(routed,["aoi","mei"]);

  phone.update({
    day:1,minute:510,
    friendWaypoint:{id:"aoi",name:"アオイ",distance:45},
    npcs:[{id:"aoi",name:"アオイ",hidden:false,distance:45,activity:"移動中",mapDX:400,mapDY:-250}]
  });
  assert.match(root.innerHTML,/left:58%;top:38%/);
  assert.match(root.innerHTML,/<button class="find-friend-marker active"[^>]*data-phone-action="clear-route"[^>]*aria-label="アオイへの案内中。タップして解除"[^>]*>✓<\/button>/);
  assert.match(root.innerHTML,/<button class="ios-friend-route active" type="button" data-phone-action="clear-route">案内解除<\/button>/);
  assert.match(css,/\.find-friend-marker\.active\s*\{/);
  clickAction("clear-route");
  assert.deepEqual(cleared,[true]);
  phone.update({
    day:1,minute:510,
    friendWaypoint:null,
    npcs:[{id:"aoi",name:"アオイ",hidden:false,distance:45,activity:"移動中",mapDX:400,mapDY:-250}]
  });
  assert.match(root.innerHTML,/<button class="find-friend-marker"[^>]*data-phone-action="friend-route"[^>]*aria-label="アオイに会いに行く"/);
  assert.match(root.innerHTML,/>会いに行く<\/button>/);
  clickAction("friend-route",{contactId:"aoi"});
  phone.update({
    day:1,minute:510,
    friendWaypoint:{id:"aoi",name:"アオイ",distance:45},
    npcs:[{id:"aoi",name:"アオイ",hidden:false,distance:45,activity:"移動中",mapDX:400,mapDY:-250}]
  });

  clickAction("home-screen");
  assert.match(root.innerHTML,/data-phone-app="maps"/);
  clickApp("maps");
  assert.match(root.innerHTML,/友達の現在地/);
  assert.match(root.innerHTML,/<b>アオイ<\/b>/);
  assert.match(root.innerHTML,/data-phone-action="clear-route"/);
  clickAction("clear-route");
  assert.deepEqual(cleared,[true,true]);

  phone.update({
    day:1,minute:511,inVehicle:true,
    npcs:[{id:"aoi",name:"アオイ",hidden:false,distance:40,activity:"移動中",mapDX:380,mapDY:-230}]
  });
  phone.openApp("find");
  assert.match(root.innerHTML,/<button class="find-friend-marker"[^>]*data-phone-action="friend-route"[^>]*aria-label="アオイに会いに行く"[^>]*disabled/);
  assert.doesNotMatch(root.innerHTML,/class="ios-friend-route"/);
  assert.match(root.innerHTML,/徒歩で外出すると案内できます/);
});

test('an indoor friend pauses live location while keeping the active route cancellable', () => {
  const handlers = new Map();
  const root = {
    hidden:false,
    innerHTML:"",
    classList:{ toggle() {} },
    style:{ setProperty() {} },
    addEventListener(type, handler) { handlers.set(type, handler); }
  };
  const cleared = [];
  const phone = phoneModule.createPhoneSystem({
    root,
    callbacks:{clearRoute:() => cleared.push(true)}
  });
  const click = (selector, dataset) => handlers.get("click")({
    target:{closest:(value) => value === selector ? {dataset} : null}
  });
  phone.update({
    day:1,minute:600,
    friendWaypoint:{id:"aoi",name:"アオイ",hidden:true},
    npcs:[{id:"aoi",name:"アオイ",hidden:true,distance:null,activity:"勤務中",mapDX:null,mapDY:null}]
  });
  phone.openApp("find");
  assert.match(root.innerHTML,/アオイ/);
  assert.match(root.innerHTML,/屋内/);
  assert.doesNotMatch(root.innerHTML,/find-friend-marker/);
  assert.match(root.innerHTML,/案内解除/);
  assert.doesNotMatch(root.innerHTML,/data-phone-action="friend-route"/);

  click("[data-phone-action]",{phoneAction:"home-screen"});
  click("[data-phone-app]",{phoneApp:"maps"});
  assert.match(root.innerHTML,/屋内 · 現在地非表示/);
  assert.match(root.innerHTML,/data-phone-action="clear-route"/);
  click("[data-phone-action]",{phoneAction:"clear-route"});
  assert.deepEqual(cleared,[true]);
});


test('phone remains clickable inside the pointer-disabled HUD', () => {
  assert.match(css, /\.smartphone-panel\{[\s\S]*pointer-events:auto/);
  assert.match(css, /\.smartphone-panel button\{[\s\S]*pointer-events:auto/);
});

test('live phone updates do not replace buttons during pointer interaction', () => {
  assert.match(phoneSource, /let pointerActive = false/);
  assert.match(phoneSource, /root\.addEventListener\("pointerdown"[\s\S]*pointerActive = true/);
  assert.match(phoneSource, /if \(root\.hidden \|\| pointerActive\) return/);
  assert.match(phoneSource, /signature !== lastRenderedSignature/);
});

test('Find redraws a friend marker and activity when a newer world snapshot arrives', () => {
  const handlers = new Map();
  const root = {
    hidden:false,
    innerHTML:"",
    classList:{toggle(){}},
    style:{setProperty(){}},
    addEventListener(type,handler){handlers.set(type,handler);}
  };
  const phone = phoneModule.createPhoneSystem({root});
  phone.update({
    minute:500,
    npcs:[{id:"aoi",name:"アオイ",hidden:false,distance:300,activity:"公園で休憩",mapDX:300,mapDY:0}]
  });
  phone.openApp("find");
  const before = root.innerHTML.match(/class="find-friend-marker"[^>]*style="left:(\d+)%/)[1];
  phone.update({
    minute:501,
    npcs:[{id:"aoi",name:"アオイ",hidden:false,distance:700,activity:"図書館で勉強",mapDX:700,mapDY:0}]
  });

  const after = root.innerHTML.match(/class="find-friend-marker"[^>]*style="left:(\d+)%/)[1];
  assert.notEqual(after,before);
  assert.match(root.innerHTML,/図書館で勉強/);
  assert.match(root.innerHTML,/700m/);
});
