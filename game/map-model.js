(function initCityDaysMapModel(global) {
  "use strict";

  const MAP_VERSION = "japan-v2.1";
  const WORLD_SIZE = 10800;
  const COAST = 160;
  const RAIL_Y = 4700;

  const node = (id, x, y, district) => ({ id, x, y, district });
  const point = (x, y) => ({ x, y });

  const BLUEPRINT_NODES = [
    node("west-station-road", 1750, 5020, "west-residential"),
    node("west-station-entry", 1750, 4840, "west-residential"),
    node("west-junction", 2850, 5050, "west-residential"),
    node("west-north", 2700, 4200, "library-quarter"),
    node("library-road", 3500, 3800, "library-quarter"),
    node("library-entrance", 3420, 3940, "library-quarter"),
    node("civic-east", 4300, 4050, "library-quarter"),
    node("park-west", 4450, 3420, "park-shrine"),
    node("park-road", 5250, 3380, "park-shrine"),
    node("park-entrance", 5250, 3150, "park-shrine"),
    node("park-east", 6250, 3450, "park-shrine"),
    node("gym-road", 7050, 3800, "park-shrine"),
    node("gym-entrance", 7180, 3920, "park-shrine"),
    node("north-east", 7480, 4250, "east-commercial"),
    node("central-north", 5200, 4200, "station-commercial"),
    node("north-market", 6100, 4470, "station-commercial"),
    node("central-west", 4200, 5050, "station-commercial"),
    node("central", 5200, 5050, "station-commercial"),
    node("central-station-entry", 5200, 4840, "station-commercial"),
    node("east-junction", 7380, 5000, "east-commercial"),
    node("east-station-road", 8600, 5050, "east-commercial"),
    node("east-station-entry", 8600, 4840, "east-commercial"),
    node("cafe-road", 4350, 5480, "station-commercial"),
    node("cafe-entrance", 4230, 5560, "station-commercial"),
    node("market-lane", 5550, 5420, "station-commercial"),
    node("store-road", 6500, 5500, "east-commercial"),
    node("store-entrance", 6630, 5590, "east-commercial"),
    node("res-west", 3600, 5950, "south-residential"),
    node("home-west", 4350, 6250, "south-residential"),
    node("home-road", 5050, 6420, "south-residential"),
    node("home-entrance", 5050, 6600, "south-residential"),
    node("south-mid", 5850, 6650, "south-residential"),
    node("east-south", 7300, 6200, "east-residential"),
    node("south-west", 2850, 6550, "west-residential"),
    node("south-east", 8150, 6600, "east-residential"),
    node("west-court", 2250, 5850, "west-residential"),
    node("west-dead", 1850, 6250, "west-residential"),
    node("south-court-a", 3650, 7050, "south-residential"),
    node("south-dead-a", 3350, 7480, "south-residential"),
    node("south-court-b", 5050, 7250, "south-residential"),
    node("south-dead-b", 5450, 7650, "south-residential"),
    node("east-court", 6850, 7050, "east-residential"),
    node("east-dead", 7300, 7480, "east-residential"),
    node("park-path-west", 4860, 2860, "park-shrine"),
    node("park-path-east", 5660, 2880, "park-shrine"),
    node("shrine-path", 4520, 2680, "park-shrine"),
    node("central-plaza-west", 4860, 4910, "station-commercial"),
    node("central-plaza-east", 5540, 4910, "station-commercial")
  ];

  const BLUEPRINT_EDGES = [
    ["arterial-west-station", "west-station-road", "west-junction", [[1750,5020],[2100,4985],[2450,5005],[2850,5050]], "arterial", 206, 50, true, true, true],
    ["arterial-west-core", "west-junction", "central-west", [[2850,5050],[3250,5090],[3650,5065],[4200,5050]], "arterial", 214, 50, true, true, true],
    ["arterial-core", "central-west", "central", [[4200,5050],[4520,5010],[4860,5035],[5200,5050]], "arterial", 220, 50, true, true, true],
    ["arterial-east-core", "central", "east-junction", [[5200,5050],[5660,5080],[6150,5035],[6800,4980],[7380,5000]], "arterial", 220, 50, true, true, true],
    ["arterial-east-station", "east-junction", "east-station-road", [[7380,5000],[7800,5030],[8200,5080],[8600,5050]], "arterial", 206, 50, true, true, true],

    ["collector-west-north", "west-junction", "west-north", [[2850,5050],[2790,4780],[2740,4480],[2700,4200]], "collector", 122, 30, true, true, false],
    ["collector-library", "west-north", "library-road", [[2700,4200],[2860,4050],[3120,3890],[3500,3800]], "collector", 112, 30, true, true, false],
    ["collector-library-civic", "library-road", "civic-east", [[3500,3800],[3760,3830],[4010,3920],[4300,4050]], "collector", 104, 30, true, true, false],
    ["collector-civic-central", "civic-east", "central-north", [[4300,4050],[4580,4120],[4900,4160],[5200,4200]], "collector", 116, 30, true, true, false],
    ["collector-central-north", "central-north", "central", [[5200,4200],[5190,4490],[5215,4780],[5200,5050]], "collector", 144, 40, true, true, false],
    ["collector-library-park", "library-road", "park-west", [[3500,3800],[3750,3650],[4070,3510],[4450,3420]], "residential", 92, 20, true, true, false],
    ["park-local-west", "park-west", "park-road", [[4450,3420],[4710,3360],[4980,3340],[5250,3380]], "park", 88, 20, true, true, false],
    ["park-local-east", "park-road", "park-east", [[5250,3380],[5560,3340],[5920,3370],[6250,3450]], "park", 92, 20, true, true, false],
    ["collector-park-gym", "park-east", "gym-road", [[6250,3450],[6520,3510],[6820,3650],[7050,3800]], "collector", 108, 30, true, true, false],
    ["collector-gym-northeast", "gym-road", "north-east", [[7050,3800],[7200,3950],[7360,4100],[7480,4250]], "collector", 120, 30, true, true, false],
    ["collector-northeast-east", "north-east", "east-junction", [[7480,4250],[7440,4470],[7410,4740],[7380,5000]], "collector", 132, 40, true, true, false],
    ["collector-north-market", "central-north", "north-market", [[5200,4200],[5480,4280],[5790,4380],[6100,4470]], "shopping", 100, 20, true, true, false],
    ["collector-market-east", "north-market", "north-east", [[6100,4470],[6460,4410],[6900,4330],[7480,4250]], "residential", 92, 20, true, true, false],

    ["shopping-central-cafe", "central", "cafe-road", [[5200,5050],[4990,5150],[4750,5310],[4350,5480]], "shopping", 92, 20, true, true, false],
    ["shopping-central-market", "central", "market-lane", [[5200,5050],[5270,5170],[5390,5300],[5550,5420]], "shopping", 94, 20, true, true, false],
    ["shopping-market-store", "market-lane", "store-road", [[5550,5420],[5850,5480],[6150,5520],[6500,5500]], "shopping", 100, 20, true, true, false],
    ["shopping-store-east", "store-road", "east-junction", [[6500,5500],[6740,5380],[7040,5200],[7380,5000]], "collector", 114, 30, true, true, false],

    ["residential-cafe-west", "cafe-road", "res-west", [[4350,5480],[4120,5620],[3860,5780],[3600,5950]], "residential", 78, 20, true, true, false],
    ["residential-west-home", "res-west", "home-west", [[3600,5950],[3850,6030],[4100,6140],[4350,6250]], "alley", 70, 15, true, true, false],
    ["residential-home-link", "home-west", "home-road", [[4350,6250],[4580,6320],[4800,6370],[5050,6420]], "alley", 72, 15, true, true, false],
    ["residential-home-south", "home-road", "south-mid", [[5050,6420],[5300,6490],[5580,6570],[5850,6650]], "residential", 82, 20, true, true, false],
    ["residential-south-east", "south-mid", "east-south", [[5850,6650],[6200,6590],[6650,6460],[7000,6310],[7300,6200]], "residential", 86, 20, true, true, false],
    ["collector-east-south", "east-south", "east-junction", [[7300,6200],[7360,5870],[7390,5440],[7380,5000]], "collector", 104, 30, true, true, false],
    ["residential-store-south", "store-road", "east-south", [[6500,5500],[6710,5660],[6980,5910],[7300,6200]], "residential", 82, 20, true, true, false],

    ["residential-west-court", "west-junction", "west-court", [[2850,5050],[2660,5320],[2450,5590],[2250,5850]], "residential", 82, 20, true, true, false],
    ["residential-court-southwest", "west-court", "south-west", [[2250,5850],[2400,6100],[2600,6370],[2850,6550]], "alley", 70, 15, true, true, false],
    ["residential-southwest-west", "south-west", "res-west", [[2850,6550],[3010,6360],[3260,6150],[3600,5950]], "residential", 78, 20, true, true, false],
    ["local-west-dead", "west-court", "west-dead", [[2250,5850],[2100,5960],[1970,6100],[1850,6250]], "alley", 60, 15, true, true, false],
    ["local-south-court-a", "res-west", "south-court-a", [[3600,5950],[3600,6320],[3620,6700],[3650,7050]], "alley", 66, 15, true, true, false],
    ["local-south-dead-a", "south-court-a", "south-dead-a", [[3650,7050],[3530,7200],[3420,7360],[3350,7480]], "alley", 58, 15, true, true, false],
    ["local-south-court-b", "home-road", "south-court-b", [[5050,6420],[5020,6700],[5030,6980],[5050,7250]], "alley", 66, 15, true, true, false],
    ["local-south-dead-b", "south-court-b", "south-dead-b", [[5050,7250],[5200,7400],[5340,7520],[5450,7650]], "alley", 58, 15, true, true, false],
    ["local-east-court", "south-mid", "east-court", [[5850,6650],[6150,6780],[6500,6930],[6850,7050]], "alley", 68, 15, true, true, false],
    ["local-east-dead", "east-court", "east-dead", [[6850,7050],[7020,7190],[7170,7350],[7300,7480]], "alley", 58, 15, true, true, false],
    ["local-east-southeast", "east-court", "south-east", [[6850,7050],[7240,6970],[7700,6800],[8150,6600]], "residential", 76, 20, true, true, false],
    ["residential-southeast-loop", "south-east", "east-south", [[8150,6600],[7920,6480],[7600,6320],[7300,6200]], "residential", 82, 20, true, true, false],

    ["ped-home-entry", "home-entrance", "home-road", [[5050,6600],[5050,6510],[5050,6420]], "sidewalk", 40, 5, false, true, false],
    ["ped-cafe-entry", "cafe-entrance", "cafe-road", [[4230,5560],[4280,5520],[4350,5480]], "sidewalk", 42, 5, false, true, false],
    ["ped-store-entry", "store-entrance", "store-road", [[6630,5590],[6570,5550],[6500,5500]], "sidewalk", 42, 5, false, true, false],
    ["ped-gym-entry", "gym-entrance", "gym-road", [[7180,3920],[7120,3860],[7050,3800]], "sidewalk", 42, 5, false, true, false],
    ["ped-library-entry", "library-entrance", "library-road", [[3420,3940],[3450,3880],[3500,3800]], "sidewalk", 42, 5, false, true, false],
    ["ped-park-entry", "park-entrance", "park-road", [[5250,3150],[5250,3260],[5250,3380]], "greenway", 48, 5, false, true, false],
    ["ped-west-station", "west-station-entry", "west-station-road", [[1750,4840],[1750,4930],[1750,5020]], "sidewalk", 44, 5, false, true, false],
    ["ped-central-station", "central-station-entry", "central", [[5200,4840],[5200,4940],[5200,5050]], "plaza", 60, 5, false, true, false],
    ["ped-east-station", "east-station-entry", "east-station-road", [[8600,4840],[8600,4940],[8600,5050]], "sidewalk", 44, 5, false, true, false],
    ["ped-central-plaza-west", "central-station-entry", "central-plaza-west", [[5200,4840],[5060,4870],[4860,4910]], "plaza", 58, 5, false, true, false],
    ["ped-central-plaza-east", "central-station-entry", "central-plaza-east", [[5200,4840],[5360,4870],[5540,4910]], "plaza", 58, 5, false, true, false],
    ["ped-arcade-cafe", "central-plaza-west", "cafe-entrance", [[4860,4910],[4700,5100],[4510,5340],[4230,5560]], "shopping-walk", 54, 5, false, true, false],
    ["ped-arcade-market", "central-plaza-east", "market-lane", [[5540,4910],[5550,5100],[5550,5270],[5550,5420]], "shopping-walk", 54, 5, false, true, false],
    ["ped-park-west", "park-entrance", "park-path-west", [[5250,3150],[5100,3040],[4860,2860]], "greenway", 44, 5, false, true, false],
    ["ped-park-shrine", "park-path-west", "shrine-path", [[4860,2860],[4700,2780],[4520,2680]], "greenway", 40, 5, false, true, false],
    ["ped-park-east", "park-path-west", "park-path-east", [[4860,2860],[5150,2820],[5420,2840],[5660,2880]], "greenway", 44, 5, false, true, false],
    ["ped-park-gym", "park-path-east", "gym-entrance", [[5660,2880],[6070,3060],[6500,3400],[6900,3740],[7180,3920]], "greenway", 40, 5, false, true, false],
    ["ped-park-library", "shrine-path", "library-entrance", [[4520,2680],[4230,2910],[3900,3260],[3600,3650],[3420,3940]], "greenway", 38, 5, false, true, false]
  ];

  const PLACE_DEFINITIONS = [
    { id:"home", name:"自宅", x:5050, y:6600, entranceNodeId:"home-entrance", roadNodeId:"home-road", building:{ x:5241, y:6728, w:300, h:270 }, color:"#d9b98b", symbol:"H" },
    { id:"cafe", name:"カフェ LUNE", x:4230, y:5560, entranceNodeId:"cafe-entrance", roadNodeId:"cafe-road", building:{ x:4380, y:5784, w:300, h:270 }, color:"#c88f72", symbol:"C" },
    { id:"store", name:"スーパー MARCHÉ", x:6630, y:5590, entranceNodeId:"store-entrance", roadNodeId:"store-road", building:{ x:6411, y:5809, w:320, h:260 }, color:"#74a88a", symbol:"S" },
    { id:"park", name:"中央公園", x:5250, y:3150, entranceNodeId:"park-entrance", roadNodeId:"park-road", color:"#72a66d", symbol:"P" },
    { id:"gym", name:"CITY GYM", x:7180, y:3920, entranceNodeId:"gym-entrance", roadNodeId:"gym-road", building:{ x:7399, y:3701, w:305, h:265 }, color:"#7898bd", symbol:"G" },
    { id:"library", name:"市立図書館", x:3420, y:3940, entranceNodeId:"library-entrance", roadNodeId:"library-road", building:{ x:3420, y:4110, w:310, h:275 }, color:"#9a8db9", symbol:"L" }
  ];

  const STATION_DEFINITIONS = [
    { id:"west", name:"西若葉駅", x:1750, y:RAIL_Y, accessX:1750, accessY:4840, roadNodeId:"west-station-road" },
    { id:"central", name:"若葉駅", x:5200, y:RAIL_Y, accessX:5200, accessY:4840, roadNodeId:"central" },
    { id:"east", name:"東若葉駅", x:8600, y:RAIL_Y, accessX:8600, accessY:4840, roadNodeId:"east-station-road" }
  ];

  const DISTRICT_DEFINITIONS = [
    { id:"station-commercial", name:"若葉駅前・銀座通り", polygon:[[3800,4380],[4700,4230],[5900,4300],[6750,4700],[6550,5770],[5350,5840],[4200,5720],[3700,5200]] },
    { id:"park-shrine", name:"中央公園・鎮守の森", polygon:[[4100,2250],[6200,2220],[6900,2850],[6900,3850],[6050,4100],[4550,3970],[3950,3300]] },
    { id:"library-quarter", name:"西文教地区", polygon:[[2350,2800],[4300,2700],[4650,4050],[3900,4550],[2500,4470],[2200,3550]] },
    { id:"west-residential", name:"西若葉住宅地", polygon:[[1250,4050],[3050,3980],[3650,5200],[3380,7200],[1650,7350],[1200,5900]] },
    { id:"south-residential", name:"南若葉住宅地", polygon:[[3150,5600],[5850,5650],[6600,6600],[6050,8100],[3150,8050],[2500,6900]] },
    { id:"east-commercial", name:"東若葉商業地区", polygon:[[6100,4200],[8950,4150],[9250,5500],[8250,6000],[6500,5800]] },
    { id:"east-residential", name:"東若葉住宅地", polygon:[[6250,5600],[9000,5450],[9300,7600],[6900,8050],[6000,7000]] }
  ];

  const OPEN_SPACES = [
    { id:"central-park", type:"park", district:"park-shrine", polygon:[[4480,2440],[5900,2390],[6320,2780],[6170,3290],[5680,3540],[4740,3470],[4320,3100]], label:"中央公園" },
    { id:"shrine-grove", type:"shrine", district:"park-shrine", polygon:[[4200,2450],[4680,2360],[4900,2740],[4550,3000],[4140,2820]], label:"若葉神社" },
    { id:"schoolyard", type:"schoolyard", district:"library-quarter", polygon:[[2860,3070],[3590,3010],[3710,3440],[2980,3520]], label:"若葉第一小" },
    { id:"central-station-plaza", type:"plaza", district:"station-commercial", polygon:[[4760,4740],[5660,4740],[5780,5020],[4680,5040]], label:"若葉駅南口広場" },
    { id:"west-station-plaza", type:"plaza", district:"west-residential", polygon:[[1510,4770],[1980,4770],[2040,5000],[1490,5010]], label:"西若葉駅前" },
    { id:"east-station-plaza", type:"plaza", district:"east-commercial", polygon:[[8360,4770],[8850,4780],[8900,5010],[8330,5000]], label:"東若葉駅前" },
    { id:"store-parking", type:"parking", district:"east-commercial", polygon:[[6580,5680],[7080,5650],[7140,5960],[6640,5990]], label:"スーパー駐車場" },
    { id:"west-pocket-park", type:"pocket-park", district:"west-residential", polygon:[[1960,6600],[2350,6560],[2410,6840],[2010,6900]], label:"西若葉児童遊園" },
    { id:"south-pocket-park", type:"pocket-park", district:"south-residential", polygon:[[4550,6900],[4860,6880],[4890,7140],[4560,7180]], label:"南若葉三角公園" },
    { id:"east-pocket-park", type:"pocket-park", district:"east-residential", polygon:[[7750,7000],[8160,6950],[8200,7280],[7790,7330]], label:"東若葉緑地" }
  ];

  const LANDMARKS = [
    { id:"shopping-arch", type:"shopping-arch", x:4680, y:5230, label:"若葉銀座" },
    { id:"shrine-gate", type:"shrine-gate", x:4520, y:2720, label:"若葉神社" },
    { id:"school-sign", type:"school-sign", x:3230, y:3490, label:"若葉第一小" },
    { id:"bus-terminal", type:"bus-terminal", x:5520, y:4990, label:"駅前バスのりば" }
  ];

  const BUILDING_ZONES = [
    { id:"west-housing", district:"west-residential", use:"residential", x:1350, y:5250, w:1950, h:1900, target:34 },
    { id:"south-housing", district:"south-residential", use:"residential", x:3050, y:5750, w:3150, h:2050, target:54 },
    { id:"east-housing", district:"east-residential", use:"residential", x:6450, y:5750, w:2450, h:1900, target:38 },
    { id:"library-mixed", district:"library-quarter", use:"mixed-low", x:2450, y:2850, w:1900, h:1500, target:18 },
    { id:"park-edge", district:"park-shrine", use:"residential", x:4050, y:3300, w:2900, h:900, target:14 },
    { id:"station-core", district:"station-commercial", use:"mixed", x:3820, y:4380, w:2750, h:1450, target:25 },
    { id:"west-center", district:"west-residential", use:"mixed-low", x:1400, y:4300, w:1800, h:1200, target:12 },
    { id:"east-center", district:"east-commercial", use:"commercial", x:6200, y:4300, w:2800, h:1500, target:22 }
  ];

  function hash2(x, y, seed = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointSegmentProjection(target, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 < .001 ? 0 : Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / length2));
    const projected = point(a.x + dx * t, a.y + dy * t);
    return { t, point: projected, distance: distance(target, projected) };
  }

  function boundsForPolygon(polygon) {
    const xs = polygon.map(([x]) => x);
    const ys = polygon.map(([, y]) => y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];
      const intersects = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function rectsOverlap(a, b, gap = 0) {
    return !(
      a.x + a.w + gap <= b.x ||
      b.x + b.w + gap <= a.x ||
      a.y + a.h + gap <= b.y ||
      b.y + b.h + gap <= a.y
    );
  }

  function facilityBuildingRect(place) {
    if (!place?.building) return null;
    return {
      x:place.building.x - place.building.w / 2,
      y:place.building.y - place.building.h / 2,
      w:place.building.w,
      h:place.building.h
    };
  }

  function segmentIntersectsExpandedRect(a, b, rect, pad) {
    const left = rect.x - pad;
    const right = rect.x + rect.w + pad;
    const top = rect.y - pad;
    const bottom = rect.y + rect.h + pad;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t0 = 0;
    let t1 = 1;
    const checks = [
      [-dx, a.x - left],
      [dx, right - a.x],
      [-dy, a.y - top],
      [dy, bottom - a.y]
    ];
    for (const [p, q] of checks) {
      if (Math.abs(p) < 1e-9) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) {
        if (ratio > t1) return false;
        t0 = Math.max(t0, ratio);
      } else {
        if (ratio < t0) return false;
        t1 = Math.min(t1, ratio);
      }
    }
    return true;
  }

  function edgeFromDefinition(definition, nodeMap) {
    const [id, from, to, rawPoints, type, width, speedLimit, vehicle, pedestrian, signalized] = definition;
    const points = rawPoints.map(([x, y]) => point(x, y));
    const first = nodeMap.get(from);
    const last = nodeMap.get(to);
    points[0] = point(first.x, first.y);
    points[points.length - 1] = point(last.x, last.y);
    return { id, from, to, points, type, width, speedLimit, vehicle, pedestrian, signalized };
  }

  function rectIntersectsEdge(rect, edge, extra = 0) {
    const pad = edge.width / 2 + extra;
    for (let i = 1; i < edge.points.length; i += 1) {
      if (segmentIntersectsExpandedRect(edge.points[i - 1], edge.points[i], rect, pad)) return true;
    }
    return false;
  }

  function rectHitsOpenSpace(rect, openSpaces) {
    return openSpaces.some((space) => {
      const bounds = space.bounds;
      if (!rectsOverlap(rect, bounds, 10)) return false;
      const corners = [
        [rect.x, rect.y],
        [rect.x + rect.w, rect.y],
        [rect.x, rect.y + rect.h],
        [rect.x + rect.w, rect.y + rect.h],
        [rect.x + rect.w / 2, rect.y + rect.h / 2]
      ];
      return corners.some(([x, y]) => pointInPolygon(x, y, space.polygon));
    });
  }

  function nearestEdgeToRectCenter(rect, edges) {
    const target = point(rect.x + rect.w / 2, rect.y + rect.h / 2);
    let best = null;
    for (const edge of edges) {
      if (!edge.pedestrian) continue;
      for (let i = 1; i < edge.points.length; i += 1) {
        const hit = pointSegmentProjection(target, edge.points[i - 1], edge.points[i]);
        if (!best || hit.distance < best.distance) best = { ...hit, edge };
      }
    }
    return best;
  }

  function createBuildingSites(edges, openSpaces, places, stations) {
    const sites = [];
    const reserved = [
      ...places.flatMap((place) => {
        const areas = [{ x:place.x - 55, y:place.y - 55, w:110, h:110 }];
        const building = facilityBuildingRect(place);
        if (building) areas.push(building);
        return areas;
      }),
      ...stations.map((station) => ({ x:station.x - 230, y:station.y - 210, w:460, h:420 }))
    ];

    for (let zoneIndex = 0; zoneIndex < BUILDING_ZONES.length; zoneIndex += 1) {
      const zone = BUILDING_ZONES[zoneIndex];
      let accepted = 0;
      const maxAttempts = zone.target * 24;
      for (let attempt = 0; attempt < maxAttempts && accepted < zone.target; attempt += 1) {
        const seed = zoneIndex * 10000 + attempt * 97 + 31;
        const r1 = hash2(seed, zoneIndex + 3, 1);
        const r2 = hash2(seed, zoneIndex + 7, 2);
        const r3 = hash2(seed, zoneIndex + 11, 3);
        const r4 = hash2(seed, zoneIndex + 17, 4);

        let w;
        let h;
        let floors;
        let style;
        let kind;
        if (zone.use === "residential") {
          w = 62 + r3 * 54;
          h = 50 + r4 * 42;
          floors = r1 > .86 ? 3 : r1 > .18 ? 2 : 1;
          style = "residential";
          kind = floors >= 3 ? "normal" : "low";
        } else if (zone.use === "mixed-low") {
          w = 82 + r3 * 78;
          h = 62 + r4 * 60;
          floors = 2 + Math.floor(r1 * 3);
          style = r2 > .62 ? "residential" : "urban";
          kind = floors <= 2 ? "low" : "normal";
        } else if (zone.use === "commercial") {
          w = 105 + r3 * 115;
          h = 74 + r4 * 80;
          floors = 2 + Math.floor(r1 * 5);
          style = "urban";
          kind = floors >= 7 ? "tower" : "normal";
        } else {
          w = 92 + r3 * 105;
          h = 68 + r4 * 74;
          floors = 2 + Math.floor(r1 * 6);
          style = r2 > .78 ? "residential" : "urban";
          kind = floors >= 7 ? "tower" : floors <= 2 ? "low" : "normal";
        }

        const x = zone.x + 18 + hash2(seed, 23, 5) * Math.max(1, zone.w - w - 36);
        const y = zone.y + 18 + hash2(seed, 29, 6) * Math.max(1, zone.h - h - 36);
        const rect = { x, y, w, h };

        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const district = DISTRICT_DEFINITIONS.find((district) => district.id === zone.district);
        if (district && !pointInPolygon(centerX, centerY, district.polygon)) continue;
        if (reserved.some((area) => rectsOverlap(rect, area, 18))) continue;
        if (openSpaces.length && rectHitsOpenSpace(rect, openSpaces)) continue;
        if (edges.some((edge) => rectIntersectsEdge(rect, edge, edge.vehicle ? 18 : 10))) continue;
        if (rect.y < RAIL_Y + 120 && rect.y + rect.h > RAIL_Y - 120 && rect.x < 9300 && rect.x + rect.w > 1100) continue;
        if (sites.some((site) => rectsOverlap(rect, site, style === "residential" ? 18 : 12))) continue;

        const roadHit = nearestEdgeToRectCenter(rect, edges);
        let frontage = "south";
        if (roadHit) {
          const dx = roadHit.point.x - centerX;
          const dy = roadHit.point.y - centerY;
          if (Math.abs(dx) > Math.abs(dy)) frontage = dx > 0 ? "east" : "west";
          else frontage = dy > 0 ? "south" : "north";
        }

        const site = {
          id:zone.id + "-" + accepted,
          x:Math.round(x),
          y:Math.round(y),
          w:Math.round(w),
          h:Math.round(h),
          use:zone.use,
          district:zone.district,
          style,
          kind,
          floors,
          frontage,
          houseStyle:style === "residential"
            ? (floors >= 3 ? "small-apartment" : hash2(seed, 43, 7) > .5 ? "gable" : "hipped")
            : null,
          palette:Math.floor(hash2(seed, 47, 8) * 5),
          roofDetail:Math.floor(hash2(seed, 53, 9) * 4),
          facadeBand:style === "urban" && hash2(seed, 59, 10) > .42,
          balconies:floors >= 3 && hash2(seed, 61, 11) > .35,
          seed
        };
        sites.push(site);
        accepted += 1;
      }
    }
    return sites;
  }

  function createVegetation(openSpaces, edges) {
    const trees = [];
    for (let spaceIndex = 0; spaceIndex < openSpaces.length; spaceIndex += 1) {
      const space = openSpaces[spaceIndex];
      if (!["park","shrine","pocket-park"].includes(space.type)) continue;
      const bounds = space.bounds;
      const count = space.type === "park" ? 34 : space.type === "shrine" ? 15 : 7;
      let accepted = 0;
      for (let attempt = 0; attempt < count * 12 && accepted < count; attempt += 1) {
        const seed = 9000 + spaceIndex * 400 + attempt;
        const x = bounds.x + 20 + hash2(seed, 7, 1) * Math.max(1, bounds.w - 40);
        const y = bounds.y + 20 + hash2(seed, 13, 2) * Math.max(1, bounds.h - 40);
        if (!pointInPolygon(x, y, space.polygon)) continue;
        const target = point(x, y);
        const blocksPath = edges.some((edge) => {
          if (!edge.pedestrian) return false;
          const clearance = edge.width / 2 + 16;
          for (let i = 1; i < edge.points.length; i += 1) {
            if (pointSegmentProjection(target, edge.points[i - 1], edge.points[i]).distance <= clearance) return true;
          }
          return false;
        });
        if (blocksPath) continue;
        trees.push({ x:Math.round(x), y:Math.round(y), scale:.65 + hash2(seed, 19, 3) * .55, spaceId:space.id });
        accepted += 1;
      }
    }
    return trees;
  }

  function createMapModel() {
    const nodes = BLUEPRINT_NODES.map((value) => ({ ...value }));
    const nodeMap = new Map(nodes.map((value) => [value.id, value]));
    const edges = BLUEPRINT_EDGES.map((value) => edgeFromDefinition(value, nodeMap));
    const places = PLACE_DEFINITIONS.map((value) => ({ ...value, building:value.building ? { ...value.building } : null }));
    const stations = STATION_DEFINITIONS.map((value) => ({ ...value }));
    const districts = DISTRICT_DEFINITIONS.map((value) => ({
      ...value,
      polygon:value.polygon.map(([x, y]) => [x, y]),
      bounds:boundsForPolygon(value.polygon)
    }));
    const openSpaces = OPEN_SPACES.map((value) => ({
      ...value,
      polygon:value.polygon.map(([x, y]) => [x, y]),
      bounds:boundsForPolygon(value.polygon)
    }));
    const landmarks = LANDMARKS.map((value) => ({ ...value }));
    const buildingSites = createBuildingSites(edges, openSpaces, places, stations);
    const vegetation = createVegetation(openSpaces, edges);
    const parcels = buildingSites.map((site) => ({ id:"lot-" + site.id, x:site.x, y:site.y, w:site.w, h:site.h, use:site.use, district:site.district, walkable:false }));
    const adjacency = new Map(nodes.map((value) => [value.id, []]));

    for (const edge of edges) {
      adjacency.get(edge.from).push({ edge, nodeId:edge.to });
      adjacency.get(edge.to).push({ edge, nodeId:edge.from });
    }

    function getNode(id) {
      return nodeMap.get(id) || null;
    }

    function getEdge(id) {
      return edges.find((edge) => edge.id === id) || null;
    }

    function neighbors(nodeId, options = {}) {
      const mode = options.mode || "pedestrian";
      return (adjacency.get(nodeId) || []).filter(({ edge }) => mode === "vehicle" ? edge.vehicle : edge.pedestrian);
    }

    function edgeLength(edge) {
      let length = 0;
      for (let i = 1; i < edge.points.length; i += 1) length += distance(edge.points[i - 1], edge.points[i]);
      return length;
    }

    function findRoute(startNodeId, endNodeId, options = {}) {
      if (!getNode(startNodeId) || !getNode(endNodeId)) return null;
      if (startNodeId === endNodeId) return { nodeIds:[startNodeId], edgeIds:[], distance:0 };
      const frontier = [{ nodeId:startNodeId, cost:0 }];
      const best = new Map([[startNodeId, 0]]);
      const previous = new Map();
      while (frontier.length) {
        frontier.sort((a, b) => a.cost - b.cost);
        const current = frontier.shift();
        if (current.nodeId === endNodeId) break;
        for (const { edge, nodeId } of neighbors(current.nodeId, options)) {
          const cost = current.cost + edgeLength(edge);
          if (best.has(nodeId) && best.get(nodeId) <= cost) continue;
          best.set(nodeId, cost);
          previous.set(nodeId, { nodeId:current.nodeId, edgeId:edge.id });
          frontier.push({ nodeId, cost });
        }
      }
      if (!best.has(endNodeId)) return null;
      const nodeIds = [];
      const edgeIds = [];
      let cursor = endNodeId;
      while (cursor !== startNodeId) {
        nodeIds.push(cursor);
        const step = previous.get(cursor);
        edgeIds.push(step.edgeId);
        cursor = step.nodeId;
      }
      nodeIds.push(startNodeId);
      nodeIds.reverse();
      edgeIds.reverse();
      return { nodeIds, edgeIds, distance:best.get(endNodeId) };
    }

    function nearestRoad(x, y, options = {}) {
      const target = point(x, y);
      const vehicleOnly = Boolean(options.vehicleOnly);
      let best = null;
      for (const edge of edges) {
        if (vehicleOnly && !edge.vehicle) continue;
        if (!vehicleOnly && !edge.pedestrian) continue;
        for (let i = 1; i < edge.points.length; i += 1) {
          const hit = pointSegmentProjection(target, edge.points[i - 1], edge.points[i]);
          if (!best || hit.distance < best.distance) {
            best = { edgeId:edge.id, distance:hit.distance, point:hit.point, segmentIndex:i - 1, t:hit.t, edge };
          }
        }
      }
      return best;
    }

    function contains(bounds, x, y) {
      return x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h;
    }

    function isWithinRoadSurface(x, y, options = {}, padding = 0) {
      const target = point(x, y);
      const vehicleOnly = Boolean(options.vehicleOnly);
      for (const edge of edges) {
        if (vehicleOnly && !edge.vehicle) continue;
        if (!vehicleOnly && !edge.pedestrian) continue;
        const threshold = edge.width / 2 + padding;
        for (let i = 1; i < edge.points.length; i += 1) {
          if (pointSegmentProjection(target, edge.points[i - 1], edge.points[i]).distance <= threshold) return true;
        }
      }
      return false;
    }

    function isRoad(x, y, options = {}) {
      return isWithinRoadSurface(x, y, options, 0);
    }

    function isWalkable(x, y, radius = 0) {
      if (parcels.some((parcel) => contains(parcel, x, y))) return false;
      return isWithinRoadSurface(x, y, { vehicleOnly:false }, radius);
    }

    function districtAt(x, y) {
      return districts.find((district) => pointInPolygon(x, y, district.polygon)) || null;
    }

    function validate() {
      const errors = [];
      const nodeIds = new Set();
      for (const value of nodes) {
        if (nodeIds.has(value.id)) errors.push("duplicate node: " + value.id);
        nodeIds.add(value.id);
      }

      const edgeIds = new Set();
      for (const edge of edges) {
        if (edgeIds.has(edge.id)) errors.push("duplicate edge: " + edge.id);
        edgeIds.add(edge.id);
        if (!getNode(edge.from) || !getNode(edge.to)) errors.push("edge endpoint missing: " + edge.id);
        if (edge.points.length < 2) errors.push("edge has too few points: " + edge.id);
        if (edge.width <= 0) errors.push("edge width invalid: " + edge.id);
        if (edge.points[0].x !== getNode(edge.from)?.x || edge.points[0].y !== getNode(edge.from)?.y) errors.push("edge start mismatch: " + edge.id);
        const end = edge.points.at(-1);
        if (end.x !== getNode(edge.to)?.x || end.y !== getNode(edge.to)?.y) errors.push("edge end mismatch: " + edge.id);
      }

      for (const place of places) {
        if (!getNode(place.entranceNodeId) || !getNode(place.roadNodeId)) {
          errors.push("place node missing: " + place.id);
          continue;
        }
        if (!findRoute(place.entranceNodeId, place.roadNodeId, { mode:"pedestrian" })) errors.push("place unreachable: " + place.id);
        if (!neighbors(place.roadNodeId, { mode:"vehicle" }).length) errors.push("place road unreachable: " + place.id);
        if (!isWalkable(place.x, place.y, 14)) errors.push("place not walkable: " + place.id);
        const facility = facilityBuildingRect(place);
        if (facility) {
          if (edges.some((edge) => rectIntersectsEdge(facility, edge, edge.vehicle ? 18 : 10))) errors.push("facility intersects street: " + place.id);
          if (openSpaces.some((space) => rectsOverlap(facility, space.bounds, 0))) errors.push("facility intersects open space: " + place.id);
          if (buildingSites.some((site) => rectsOverlap(facility, site, 10))) errors.push("facility intersects generated building: " + place.id);
        }
      }

      for (const station of stations) {
        if (!getNode(station.roadNodeId)) errors.push("station road node missing: " + station.id);
        if (!isWalkable(station.accessX, station.accessY, 14)) errors.push("station access not walkable: " + station.id);
      }

      for (const site of buildingSites) {
        if (edges.some((edge) => rectIntersectsEdge(site, edge, edge.vehicle ? 8 : 4))) errors.push("building intersects street: " + site.id);
      }

      return errors;
    }

    return Object.freeze({
      version:MAP_VERSION,
      worldSize:WORLD_SIZE,
      coast:COAST,
      nodes:Object.freeze(nodes),
      edges:Object.freeze(edges),
      districts:Object.freeze(districts),
      parcels:Object.freeze(parcels),
      buildingSites:Object.freeze(buildingSites),
      openSpaces:Object.freeze(openSpaces),
      landmarks:Object.freeze(landmarks),
      vegetation:Object.freeze(vegetation),
      places:Object.freeze(places),
      stations:Object.freeze(stations),
      getNode,
      getEdge,
      neighbors,
      nearestRoad,
      isRoad,
      isWalkable,
      districtAt,
      findRoute,
      validate
    });
  }

  const api = Object.freeze({ createMapModel });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysMapModel = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
