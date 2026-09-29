import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import phoneModule from '../game/phone-system.js';

const phoneSource = fs.readFileSync(new URL('../game/phone-system.js', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game/game.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../game/game.css', import.meta.url), 'utf8');

test('phone system exposes a broad app catalog', () => {
  assert.equal(phoneModule.appCount, 23);
  assert.equal(typeof phoneModule.createPhoneSystem, 'function');
  for (const id of [
    'phone','messages','maps','camera','photos','weather','calendar','clock',
    'notes','reminders','wallet','health','find','transit','mail','news',
    'music','calculator','pet','books','meals','home','settings'
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
  assert.match(gameSource, /libraryReading:\{[\s\S]*loans:libraryReading\.loans\.map/);
  assert.match(gameSource, /npcs:NPCS\.map/);
  assert.match(gameSource, /stations:TRAIN_STATIONS\.map/);
  assert.match(gameSource, /trains:trains\.map/);
  assert.match(gameSource, /nextRentDay:nextRentDay\(\)/);
});

test('weather app renders supplied clock-based forecast transitions and umbrella status', () => {
  const root={hidden:false,innerHTML:'',classList:{toggle(){}},style:{setProperty(){}},addEventListener(){}};
  const phone=phoneModule.createPhoneSystem({root});
  phone.update({day:1,minute:530,weather:'clear',district:'若葉',inHome:false,inVehicle:false,inTrain:false,
    forecast:[
      {day:1,startMinute:360,offsetMinutes:0,condition:'clear'},
      {day:1,startMinute:540,offsetMinutes:10,condition:'rain'},
      {day:1,startMinute:720,offsetMinutes:190,condition:'cloudy'},
      {day:1,startMinute:900,offsetMinutes:370,condition:'clear'}
    ],umbrellaOwned:true,umbrellaProtecting:true});
  phone.openApp('weather');
  assert.match(root.innerHTML,/Day 1 09:00/);
  assert.match(root.innerHTML,/☂ 雨/);
  assert.match(root.innerHTML,/☁ くもり/);
  assert.match(root.innerHTML,/傘を使って雨を防いでいます/);
  assert.doesNotMatch(root.innerHTML,/\d+°/);
  phone.update({day:2,minute:5,weather:'rain',inHome:true,inVehicle:false,inTrain:false,
    forecast:[{day:2,startMinute:0,offsetMinutes:0,condition:'rain'}],umbrellaOwned:true,umbrellaProtecting:false});
  assert.match(root.innerHTML,/Day 2 00:05/);
  assert.doesNotMatch(root.innerHTML,/傘を使って雨を防いでいます/);
});

test('phone waypoint persists in game snapshots', () => {
  assert.match(gameSource, /phone:\s*\{[\s\S]*waypoint: state\.phone\?\.waypoint/);
  assert.match(gameSource, /saved\.phone && typeof saved\.phone\.waypoint === "string"/);
});

test('meal phone app displays safe live portions and disables eating in a vehicle or train', () => {
  const listeners = {};
  const root={hidden:false,innerHTML:'',classList:{toggle(){}},style:{setProperty(){}},addEventListener(name,handler){listeners[name]=handler;}};
  const phone=phoneModule.createPhoneSystem({root});
  phone.update({packedMeals:{batches:[],portions:0,capacity:6},inVehicle:false,inTrain:false});
  phone.home();
  assert.match(root.innerHTML,/data-phone-app="meals"/);
  phone.openApp('meals');
  assert.match(root.innerHTML,/持ち歩きの食事はありません/);
  phone.update({packedMeals:{batches:[{mealId:'home-meal@480',recipeId:'home-meal',name:'<script>alert(1)</script>',portions:2,freshnessMinutes:95}],portions:2,capacity:6},inVehicle:false,inTrain:false});
  assert.match(root.innerHTML,/2 \/ 6食/);
  assert.match(root.innerHTML,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(root.innerHTML,/<script>alert/);
  assert.match(root.innerHTML,/残り95分/);
  assert.match(root.innerHTML,/data-phone-action="eat-meal"/);
  phone.update({packedMeals:{batches:[{mealId:'home-meal@480',name:'家庭料理',portions:2,freshnessMinutes:75}],portions:2,capacity:6},inVehicle:true,inTrain:false});
  assert.match(root.innerHTML,/車や電車を降りてから/);
  assert.match(root.innerHTML,/disabled/);
});

test('meal phone action calls the runtime callback with the selected batch ID', () => {
  const listeners={};
  const root={hidden:false,innerHTML:'',classList:{toggle(){}},style:{setProperty(){}},addEventListener(name,handler){listeners[name]=handler;}};
  const consumed=[];
  const phone=phoneModule.createPhoneSystem({root,callbacks:{eatMeal:(id)=>consumed.push(id)}});
  phone.update({packedMeals:{batches:[{mealId:'fish-rice@700',name:'鯛めし',portions:1,freshnessMinutes:60}],portions:1,capacity:6},inVehicle:false,inTrain:false});
  phone.openApp('meals');
  const button={dataset:{phoneAction:'eat-meal',mealId:'fish-rice@700'},closest(selector){return selector==='[data-phone-action]'?this:null;}};
  listeners.click({target:button});
  assert.deepEqual(consumed,['fish-rice@700']);
});

test('meal freshness denominator participates in phone rerender detection', () => {
  const root={hidden:false,innerHTML:'',classList:{toggle(){}},style:{setProperty(){}},addEventListener(){}};
  const phone=phoneModule.createPhoneSystem({root});
  phone.update({packedMeals:{batches:[{mealId:'onigiri-set@100',recipeId:'onigiri-set',name:'おにぎり',portions:1,freshnessMinutes:360,freshnessTotalMinutes:720}],portions:1,capacity:6},inVehicle:false,inTrain:false});
  phone.home();
  phone.openApp('meals');
  assert.match(root.innerHTML,/width:50%/);
  phone.update({packedMeals:{batches:[{mealId:'onigiri-set@100',recipeId:'onigiri-set',name:'おにぎり',portions:1,freshnessMinutes:360,freshnessTotalMinutes:1440}],portions:1,capacity:6},inVehicle:false,inTrain:false});
  assert.match(root.innerHTML,/width:25%/);
});

test('pet phone app safely shows shelter guidance or live household pet care status', () => {
  const root = { hidden:false, innerHTML:'', classList:{ toggle(){} }, style:{ setProperty(){} }, addEventListener(){} };
  const phone = phoneModule.createPhoneSystem({ root });
  phone.update({ day:1, minute:540, petCompanion:{ pet:null, food:0 } });
  phone.home();
  assert.match(root.innerHTML, /data-phone-app="pet"/);
  phone.openApp('pet');
  assert.match(root.innerHTML, /わかば動物保護センター/);
  assert.match(root.innerHTML, /09:00〜19:00/);

  phone.update({ petCompanion:{ pet:{ speciesId:'cat', name:'<ミケ>', hunger:22, happiness:47, bond:31, energy:65 }, food:2, condition:'お腹がすいています' } });
  assert.match(root.innerHTML, /&lt;ミケ&gt;/);
  assert.doesNotMatch(root.innerHTML, /<ミケ>/);
  assert.match(root.innerHTML, /お腹がすいています/);
  assert.match(root.innerHTML, />22</);
  assert.match(root.innerHTML, /フード2個/);

  phone.update({ petCompanion:{ pet:{ speciesId:'cat', name:'<ミケ>', hunger:9, happiness:47, bond:31, energy:65 }, food:2, condition:'お腹がすいています' } });
  assert.match(root.innerHTML, />9</);
});

test('bookshelf phone app shows empty guidance, escaped loan progress and updates while open', () => {
  const root={hidden:false,innerHTML:'',classList:{toggle(){}},style:{setProperty(){}},addEventListener(){}};
  const phone=phoneModule.createPhoneSystem({root});
  phone.update({libraryReading:{loans:[],completedCount:2}});
  phone.home();
  assert.match(root.innerHTML,/data-phone-app="books"/);
  phone.openApp('books');
  assert.match(root.innerHTML,/本棚/);
  assert.match(root.innerHTML,/市立図書館/);
  assert.match(root.innerHTML,/貸出中の本はありません/);

  phone.update({libraryReading:{loans:[{bookId:'home-sewing',title:'<img src=x onerror=alert(1)>',chaptersRead:1}],completedCount:2}});
  assert.match(root.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(root.innerHTML,/<img src=x/);
  assert.match(root.innerHTML,/第1章まで/);
  assert.match(root.innerHTML,/読了 2冊/);

  phone.update({libraryReading:{loans:[{bookId:'home-sewing',title:'暮らしの手芸',chaptersRead:2}],completedCount:2}});
  assert.match(root.innerHTML,/第2章まで/);
  assert.match(root.innerHTML,/暮らしの手芸/);
  assert.match(css,/\.ios-book-progress/);
});

test('social contacts use their authored accent colors and escape profile text', () => {
  const root = {
    hidden:false,
    innerHTML:"",
    classList:{ toggle() {} },
    style:{ setProperty() {} },
    addEventListener() {}
  };
  const phone = phoneModule.createPhoneSystem({ root });
  const colors = ['#110001','#220002','#330003','#440004','#550005','#660006','#770007','#880008','#990009','#aa000a'];
  phone.update({ npcs:colors.map((color,index) => ({
    id:`social-${index}`, name:index === 0 ? '<img src=x onerror=alert(1)>' : `人物${index}`,
    color, friendship:index, activity:'公園で休憩', hidden:false, mapDX:100 + index * 8, mapDY:-80 - index * 7
  })) });
  phone.openApp('phone');
  for (const color of colors) assert.ok(root.innerHTML.includes(`--avatar:${color}`));
  assert.match(root.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  phone.openApp('find');
  for (const color of colors) assert.ok(root.innerHTML.includes(`--friend-color:${color}`));
  assert.match(css, /\.find-friend-marker\{[^}]*background:var\(--friend-color/);
});

test('game hides special NPC map markers and phone coordinates while they are indoors', () => {
  assert.match(gameSource, /npc\.hidden = citizen\.state === "inside" \|\| !citizen\.visible/);
  assert.match(gameSource, /color:npc\.color/);
  assert.match(gameSource, /distance:npc\.hidden \? null : distance\(p\.x, p\.y, npc\.x, npc\.y\)/);
  assert.match(gameSource, /mapDX:npc\.hidden \? null/);
  assert.match(gameSource, /mapDY:npc\.hidden \? null/);
});

test('map labels give every authored social NPC a visible conversation cue', () => {
  const drawNpcSource = gameSource.slice(gameSource.indexOf('function drawNpc('), gameSource.indexOf('function drawPedestrians(', gameSource.indexOf('function drawNpc(')));
  assert.match(drawNpcSource, /if \(npc\.hidden\) return/);
  assert.match(drawNpcSource, /npc\.color/);
  assert.match(drawNpcSource, /fillText\("…"/);
  assert.match(drawNpcSource, /fillText\(npc\.name/);
  assert.match(gameSource, /if \(!ped\.visible \|\| ped\.specialNpcId\) continue/);
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
  const friendMarkerPositions = [...root.innerHTML.matchAll(/class="find-friend-marker"[^>]*style="left:(\d+)%;top:(\d+)%[^"]*"/g)]
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
