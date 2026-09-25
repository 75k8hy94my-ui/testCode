(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
  const minimap = document.getElementById("minimap");
  const mctx = minimap.getContext("2d");

  const areaNameEl = document.getElementById("areaName");
  const worldClockEl = document.getElementById("worldClock");
  const cashText = document.getElementById("cashText");
  const foodText = document.getElementById("foodText");
  const lifeStatus = document.getElementById("lifeStatus");
  const rentText = document.getElementById("rentText");
  const objectiveTitle = document.getElementById("objectiveTitle");
  const objectiveText = document.getElementById("objectiveText");
  const interactionPrompt = document.getElementById("interactionPrompt");
  const interactionText = document.getElementById("interactionText");
  const actionSheet = document.getElementById("actionSheet");
  const actionTitle = document.getElementById("actionTitle");
  const actionDescription = document.getElementById("actionDescription");
  const actionChoices = document.getElementById("actionChoices");
  const actionClose = document.getElementById("actionClose");
  const helpPanel = document.getElementById("helpPanel");
  const helpButton = document.getElementById("helpButton");
  const helpClose = document.getElementById("helpClose");
  const saveButton = document.getElementById("saveButton");
  const toast = document.getElementById("toast");
  const pausedOverlay = document.getElementById("pausedOverlay");
  const joystick = document.getElementById("joystick");
  const joystickKnob = document.getElementById("joystickKnob");
  const actionButton = document.getElementById("actionButton");
  const runButton = document.getElementById("runButton");
  const driveHud = document.getElementById("driveHud");
  const speedText = document.getElementById("speedText");
  const speedLimitText = document.getElementById("speedLimitText");
  const signalText = document.getElementById("signalText");
  const gapText = document.getElementById("gapText");
  const driveScoreText = document.getElementById("driveScoreText");
  const driveDestinationText = document.getElementById("driveDestinationText");
  const mobileDrivingControls = document.getElementById("mobileDrivingControls");
  const driveBrakeButton = document.getElementById("driveBrakeButton");
  const driveMenuButton = document.getElementById("driveMenuButton");
  const driveAccelButton = document.getElementById("driveAccelButton");

  const needEls = {
    hunger: [document.getElementById("hungerBar"), document.getElementById("hungerText")],
    energy: [document.getElementById("energyBar"), document.getElementById("energyText")],
    hygiene: [document.getElementById("hygieneBar"), document.getElementById("hygieneText")],
    social: [document.getElementById("socialBar"), document.getElementById("socialText")],
    fun: [document.getElementById("funBar"), document.getElementById("funText")]
  };

  const WORLD_SIZE = 10800;
  const COAST = 160;
  const ROAD_GAP = 600;
  const ROAD_WIDTH = 176;
  const ROAD_HALF = ROAD_WIDTH / 2;
  const CROSSWALK_OFFSET = ROAD_HALF + 22;
  const CROSSWALK_DEPTH = 28;
  const STOP_LINE_GAP = 10;
  const STOP_LINE_OFFSET = CROSSWALK_OFFSET + CROSSWALK_DEPTH / 2 + STOP_LINE_GAP;
  const STOP_LINE_CENTER_MARGIN = 8;
  const STOP_LINE_EDGE_MARGIN = 22;
  const VEHICLE_FRONT_OVERHANG = 38;
  const BLOCK_MARGIN = 34;
  const PLAYER_RADIUS = 14;
  const WALK_SPEED = 200;
  const RUN_SPEED = 300;
  const SPEED_TO_KMH = 0.16;
  const SIGNAL_CYCLE = 20;
  const LANE_OFFSET = 38;
  const TURN_RADIUS = 86;
  const ROUTE_SAMPLE_STEP = 16;
  const WORLD_TILT_Y = 0.94;
  const WORLD_TILT_X = 1.025;
  const BUILDING_DEPTH_X = 0.18;
  const VISUAL_PALETTES = [
    { wall:"#c8b89c", roof:"#746f69", trim:"#e8dcc5", glass:"#8ba6ad" },
    { wall:"#b6b8b2", roof:"#61696a", trim:"#d8d9d3", glass:"#86a7b3" },
    { wall:"#c79e84", roof:"#725d58", trim:"#ead2bc", glass:"#83a0aa" },
    { wall:"#aaa8b6", roof:"#595967", trim:"#d7d3e2", glass:"#879cab" },
    { wall:"#b9aa8d", roof:"#6a6358", trim:"#ded3bd", glass:"#839faa" }
  ];
  const VEHICLE_TYPES = ["compact","sedan","suv","van"];
  const SAVE_KEY = "testCodeLifeSimSave:v1";
  const RENT = 12000;
  const keys = new Set();
  const buildings = [];
  const traffic = [];
  const pedestrians = [];
  const touch = { x: 0, y: 0, run: false, driveAccel: false, driveBrake: false, pointerId: null };

  function blockCenter(gx, gy) {
    return { x: gx * ROAD_GAP + ROAD_GAP / 2, y: gy * ROAD_GAP + ROAD_GAP / 2 };
  }

  const HOME = { id: "home", name: "自宅", gx: 8, gy: 8, ...blockCenter(8, 8), color: "#d9b98b", symbol: "H" };
  const CAFE = { id: "cafe", name: "カフェ LUNE", gx: 7, gy: 8, ...blockCenter(7, 8), color: "#c88f72", symbol: "C" };
  const STORE = { id: "store", name: "スーパー MARCHÉ", gx: 9, gy: 8, ...blockCenter(9, 8), color: "#74a88a", symbol: "S" };
  const PARK = { id: "park", name: "中央公園", gx: 8, gy: 7, ...blockCenter(8, 7), color: "#72a66d", symbol: "P" };
  const GYM = { id: "gym", name: "CITY GYM", gx: 9, gy: 7, ...blockCenter(9, 7), color: "#7898bd", symbol: "G" };
  const LIBRARY = { id: "library", name: "市立図書館", gx: 7, gy: 7, ...blockCenter(7, 7), color: "#9a8db9", symbol: "L" };
  const PLACES = [HOME, CAFE, STORE, PARK, GYM, LIBRARY];
  const SPECIAL_BLOCKS = new Set(PLACES.map((place) => place.gx + "," + place.gy));

  // Fictional compressed city layout inspired by the spatial mix around Kichijoji:
  // dense station frontage, shopping streets, tiny dining alleys, quieter housing,
  // and a large green zone. Exact streets/names are intentionally not reproduced.
  const CITY_CORE = { minGX: 5, maxGX: 11, minGY: 4, maxGY: 10 };
  const STATION_BLOCKS = new Set(["7,5","8,5","9,5","8,6"]);
  const ARCADE_BLOCKS = new Set(["6,5","6,6","7,6","6,7","7,7"]);
  const ALLEY_BLOCKS = new Set(["9,6","10,5","10,6","9,7","10,7"]);
  const RESIDENTIAL_BLOCKS = new Set([
    "4,7","4,8","4,9","5,7","5,8","5,9","5,10","6,9","6,10",
    "10,8","10,9","10,10","11,8","11,9"
  ]);
  const GREEN_EDGE_BLOCKS = new Set(["7,9","8,9","9,9","7,10","8,10","9,10"]);

  function cityBlockStyle(gx, gy) {
    const key = gx + "," + gy;
    if (STATION_BLOCKS.has(key)) return "station";
    if (ARCADE_BLOCKS.has(key)) return "arcade";
    if (ALLEY_BLOCKS.has(key)) return "alley";
    if (GREEN_EDGE_BLOCKS.has(key)) return "green";
    if (RESIDENTIAL_BLOCKS.has(key)) return "residential";
    if (gx >= CITY_CORE.minGX && gx <= CITY_CORE.maxGX && gy >= CITY_CORE.minGY && gy <= CITY_CORE.maxGY) return "mixed-core";
    return "outer";
  }

  const NPCS = [
    { id: "aoi", name: "アオイ", x: PARK.x + 80, y: PARK.y + 65, color: "#e0a7b5", friendship: 0 },
    { id: "sora", name: "ソラ", x: CAFE.x + 72, y: CAFE.y - 58, color: "#a9c9e3", friendship: 0 },
    { id: "mei", name: "メイ", x: LIBRARY.x - 70, y: LIBRARY.y + 55, color: "#c8b58f", friendship: 0 }
  ];

  const personalCar = {
    x: HOME.x,
    y: Math.round(HOME.y / ROAD_GAP) * ROAD_GAP - 36,
    angle: 0,
    speed: 0,
    color: "#6f8fac"
  };

  let viewWidth = window.innerWidth;
  let viewHeight = window.innerHeight;
  let dpr = 1;
  let lastFrame = performance.now();
  let actionQueued = false;
  let toastTimer = 0;
  let autosaveTimer = 0;

  const state = {
    player: {
      x: HOME.x + 55,
      y: HOME.y + 65,
      facingX: 0,
      facingY: 1,
      inVehicle: false
    },
    camera: { x: HOME.x - viewWidth / 2, y: HOME.y - viewHeight / 2 },
    day: 1,
    minute: 8 * 60,
    cash: 8000,
    groceries: 2,
    fitness: 0,
    libraryVisits: 0,
    shiftsWorked: 0,
    needs: {
      hunger: 75,
      energy: 85,
      hygiene: 80,
      social: 65,
      fun: 70
    },
    visual: {
      weather: "clear",
      weatherClock: 0,
      weatherDuration: 42,
      rainPhase: 0,
      cameraLeadX: 0,
      cameraLeadY: 0,
      cameraLagX: 0,
      cameraLagY: 0
    },
    drive: {
      route: [],
      routeIndex: 0,
      signals: [],
      destination: null,
      score: 100,
      rating: 100,
      trips: 0,
      signalClock: 0,
      speedingTimer: 0,
      gapTimer: 0,
      collisionCooldown: 0,
      violationKeys: new Set()
    },
    paused: false
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function hash2(x, y, seed = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function roadDistance(value) {
    const mod = ((value % ROAD_GAP) + ROAD_GAP) % ROAD_GAP;
    return Math.min(mod, ROAD_GAP - mod);
  }

  function isRoad(x, y) {
    return roadDistance(x) <= ROAD_HALF || roadDistance(y) <= ROAD_HALF;
  }

  function inWorld(x, y, radius = 0) {
    return x > COAST + radius && y > COAST + radius && x < WORLD_SIZE - COAST - radius && y < WORLD_SIZE - COAST - radius;
  }

  function circleRectCollision(x, y, radius, rect) {
    const nx = clamp(x, rect.x, rect.x + rect.w);
    const ny = clamp(y, rect.y, rect.y + rect.h);
    return distance(x, y, nx, ny) < radius;
  }

  function collidesBuilding(x, y, radius) {
    for (const building of buildings) {
      if (
        x + radius < building.x ||
        y + radius < building.y ||
        x - radius > building.x + building.w ||
        y - radius > building.y + building.h
      ) continue;
      if (circleRectCollision(x, y, radius, building)) return true;
    }
    return false;
  }

  function canStand(x, y, radius = PLAYER_RADIUS) {
    return inWorld(x, y, radius) && !collidesBuilding(x, y, radius);
  }

  function generateBuildings() {
    const maxBlock = Math.floor(WORLD_SIZE / ROAD_GAP) - 1;

    for (let gx = 0; gx < maxBlock; gx += 1) {
      for (let gy = 0; gy < maxBlock; gy += 1) {
        if (SPECIAL_BLOCKS.has(gx + "," + gy)) continue;

        const left = gx * ROAD_GAP + ROAD_HALF + BLOCK_MARGIN;
        const top = gy * ROAD_GAP + ROAD_HALF + BLOCK_MARGIN;
        const right = (gx + 1) * ROAD_GAP - ROAD_HALF - BLOCK_MARGIN;
        const bottom = (gy + 1) * ROAD_GAP - ROAD_HALF - BLOCK_MARGIN;
        const bw = right - left;
        const bh = bottom - top;
        const style = cityBlockStyle(gx, gy);
        const tint = 0.76 + hash2(gx, gy, 91) * 0.18;

        const makeBuilding = (x, y, w, h, localTint, kind, variant = 0, district = style) => {
          const palette = Math.floor(hash2(gx + variant, gy, 407) * VISUAL_PALETTES.length) % VISUAL_PALETTES.length;
          return {
            x, y, w, h, tint: localTint, kind, palette, district,
            floors:
              kind === "tower" ? 7 + Math.floor(hash2(gx, gy + variant, 408) * 6) :
              kind === "low" ? 1 + Math.floor(hash2(gx, gy + variant, 409) * 2) :
              2 + Math.floor(hash2(gx, gy + variant, 409) * 4),
            roofDetail: Math.floor(hash2(gx, gy + variant, 410) * 4),
            facadeBand: hash2(gx + variant, gy, 411) > 0.5,
            balconies: kind !== "low" && hash2(gx, gy + variant, 412) > 0.62
          };
        };

        if (style === "station") {
          const plazaSide = hash2(gx, gy, 1301) > .5 ? 1 : -1;
          const commercialH = bh * .46;
          buildings.push(makeBuilding(
            left + 12,
            plazaSide > 0 ? top + 10 : bottom - commercialH - 10,
            bw - 24,
            commercialH,
            tint,
            hash2(gx, gy, 1302) > .52 ? "tower" : "normal",
            11
          ));
          const shopW = (bw - 44) / 3;
          const rowY = plazaSide > 0 ? bottom - 92 : top + 12;
          for (let n = 0; n < 3; n += 1) {
            buildings.push(makeBuilding(
              left + 10 + n * (shopW + 7),
              rowY,
              shopW,
              74,
              tint * (.96 + n * .01),
              "low",
              20 + n
            ));
          }
          continue;
        }

        if (style === "arcade") {
          const corridor = 78;
          const sideW = (bw - corridor - 36) / 2;
          const unitH = (bh - 44) / 4;
          for (let row = 0; row < 4; row += 1) {
            const y = top + 10 + row * (unitH + 7);
            buildings.push(makeBuilding(left + 8, y, sideW, unitH, tint, "low", 30 + row));
            buildings.push(makeBuilding(right - sideW - 8, y + (row % 2 ? 4 : 0), sideW, unitH - 3, tint * .97, "low", 40 + row));
          }
          continue;
        }

        if (style === "alley") {
          const lane = 54;
          const cellW = (bw - lane - 44) / 2;
          const cellH = (bh - lane - 54) / 3;
          for (let row = 0; row < 3; row += 1) {
            const y = top + 8 + row * (cellH + 8);
            buildings.push(makeBuilding(left + 8, y, cellW, cellH, tint, "low", 50 + row));
            buildings.push(makeBuilding(right - cellW - 8, y + 5, cellW, cellH - 4, tint * .95, "low", 60 + row));
          }
          // Close one side at the back so the pedestrian alley bends rather than
          // reading as another straight grid street.
          buildings.push(makeBuilding(left + cellW + 18, bottom - 76, lane + 10, 62, tint * .91, "low", 69));
          continue;
        }

        if (style === "residential") {
          const lotGap = 18;
          const houseW = (bw - lotGap * 3) / 2;
          const houseH = (bh - lotGap * 3) / 2;
          for (let ix = 0; ix < 2; ix += 1) {
            for (let iy = 0; iy < 2; iy += 1) {
              const variant = 70 + ix * 2 + iy;
              const setback = 8 + hash2(gx + ix, gy + iy, 1310) * 18;
              buildings.push(makeBuilding(
                left + lotGap + ix * (houseW + lotGap) + (iy ? setback * .25 : 0),
                top + lotGap + iy * (houseH + lotGap) + setback * .25,
                houseW - setback * .3,
                houseH - setback * .35,
                tint,
                "low",
                variant
              ));
            }
          }
          continue;
        }

        if (style === "green") {
          if (hash2(gx, gy, 1320) > .48) {
            buildings.push(makeBuilding(left + 34, top + 40, bw * .38, bh * .28, tint, "low", 80));
          }
          if (hash2(gx, gy, 1321) > .65) {
            buildings.push(makeBuilding(right - bw * .32 - 26, bottom - bh * .24 - 28, bw * .32, bh * .24, tint, "low", 81));
          }
          continue;
        }

        const r = hash2(gx, gy, 22);
        if (r < (style === "mixed-core" ? .06 : .15)) continue;

        if (style === "mixed-core" && r > .52) {
          const shopH = Math.max(68, bh * .22);
          const unitW = (bw - 38) / 3;
          for (let n = 0; n < 3; n += 1) {
            buildings.push(makeBuilding(
              left + 8 + n * (unitW + 7),
              top + 10,
              unitW,
              shopH,
              tint,
              "low",
              90 + n
            ));
          }
          buildings.push(makeBuilding(left + 20, top + shopH + 34, bw - 40, bh - shopH - 54, tint * .95, "normal", 94));
          continue;
        }

        if (r < 0.55) {
          buildings.push(makeBuilding(
            left + 20, top + 20, bw - 40, bh - 40, tint,
            hash2(gx, gy, 301) > 0.78 ? "tower" : "normal"
          ));
        } else if (r < 0.8) {
          const split = bw * (0.43 + hash2(gx, gy, 104) * 0.12);
          buildings.push(makeBuilding(left + 12, top + 18, split - 22, bh - 36, tint, "normal", 1));
          buildings.push(makeBuilding(left + split + 10, top + 32, bw - split - 22, bh - 64, tint * 0.94, "normal", 2));
        } else {
          const split = bh * (0.43 + hash2(gx, gy, 205) * 0.12);
          buildings.push(makeBuilding(left + 20, top + 12, bw - 40, split - 22, tint, "normal", 3));
          buildings.push(makeBuilding(left + 34, top + split + 10, bw - 68, bh - split - 22, tint * 0.93, "low", 4));
        }
      }
    }
  }

  function randomRoadPoint(seedA, seedB, offset = 0) {
    const horizontal = hash2(seedA, seedB, 5) > 0.5;
    const roadIndex = 1 + Math.floor(hash2(seedA, seedB, 8) * 16);
    const along = COAST + 240 + hash2(seedA, seedB, 13) * (WORLD_SIZE - COAST * 2 - 480);
    const forward = hash2(seedA, seedB, 19) > 0.5;

    if (horizontal) {
      const angle = forward ? 0 : Math.PI;
      const lane = forward ? -(LANE_OFFSET + offset * 0.15) : (LANE_OFFSET + offset * 0.15);
      return { x: along, y: roadIndex * ROAD_GAP + lane, angle };
    }

    const angle = forward ? Math.PI / 2 : -Math.PI / 2;
    const lane = forward ? (LANE_OFFSET + offset * 0.15) : -(LANE_OFFSET + offset * 0.15);
    return { x: roadIndex * ROAD_GAP + lane, y: along, angle };
  }

  function generateTraffic() {
    const colors = ["#d5d8da", "#6689ad", "#b26f67", "#c6a35a", "#59635f", "#89769e", "#579079"];
    for (let i = 0; i < 22; i += 1) {
      const p = randomRoadPoint(i + 2, i * 7 + 3, 18);
      const cruise = 150 + hash2(i, 4, 22) * 110;
      traffic.push({
        x: p.x,
        y: p.y,
        angle: p.angle,
        speed: cruise * 0.7,
        cruise,
        color: colors[i % colors.length],
        type: VEHICLE_TYPES[Math.floor(hash2(i, 8, 522) * VEHICLE_TYPES.length) % VEHICLE_TYPES.length],
        brakeGlow: 0
      });
    }
  }

  function generatePedestrians() {
    const pedestrianCount = 76;
    for (let i = 0; i < pedestrianCount; i += 1) {
      const central = i < 44;
      let x;
      let y;
      if (central) {
        x = 3400 + hash2(i, 2, 31) * 3300;
        y = 2700 + hash2(i, 9, 71) * 3600;
      } else {
        x = COAST + 300 + hash2(i, 2, 31) * (WORLD_SIZE - COAST * 2 - 600);
        y = COAST + 300 + hash2(i, 9, 71) * (WORLD_SIZE - COAST * 2 - 600);
      }
      let attempts = 0;
      while ((!canStand(x, y, 10) || isRoad(x, y)) && attempts < 40) {
        const a = i + attempts;
        if (central) {
          x = 3400 + hash2(a, 12, 44) * 3300;
          y = 2700 + hash2(a, 16, 84) * 3600;
        } else {
          x = COAST + 300 + hash2(a, 12, 44) * (WORLD_SIZE - COAST * 2 - 600);
          y = COAST + 300 + hash2(a, 16, 84) * (WORLD_SIZE - COAST * 2 - 600);
        }
        attempts += 1;
      }
      pedestrians.push({
        x,
        y,
        dir: hash2(i, 3, 90) * Math.PI * 2,
        timer: 1 + hash2(i, 4, 93) * 4,
        speed: 28 + hash2(i, 8, 96) * 30,
        color: ["#c77f66", "#718da7", "#ba9b58", "#8876a8", "#71957a"][i % 5],
        pants: ["#394248","#554a45","#2f3b4d","#45464d"][i % 4],
        hair: ["#302720","#4a3427","#1f2326","#684b36"][i % 4],
        skin: ["#e5b394","#d49b77","#f0c3a4","#b97f62"][i % 4],
        phase: hash2(i, 12, 97) * Math.PI * 2
      });
    }
  }

  function actorPosition() {
    return state.player.inVehicle ? { x: personalCar.x, y: personalCar.y } : { x: state.player.x, y: state.player.y };
  }

  function angleWrap(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function roadSnap(x, y) {
    const rx = Math.round(x / ROAD_GAP) * ROAD_GAP;
    const ry = Math.round(y / ROAD_GAP) * ROAD_GAP;
    if (Math.abs(x - rx) < Math.abs(y - ry)) {
      return { x: rx, y, orientation: "v" };
    }
    return { x, y: ry, orientation: "h" };
  }

  function destinationRoadPoint(place) {
    return { x: place.x, y: place.gy * ROAD_GAP, orientation: "h" };
  }

  function cardinalDirection(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return { x: dx >= 0 ? 1 : -1, y: 0 };
    return { x: 0, y: dy >= 0 ? 1 : -1 };
  }

  function laneNormal(direction) {
    return { x: direction.y, y: -direction.x };
  }

  function lanePoint(point, direction) {
    const normal = laneNormal(direction);
    return {
      x: point.x + normal.x * LANE_OFFSET,
      y: point.y + normal.y * LANE_OFFSET
    };
  }

  function appendLine(points, from, to, step = ROUTE_SAMPLE_STEP) {
    const d = distance(from.x, from.y, to.x, to.y);
    if (d < 0.5) {
      if (!points.length) points.push({ x: to.x, y: to.y });
      return;
    }
    const count = Math.max(1, Math.ceil(d / step));
    for (let i = points.length ? 1 : 0; i <= count; i += 1) {
      const t = i / count;
      points.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t
      });
    }
  }

  function appendCubic(points, p0, c1, c2, p1) {
    const estimate =
      distance(p0.x, p0.y, c1.x, c1.y) +
      distance(c1.x, c1.y, c2.x, c2.y) +
      distance(c2.x, c2.y, p1.x, p1.y);
    const count = Math.max(7, Math.ceil(estimate / ROUTE_SAMPLE_STEP));
    for (let i = 1; i <= count; i += 1) {
      const t = i / count;
      const u = 1 - t;
      points.push({
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
      });
    }
  }

  function routeGridBounds(value) {
    return clamp(value, 1, Math.floor(WORLD_SIZE / ROAD_GAP) - 1);
  }

  function nextIntersectionAhead(start, orientation, direction) {
    if (orientation === "h") {
      const gx = direction.x > 0
        ? Math.ceil((start.x + 3) / ROAD_GAP)
        : Math.floor((start.x - 3) / ROAD_GAP);
      return { gx: routeGridBounds(gx), gy: routeGridBounds(Math.round(start.y / ROAD_GAP)) };
    }
    const gy = direction.y > 0
      ? Math.ceil((start.y + 3) / ROAD_GAP)
      : Math.floor((start.y - 3) / ROAD_GAP);
    return { gx: routeGridBounds(Math.round(start.x / ROAD_GAP)), gy: routeGridBounds(gy) };
  }

  function gridRoute(startNode, goalNode, initialDirection) {
    const directions = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ];
    const dirIndex = directions.findIndex((dir) => dir.x === initialDirection.x && dir.y === initialDirection.y);
    const startKey = startNode.gx + "," + startNode.gy + "," + Math.max(0, dirIndex);
    const open = [{ gx: startNode.gx, gy: startNode.gy, dir: Math.max(0, dirIndex), g: 0, f: 0, key: startKey }];
    const best = new Map([[startKey, 0]]);
    const previous = new Map();
    let goalKey = null;

    const heuristic = (gx, gy) => Math.abs(goalNode.gx - gx) + Math.abs(goalNode.gy - gy);

    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (current.gx === goalNode.gx && current.gy === goalNode.gy) {
        goalKey = current.key;
        break;
      }

      for (let nextDir = 0; nextDir < directions.length; nextDir += 1) {
        const move = directions[nextDir];
        const ngx = current.gx + move.x;
        const ngy = current.gy + move.y;
        if (ngx < 1 || ngy < 1 || ngx > 17 || ngy > 17) continue;

        const reverse = (nextDir + 2) % 4 === current.dir;
        const turn = nextDir !== current.dir;
        const stepCost = reverse ? 8 : turn ? 1.28 : 1;
        const g = current.g + stepCost;
        const key = ngx + "," + ngy + "," + nextDir;
        if (best.has(key) && best.get(key) <= g) continue;

        best.set(key, g);
        previous.set(key, current.key);
        open.push({
          gx: ngx,
          gy: ngy,
          dir: nextDir,
          g,
          f: g + heuristic(ngx, ngy),
          key
        });
      }
    }

    if (!goalKey) return [startNode];

    const nodes = [];
    let key = goalKey;
    while (key) {
      const [gx, gy, dir] = key.split(",").map(Number);
      nodes.push({ gx, gy, dir });
      if (key === startKey) break;
      key = previous.get(key);
    }
    nodes.reverse();
    return nodes;
  }

  function buildLanePath(skeleton) {
    const clean = [];
    for (const point of skeleton) {
      const previous = clean[clean.length - 1];
      if (!previous || distance(previous.x, previous.y, point.x, point.y) > 1) clean.push(point);
    }
    if (clean.length < 2) return [{ x: personalCar.x, y: personalCar.y }];

    const directions = [];
    for (let i = 0; i < clean.length - 1; i += 1) {
      directions.push(cardinalDirection(clean[i + 1].x - clean[i].x, clean[i + 1].y - clean[i].y));
    }

    const points = [{ x: personalCar.x, y: personalCar.y }];
    const firstLane = lanePoint(clean[0], directions[0]);
    appendLine(points, points[points.length - 1], firstLane, 10);

    let cursor = firstLane;
    for (let i = 0; i < directions.length; i += 1) {
      const direction = directions[i];
      const segmentEnd = clean[i + 1];
      const laneEnd = lanePoint(segmentEnd, direction);

      if (i === directions.length - 1) {
        appendLine(points, cursor, laneEnd);
        cursor = laneEnd;
        continue;
      }

      const nextDirection = directions[i + 1];
      const isTurn = direction.x !== nextDirection.x || direction.y !== nextDirection.y;
      if (!isTurn) {
        appendLine(points, cursor, laneEnd);
        cursor = laneEnd;
        continue;
      }

      const currentLength = distance(clean[i].x, clean[i].y, segmentEnd.x, segmentEnd.y);
      const nextLength = distance(segmentEnd.x, segmentEnd.y, clean[i + 2].x, clean[i + 2].y);
      const radius = Math.max(34, Math.min(TURN_RADIUS, currentLength * 0.32, nextLength * 0.32));
      const currentNormal = laneNormal(direction);
      const nextNormal = laneNormal(nextDirection);
      const approach = {
        x: segmentEnd.x - direction.x * radius + currentNormal.x * LANE_OFFSET,
        y: segmentEnd.y - direction.y * radius + currentNormal.y * LANE_OFFSET
      };
      const departure = {
        x: segmentEnd.x + nextDirection.x * radius + nextNormal.x * LANE_OFFSET,
        y: segmentEnd.y + nextDirection.y * radius + nextNormal.y * LANE_OFFSET
      };
      const tangentIntersection = direction.x !== 0
        ? { x: departure.x, y: approach.y }
        : { x: approach.x, y: departure.y };
      const kappa = 0.5522847498;
      const tangentIn = distance(approach.x, approach.y, tangentIntersection.x, tangentIntersection.y) * kappa;
      const tangentOut = distance(departure.x, departure.y, tangentIntersection.x, tangentIntersection.y) * kappa;
      const control1 = {
        x: approach.x + direction.x * tangentIn,
        y: approach.y + direction.y * tangentIn
      };
      const control2 = {
        x: departure.x - nextDirection.x * tangentOut,
        y: departure.y - nextDirection.y * tangentOut
      };

      appendLine(points, cursor, approach);
      appendCubic(points, approach, control1, control2, departure);
      cursor = departure;
    }

    return points;
  }

  function nearestPathIndex(points, x, y) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      const d = distance(points[i].x, points[i].y, x, y);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function buildDrivingRoute(place) {
    const start = roadSnap(personalCar.x, personalCar.y);
    let initialDirection;
    if (start.orientation === "h") {
      const sign = Math.abs(Math.cos(personalCar.angle)) > 0.25
        ? (Math.cos(personalCar.angle) >= 0 ? 1 : -1)
        : (place.x >= personalCar.x ? 1 : -1);
      initialDirection = { x: sign, y: 0 };
    } else {
      const sign = Math.abs(Math.sin(personalCar.angle)) > 0.25
        ? (Math.sin(personalCar.angle) >= 0 ? 1 : -1)
        : (place.y >= personalCar.y ? 1 : -1);
      initialDirection = { x: 0, y: sign };
    }

    const firstNode = nextIntersectionAhead(start, start.orientation, initialDirection);
    const end = destinationRoadPoint(place);
    const goalNode = {
      gx: routeGridBounds(Math.round(end.x / ROAD_GAP)),
      gy: routeGridBounds(Math.round(end.y / ROAD_GAP))
    };
    const gridNodes = gridRoute(firstNode, goalNode, initialDirection);
    const skeleton = [
      { x: start.x, y: start.y },
      { x: firstNode.gx * ROAD_GAP, y: firstNode.gy * ROAD_GAP }
    ];

    for (let i = 1; i < gridNodes.length; i += 1) {
      skeleton.push({ x: gridNodes[i].gx * ROAD_GAP, y: gridNodes[i].gy * ROAD_GAP });
    }
    skeleton.push({ x: end.x, y: end.y });

    const points = buildLanePath(skeleton);
    const signals = [];
    for (let i = 1; i < skeleton.length - 1; i += 1) {
      const incoming = cardinalDirection(skeleton[i].x - skeleton[i - 1].x, skeleton[i].y - skeleton[i - 1].y);
      const orientation = incoming.x !== 0 ? "h" : "v";
      signals.push({
        x: skeleton[i].x,
        y: skeleton[i].y,
        orientation,
        pathIndex: nearestPathIndex(points, skeleton[i].x, skeleton[i].y)
      });
    }

    return { points, signals };
  }

  function updateRouteProgress() {
    const route = state.drive.route;
    if (!route.length) return;
    const start = Math.max(0, state.drive.routeIndex - 3);
    const end = Math.min(route.length - 1, state.drive.routeIndex + 36);
    let bestIndex = state.drive.routeIndex;
    let bestDistance = Infinity;
    for (let i = start; i <= end; i += 1) {
      const d = distance(personalCar.x, personalCar.y, route[i].x, route[i].y);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }
    state.drive.routeIndex = Math.max(state.drive.routeIndex, bestIndex);
    while (
      state.drive.routeIndex < route.length - 1 &&
      distance(personalCar.x, personalCar.y, route[state.drive.routeIndex].x, route[state.drive.routeIndex].y) < 22
    ) {
      state.drive.routeIndex += 1;
    }
  }

  function routeLookaheadTarget() {
    const route = state.drive.route;
    if (!route.length) return null;
    const lookahead = 42 + personalCar.speed * 0.13;
    let index = state.drive.routeIndex;
    let previous = { x: personalCar.x, y: personalCar.y };
    let accumulated = 0;
    while (index < route.length) {
      accumulated += distance(previous.x, previous.y, route[index].x, route[index].y);
      if (accumulated >= lookahead) return route[index];
      previous = route[index];
      index += 1;
    }
    return route[route.length - 1];
  }

  function routeDirection() {
    const target = routeLookaheadTarget();
    if (!target) return null;
    const dx = target.x - personalCar.x;
    const dy = target.y - personalCar.y;
    if (Math.hypot(dx, dy) < 1) return null;
    return { dx, dy, orientation: Math.abs(dx) >= Math.abs(dy) ? "h" : "v" };
  }

  function speedLimitAt(x, y) {
    if (distance(x, y, HOME.x, HOME.y) < 1350) return 40;
    const xi = Math.abs(Math.round(x / ROAD_GAP));
    const yi = Math.abs(Math.round(y / ROAD_GAP));
    if (xi % 5 === 0 || yi % 5 === 0) return 60;
    return 50;
  }

  function signalStateAt(ix, iy, orientation) {
    const offset = hash2(Math.round(ix / ROAD_GAP), Math.round(iy / ROAD_GAP), 612) * SIGNAL_CYCLE;
    const phase = (state.drive.signalClock + offset) % SIGNAL_CYCLE;
    const horizontal = phase < 8 ? "green" : phase < 10 ? "yellow" : "red";
    const vertical = phase >= 10 && phase < 18 ? "green" : phase >= 18 ? "yellow" : "red";
    return orientation === "h" ? horizontal : vertical;
  }

  function upcomingSignal() {
    let best = null;
    for (const signal of state.drive.signals) {
      if (signal.pathIndex < state.drive.routeIndex - 4) continue;
      if (signal.pathIndex > state.drive.routeIndex + 46) continue;
      const d = distance(personalCar.x, personalCar.y, signal.x, signal.y);
      if (d > 210) continue;
      if (!best || signal.pathIndex < best.pathIndex) {
        best = {
          state: signalStateAt(signal.x, signal.y, signal.orientation),
          distance: d,
          key: Math.round(signal.x) + ":" + Math.round(signal.y) + ":" + signal.orientation,
          pathIndex: signal.pathIndex
        };
      }
    }
    return best;
  }

  function leadVehicleInfo() {
    const hx = Math.cos(personalCar.angle);
    const hy = Math.sin(personalCar.angle);
    let best = null;
    for (const car of traffic) {
      const dx = car.x - personalCar.x;
      const dy = car.y - personalCar.y;
      const forward = dx * hx + dy * hy;
      if (forward <= 0 || forward > 280) continue;
      const lateral = Math.abs(dx * -hy + dy * hx);
      if (lateral > 72) continue;
      const sameDirection = Math.cos(car.angle) * hx + Math.sin(car.angle) * hy;
      if (sameDirection < 0.35) continue;
      if (!best || forward < best.distance) best = { car, distance: forward };
    }
    return best;
  }

  function penalizeDriving(amount, message) {
    state.drive.score = clamp(state.drive.score - amount, 0, 100);
    if (message) showToast(message);
  }

  function setDrivingDestination(place) {
    state.drive.destination = place.id;
    const plan = buildDrivingRoute(place);
    state.drive.route = plan.points;
    state.drive.signals = plan.signals;
    state.drive.routeIndex = 0;
    state.drive.score = 100;
    state.drive.speedingTimer = 0;
    state.drive.gapTimer = 0;
    state.drive.violationKeys = new Set();
    showToast(place.name + "へのルートを設定しました。W / ↑ または ACCEL で発進");
    requestAnimationFrame(focusGameCanvas);
  }

  function completeDrivingTrip() {
    const destination = PLACES.find((place) => place.id === state.drive.destination);
    state.drive.trips += 1;
    state.drive.rating = Math.round(((state.drive.rating * (state.drive.trips - 1)) + state.drive.score) / state.drive.trips);
    state.needs.fun += state.drive.score >= 90 ? 5 : 2;
    clampNeeds();
    showToast((destination ? destination.name : "目的地") + "に到着　運転評価 " + state.drive.score);
    state.drive.route = [];
    state.drive.routeIndex = 0;
    state.drive.signals = [];
    state.drive.destination = null;
    personalCar.speed = 0;
    saveGame(false);
  }

  function openDrivingMenu() {
    actionTitle.textContent = "カーナビ";
    actionDescription.textContent = "目的地を選ぶとルートは自動で設定されます。運転中は速度だけを操作します。";
    actionChoices.replaceChildren();

    for (const place of PLACES) {
      addChoice(
        place.name,
        state.drive.destination === place.id ? "現在の目的地" : "ルートを設定",
        () => setDrivingDestination(place),
        state.drive.destination === place.id
      );
    }

    addChoice("車から降りる", "完全に停止しているときのみ", () => exitCar(), Math.abs(personalCar.speed) > 8);
    actionSheet.hidden = false;
  }

  function currentDistrict(x, y) {
    const gx = Math.floor(x / ROAD_GAP);
    const gy = Math.floor(y / ROAD_GAP);
    const style = cityBlockStyle(gx, gy);
    if (style === "station") return "若葉駅前";
    if (style === "arcade") return "若葉サンモール";
    if (style === "alley") return "路地飲食街";
    if (style === "residential") return "西住宅街";
    if (style === "green" || distance(x, y, PARK.x, PARK.y) < 650) return "公園通り";
    if (style === "mixed-core") return "中央商業街";
    if (y > WORLD_SIZE * 0.72) return "南地区";
    if (y < WORLD_SIZE * 0.28) return "北地区";
    if (x < WORLD_SIZE * 0.3) return "西地区";
    if (x > WORLD_SIZE * 0.7) return "東地区";
    return "City Days";
  }

  function clampNeeds() {
    for (const key of Object.keys(state.needs)) state.needs[key] = clamp(state.needs[key], 0, 100);
  }

  function decayNeeds(minutes) {
    state.needs.hunger -= minutes * 0.018;
    state.needs.energy -= minutes * 0.015;
    state.needs.hygiene -= minutes * 0.009;
    state.needs.social -= minutes * 0.004;
    state.needs.fun -= minutes * 0.006;
    clampNeeds();
  }

  function chargeRentIfNeeded() {
    if (state.day > 1 && (state.day - 1) % 7 === 0) {
      state.cash -= RENT;
      showToast("家賃 ¥" + RENT.toLocaleString("ja-JP") + " を支払いました");
    }
  }

  function advanceTime(minutes, decay = true) {
    if (decay) decayNeeds(minutes);
    state.minute += minutes;
    while (state.minute >= 1440) {
      state.minute -= 1440;
      state.day += 1;
      chargeRentIfNeeded();
    }
  }

  function nextRentDay() {
    return Math.floor((state.day - 1) / 7 + 1) * 7 + 1;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = 2.6;
  }

  function focusGameCanvas() {
    try {
      canvas.focus({ preventScroll: true });
    } catch (_) {
      canvas.focus();
    }
  }

  function closeActionSheet() {
    actionSheet.hidden = true;
    actionChoices.replaceChildren();
    requestAnimationFrame(focusGameCanvas);
  }

  function addChoice(title, detail, handler, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = disabled;
    const b = document.createElement("b");
    b.textContent = title;
    const span = document.createElement("span");
    span.textContent = detail;
    button.append(b, span);
    button.addEventListener("click", () => {
      if (disabled) return;
      handler();
      closeActionSheet();
      saveGame(false);
    });
    actionChoices.appendChild(button);
  }

  function canPay(amount) {
    if (state.cash < amount) {
      showToast("お金が足りません");
      return false;
    }
    return true;
  }

  function minutesUntil(hour, minute = 0) {
    const target = hour * 60 + minute;
    if (state.minute < target) return target - state.minute;
    return 1440 - state.minute + target;
  }

  function openPlace(place) {
    actionTitle.textContent = place.name;
    actionDescription.textContent = "";
    actionChoices.replaceChildren();

    if (place.id === "home") {
      actionDescription.textContent = "生活の拠点。食事、睡眠、身支度ができます。";
      addChoice("料理する", "食料1個 / 45分 / 空腹を大きく回復", () => {
        if (state.groceries <= 0) {
          showToast("食料がありません。スーパーで買えます");
          return;
        }
        state.groceries -= 1;
        advanceTime(45);
        state.needs.hunger += 52;
        state.needs.fun += 4;
        state.needs.hygiene -= 2;
        clampNeeds();
        showToast("家で料理を食べました");
      });
      addChoice("シャワー", "20分 / 清潔を最大まで回復", () => {
        advanceTime(20);
        state.needs.hygiene = 100;
        state.needs.energy += 2;
        clampNeeds();
        showToast("さっぱりしました");
      });
      addChoice("眠る", "翌朝7:00まで / 体力を回復", () => {
        const sleepMinutes = minutesUntil(7, 0);
        advanceTime(sleepMinutes);
        state.needs.energy = 100;
        state.needs.hunger -= 8;
        state.needs.hygiene -= 5;
        state.needs.fun += 3;
        clampNeeds();
        state.player.x = HOME.x + 55;
        state.player.y = HOME.y + 65;
        showToast("よく眠れました");
      });
      addChoice("家でのんびり", "60分 / 体力と楽しさを回復", () => {
        advanceTime(60);
        state.needs.energy += 16;
        state.needs.fun += 18;
        state.needs.social -= 2;
        clampNeeds();
        showToast("家でゆっくり過ごしました");
      });
    }

    if (place.id === "store") {
      actionDescription.textContent = "食料品とちょっとした食事を買えます。";
      addChoice("食料を3個買う", "¥1,500 / 15分", () => {
        if (!canPay(1500)) return;
        state.cash -= 1500;
        state.groceries += 3;
        advanceTime(15);
        showToast("食料を3個買いました");
      });
      addChoice("惣菜を食べる", "¥750 / 25分 / 空腹+42", () => {
        if (!canPay(750)) return;
        state.cash -= 750;
        advanceTime(25);
        state.needs.hunger += 42;
        state.needs.fun += 3;
        clampNeeds();
        showToast("惣菜を食べました");
      });
      addChoice("コーヒー", "¥450 / 15分 / 体力+18", () => {
        if (!canPay(450)) return;
        state.cash -= 450;
        advanceTime(15);
        state.needs.energy += 18;
        state.needs.fun += 4;
        clampNeeds();
        showToast("コーヒーで一息つきました");
      });
    }

    if (place.id === "cafe") {
      actionDescription.textContent = "ここが勤務先。7:00〜18:00に4時間シフトへ入れます。";
      addChoice("4時間働く", "給与 ¥4,800 / 7:00〜18:00", () => {
        if (state.minute < 7 * 60 || state.minute > 18 * 60) {
          showToast("勤務できるのは7:00〜18:00です");
          return;
        }
        if (state.needs.energy < 20 || state.needs.hunger < 20) {
          showToast("体力か空腹が厳しく、今日は働けません");
          return;
        }
        advanceTime(240);
        state.cash += 4800;
        state.needs.social += 10;
        state.needs.fun -= 3;
        state.needs.hygiene -= 8;
        state.shiftsWorked += 1;
        clampNeeds();
        showToast("シフト終了 +¥4,800");
      });
      addChoice("ランチ", "¥900 / 30分 / 空腹+45", () => {
        if (!canPay(900)) return;
        state.cash -= 900;
        advanceTime(30);
        state.needs.hunger += 45;
        state.needs.social += 4;
        state.needs.fun += 5;
        clampNeeds();
        showToast("カフェでランチを食べました");
      });
    }

    if (place.id === "park") {
      actionDescription.textContent = "無料で休んだり、人と話したりできます。";
      addChoice("ベンチで休む", "60分 / 楽しさ+25 / 体力+9", () => {
        advanceTime(60);
        state.needs.fun += 25;
        state.needs.energy += 9;
        state.needs.hygiene -= 2;
        clampNeeds();
        showToast("公園でのんびりしました");
      });
      addChoice("散歩する", "45分 / 楽しさ+16 / 交流+7", () => {
        advanceTime(45);
        state.needs.fun += 16;
        state.needs.social += 7;
        state.needs.energy -= 5;
        clampNeeds();
        showToast("公園を散歩しました");
      });
    }

    if (place.id === "gym") {
      actionDescription.textContent = "運動で気分転換。利用料がかかります。";
      addChoice("トレーニング", "¥600 / 90分 / 楽しさ+15", () => {
        if (!canPay(600)) return;
        if (state.needs.energy < 25 || state.needs.hunger < 20) {
          showToast("まず食事か休息をとった方がよさそうです");
          return;
        }
        state.cash -= 600;
        advanceTime(90);
        state.needs.energy -= 16;
        state.needs.hunger -= 10;
        state.needs.hygiene -= 24;
        state.needs.fun += 15;
        state.fitness += 1;
        clampNeeds();
        showToast("トレーニングを終えました");
      });
      addChoice("ジムのシャワー", "¥300 / 15分 / 清潔+70", () => {
        if (!canPay(300)) return;
        state.cash -= 300;
        advanceTime(15);
        state.needs.hygiene += 70;
        clampNeeds();
        showToast("シャワーを浴びました");
      });
    }

    if (place.id === "library") {
      actionDescription.textContent = "静かな場所で読書や勉強ができます。利用は無料です。";
      addChoice("読書する", "75分 / 楽しさ+20 / 体力+5", () => {
        advanceTime(75);
        state.needs.fun += 20;
        state.needs.energy += 5;
        state.libraryVisits += 1;
        clampNeeds();
        showToast("読書に集中しました");
      });
      addChoice("勉強する", "120分 / 将来のための自己投資", () => {
        advanceTime(120);
        state.needs.energy -= 8;
        state.needs.fun += 6;
        state.libraryVisits += 2;
        clampNeeds();
        showToast("しっかり勉強しました");
      });
    }

    actionSheet.hidden = false;
  }

  function openNpc(npc) {
    actionTitle.textContent = npc.name;
    actionDescription.textContent = npc.id === "aoi"
      ? "公園でよく会う近所の人。"
      : npc.id === "sora"
        ? "カフェの同僚。"
        : "図書館でよく見かける学生。";
    actionChoices.replaceChildren();
    addChoice("少し話す", "30分 / 交流+24 / 楽しさ+7", () => {
      advanceTime(30);
      state.needs.social += 24;
      state.needs.fun += 7;
      npc.friendship += 1;
      clampNeeds();
      showToast(npc.name + "と話しました");
    });
    if (npc.friendship >= 2) {
      addChoice("一緒に過ごす", "90分 / 交流+38 / 楽しさ+22", () => {
        advanceTime(90);
        state.needs.social += 38;
        state.needs.fun += 22;
        state.needs.hunger -= 5;
        npc.friendship += 1;
        clampNeeds();
        showToast(npc.name + "と楽しい時間を過ごしました");
      });
    }
    actionSheet.hidden = false;
  }

  function nearestInteraction() {
    const p = actorPosition();

    if (state.player.inVehicle) {
      return { type: "car-menu", label: state.drive.destination ? "ルート・降車メニュー" : "目的地を選ぶ" };
    }

    if (distance(p.x, p.y, personalCar.x, personalCar.y) < 70) {
      return { type: "car-enter", label: "自分の車に乗る" };
    }

    let nearestNpc = null;
    let npcDistance = 72;
    for (const npc of NPCS) {
      const d = distance(p.x, p.y, npc.x, npc.y);
      if (d < npcDistance) {
        nearestNpc = npc;
        npcDistance = d;
      }
    }
    if (nearestNpc) return { type: "npc", target: nearestNpc, label: nearestNpc.name + "と話す" };

    let nearestPlace = null;
    let placeDistance = 105;
    for (const place of PLACES) {
      const d = distance(p.x, p.y, place.x, place.y);
      if (d < placeDistance) {
        nearestPlace = place;
        placeDistance = d;
      }
    }
    if (nearestPlace) return { type: "place", target: nearestPlace, label: nearestPlace.name + "を利用" };

    return null;
  }

  function enterCar() {
    state.player.inVehicle = true;
    state.player.x = personalCar.x;
    state.player.y = personalCar.y;
    document.body.classList.add("driving");
    showToast("乗車しました。まず目的地を選びます");
    openDrivingMenu();
  }

  function exitCar() {
    if (Math.abs(personalCar.speed) > 8) {
      showToast("完全に停止してから降りてください");
      return;
    }
    const sideX = Math.cos(personalCar.angle + Math.PI / 2) * 48;
    const sideY = Math.sin(personalCar.angle + Math.PI / 2) * 48;
    const spots = [
      [personalCar.x + sideX, personalCar.y + sideY],
      [personalCar.x - sideX, personalCar.y - sideY],
      [personalCar.x - Math.cos(personalCar.angle) * 54, personalCar.y - Math.sin(personalCar.angle) * 54]
    ];
    const spot = spots.find(([x, y]) => canStand(x, y, PLAYER_RADIUS));
    if (!spot) {
      showToast("ここでは降りられません");
      return;
    }
    state.player.x = spot[0];
    state.player.y = spot[1];
    state.player.inVehicle = false;
    state.drive.route = [];
    state.drive.routeIndex = 0;
    state.drive.signals = [];
    state.drive.destination = null;
    personalCar.speed = 0;
    document.body.classList.remove("driving");
  }

  function performAction() {
    if (!actionSheet.hidden) {
      closeActionSheet();
      return;
    }

    const item = nearestInteraction();
    if (!item) {
      showToast("近くに利用できるものはありません");
      return;
    }

    if (item.type === "car-enter") enterCar();
    if (item.type === "car-menu") openDrivingMenu();
    if (item.type === "place") openPlace(item.target);
    if (item.type === "npc") openNpc(item.target);
  }

  function resize() {
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2.25);
    canvas.width = Math.max(1, Math.floor(viewWidth * dpr));
    canvas.height = Math.max(1, Math.floor(viewHeight * dpr));
    canvas.style.width = viewWidth + "px";
    canvas.style.height = viewHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function saveGame(showMessage = false) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        player: {
          x: state.player.x,
          y: state.player.y,
          facingX: state.player.facingX,
          facingY: state.player.facingY,
          inVehicle: state.player.inVehicle
        },
        car: {
          x: personalCar.x,
          y: personalCar.y,
          angle: personalCar.angle
        },
        day: state.day,
        minute: state.minute,
        cash: state.cash,
        groceries: state.groceries,
        fitness: state.fitness,
        libraryVisits: state.libraryVisits,
        shiftsWorked: state.shiftsWorked,
        needs: state.needs,
        driving: {
          rating: state.drive.rating,
          trips: state.drive.trips
        },
        friends: Object.fromEntries(NPCS.map((npc) => [npc.id, npc.friendship])),
        savedAt: Date.now()
      }));
      if (showMessage) showToast("生活データを保存しました");
    } catch (error) {
      console.warn("save failed", error);
      if (showMessage) showToast("保存できませんでした");
    }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1) return;

      if (saved.player) {
        const x = Number(saved.player.x);
        const y = Number(saved.player.y);
        if (Number.isFinite(x) && Number.isFinite(y) && canStand(x, y)) {
          state.player.x = x;
          state.player.y = y;
        }
        state.player.facingX = Number(saved.player.facingX) || 0;
        state.player.facingY = Number(saved.player.facingY) || 1;
        state.player.inVehicle = Boolean(saved.player.inVehicle);
      }

      if (saved.car) {
        const x = Number(saved.car.x);
        const y = Number(saved.car.y);
        if (Number.isFinite(x) && Number.isFinite(y) && inWorld(x, y, 30)) {
          personalCar.x = x;
          personalCar.y = y;
        }
        personalCar.angle = Number(saved.car.angle) || 0;
      }

      state.day = Math.max(1, Math.floor(Number(saved.day) || 1));
      state.minute = clamp(Number(saved.minute) || 480, 0, 1439.99);
      state.cash = Math.floor(Number(saved.cash) || 0);
      state.groceries = Math.max(0, Math.floor(Number(saved.groceries) || 0));
      state.fitness = Math.max(0, Math.floor(Number(saved.fitness) || 0));
      state.libraryVisits = Math.max(0, Math.floor(Number(saved.libraryVisits) || 0));
      state.shiftsWorked = Math.max(0, Math.floor(Number(saved.shiftsWorked) || 0));
      if (saved.driving) {
        state.drive.rating = clamp(Math.round(Number(saved.driving.rating) || 100), 0, 100);
        state.drive.trips = Math.max(0, Math.floor(Number(saved.driving.trips) || 0));
      }

      if (saved.needs) {
        for (const key of Object.keys(state.needs)) {
          if (Number.isFinite(Number(saved.needs[key]))) state.needs[key] = Number(saved.needs[key]);
        }
        clampNeeds();
      }

      if (saved.friends) {
        for (const npc of NPCS) npc.friendship = Math.max(0, Math.floor(Number(saved.friends[npc.id]) || 0));
      }

      if (state.player.inVehicle) {
        state.player.x = personalCar.x;
        state.player.y = personalCar.y;
      }
    } catch (error) {
      console.warn("load failed", error);
    }
  }

  function updatePlayerOnFoot(dt) {
    let x = 0;
    let y = 0;
    let running = touch.run || keys.has("shift");

    if (Math.abs(touch.x) > 0.03 || Math.abs(touch.y) > 0.03) {
      x = touch.x;
      y = touch.y;
      if (Math.hypot(x, y) > 0.92) running = true;
    } else {
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
    }

    const mag = Math.hypot(x, y);
    if (mag > 0.02) {
      x /= Math.max(1, mag);
      y /= Math.max(1, mag);
      state.player.facingX = x;
      state.player.facingY = y;

      let speed = running ? RUN_SPEED : WALK_SPEED;
      if (state.needs.energy < 15) speed *= 0.72;
      if (state.needs.hunger < 10) speed *= 0.8;

      const nx = state.player.x + x * speed * dt;
      const ny = state.player.y + y * speed * dt;
      if (canStand(nx, state.player.y)) state.player.x = nx;
      if (canStand(state.player.x, ny)) state.player.y = ny;

      if (running) {
        state.needs.energy -= dt * 0.4;
        state.needs.hygiene -= dt * 0.12;
      }
    }
  }

  function updateCar(dt) {
    state.drive.signalClock += dt;
    state.drive.collisionCooldown = Math.max(0, state.drive.collisionCooldown - dt);

    if (!state.drive.destination || !state.drive.route.length) {
      personalCar.speed *= Math.pow(0.72, dt * 10);
      if (personalCar.speed < 1) personalCar.speed = 0;
      state.player.x = personalCar.x;
      state.player.y = personalCar.y;
      return;
    }

    const accelerating = touch.driveAccel || keys.has("w") || keys.has("arrowup");
    const braking = touch.driveBrake || keys.has("s") || keys.has("arrowdown") || keys.has(" ");

    updateRouteProgress();
    const target = routeLookaheadTarget();
    if (target) {
      const desired = Math.atan2(target.y - personalCar.y, target.x - personalCar.x);
      const diff = angleWrap(desired - personalCar.angle);
      const speedRatio = clamp(personalCar.speed / 340, 0, 1);
      const maxYawRate = 2.4 - speedRatio * 1.15;
      personalCar.angle += clamp(diff, -maxYawRate * dt, maxYawRate * dt);
    }

    if (accelerating && !braking) personalCar.speed += 230 * dt;
    else if (braking) personalCar.speed -= 330 * dt;
    else personalCar.speed *= Math.pow(0.93, dt * 10);

    personalCar.speed = clamp(personalCar.speed, 0, 390);

    const limit = speedLimitAt(personalCar.x, personalCar.y);
    const kmh = personalCar.speed * SPEED_TO_KMH;
    if (kmh > limit + 4) {
      state.drive.speedingTimer += dt;
      if (state.drive.speedingTimer >= 1.5) {
        state.drive.speedingTimer = 0;
        penalizeDriving(2, "速度超過: 制限 " + limit + " km/h");
      }
    } else {
      state.drive.speedingTimer = Math.max(0, state.drive.speedingTimer - dt * 2);
    }

    const signal = upcomingSignal();
    if (
      signal &&
      signal.state === "red" &&
      signal.distance < STOP_LINE_OFFSET + VEHICLE_FRONT_OVERHANG * 0.7 &&
      personalCar.speed > 18 &&
      !state.drive.violationKeys.has(signal.key)
    ) {
      state.drive.violationKeys.add(signal.key);
      penalizeDriving(18, "赤信号を通過しました");
    }

    const lead = leadVehicleInfo();
    if (lead) {
      const safeDistance = 55 + personalCar.speed * 0.42;
      if (lead.distance < safeDistance) {
        state.drive.gapTimer += dt;
        if (state.drive.gapTimer >= 1.15) {
          state.drive.gapTimer = 0;
          penalizeDriving(2, "車間距離が近すぎます");
        }
      } else {
        state.drive.gapTimer = Math.max(0, state.drive.gapTimer - dt);
      }

      if (lead.distance < 38) {
        personalCar.speed = Math.min(personalCar.speed, Math.max(0, lead.car.speed - 20));
        if (state.drive.collisionCooldown <= 0) {
          state.drive.collisionCooldown = 2.5;
          penalizeDriving(12, "前方車両に接触しました");
        }
      }
    } else {
      state.drive.gapTimer = 0;
    }

    const ox = personalCar.x;
    const oy = personalCar.y;
    personalCar.x += Math.cos(personalCar.angle) * personalCar.speed * dt;
    personalCar.y += Math.sin(personalCar.angle) * personalCar.speed * dt;


    if (!inWorld(personalCar.x, personalCar.y, 32) || collidesBuilding(personalCar.x, personalCar.y, 29)) {
      personalCar.x = ox;
      personalCar.y = oy;
      personalCar.speed = 0;
      penalizeDriving(8, "路外へ出ました");
    }

    state.player.x = personalCar.x;
    state.player.y = personalCar.y;

    const destination = state.drive.destination ? PLACES.find((place) => place.id === state.drive.destination) : null;
    const route = state.drive.route;
    const finalPoint = route[route.length - 1];
    if (destination && finalPoint && state.drive.routeIndex >= route.length - 1) {
      const finalDistance = distance(personalCar.x, personalCar.y, finalPoint.x, finalPoint.y);
      if (finalDistance < 58 && personalCar.speed < 8) completeDrivingTrip();
    }
  }

  function updateTraffic(dt) {
    for (const car of traffic) {
      const orientation = Math.abs(Math.cos(car.angle)) >= Math.abs(Math.sin(car.angle)) ? "h" : "v";
      let nextX;
      let nextY;
      let intersectionDistance;

      if (orientation === "h") {
        nextX = car.angle === 0
          ? Math.ceil((car.x + 1) / ROAD_GAP) * ROAD_GAP
          : Math.floor((car.x - 1) / ROAD_GAP) * ROAD_GAP;
        nextY = Math.round(car.y / ROAD_GAP) * ROAD_GAP;
        intersectionDistance = Math.abs(nextX - car.x);
      } else {
        nextX = Math.round(car.x / ROAD_GAP) * ROAD_GAP;
        nextY = Math.sin(car.angle) > 0
          ? Math.ceil((car.y + 1) / ROAD_GAP) * ROAD_GAP
          : Math.floor((car.y - 1) / ROAD_GAP) * ROAD_GAP;
        intersectionDistance = Math.abs(nextY - car.y);
      }

      const signal = signalStateAt(nextX, nextY, orientation);
      const roadLimit = speedLimitAt(car.x, car.y) / SPEED_TO_KMH;
      let targetSpeed = Math.min(car.cruise, roadLimit * 0.92);
      const stopCenterDistance = STOP_LINE_OFFSET + VEHICLE_FRONT_OVERHANG;
      if ((signal === "red" || signal === "yellow") && intersectionDistance < stopCenterDistance + 62) {
        targetSpeed = Math.max(0, (intersectionDistance - stopCenterDistance) * 2.6);
      }

      const hx = Math.cos(car.angle);
      const hy = Math.sin(car.angle);
      let leadDistance = Infinity;
      for (const other of traffic) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const forward = dx * hx + dy * hy;
        if (forward <= 0 || forward > 180) continue;
        const lateral = Math.abs(dx * -hy + dy * hx);
        if (lateral > 42) continue;
        const sameDirection = Math.cos(other.angle) * hx + Math.sin(other.angle) * hy;
        if (sameDirection > 0.7) leadDistance = Math.min(leadDistance, forward);
      }

      if (state.player.inVehicle) {
        const dx = personalCar.x - car.x;
        const dy = personalCar.y - car.y;
        const forward = dx * hx + dy * hy;
        const lateral = Math.abs(dx * -hy + dy * hx);
        const sameDirection = Math.cos(personalCar.angle) * hx + Math.sin(personalCar.angle) * hy;
        if (forward > 0 && forward < 180 && lateral < 55 && sameDirection > 0.5) {
          leadDistance = Math.min(leadDistance, forward);
        }
      }

      if (leadDistance < 120) {
        targetSpeed = Math.min(targetSpeed, Math.max(0, (leadDistance - 36) * 2.1));
      }

      const brakingNow = targetSpeed < car.speed - 10;
      car.brakeGlow += ((brakingNow ? 1 : 0) - car.brakeGlow) * Math.min(1, dt * 8);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2.4);

      const ox = car.x;
      const oy = car.y;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;

      if (!inWorld(car.x, car.y, 28)) {
        if (car.x < COAST) car.x = WORLD_SIZE - COAST - 40;
        if (car.x > WORLD_SIZE - COAST) car.x = COAST + 40;
        if (car.y < COAST) car.y = WORLD_SIZE - COAST - 40;
        if (car.y > WORLD_SIZE - COAST) car.y = COAST + 40;
      } else if (collidesBuilding(car.x, car.y, 25)) {
        car.x = ox;
        car.y = oy;
        car.speed *= 0.2;
      }
    }
  }

  function updatePedestrians(dt) {
    for (const ped of pedestrians) {
      ped.timer -= dt;
      ped.phase += dt * ped.speed * .12;
      if (ped.timer <= 0) {
        ped.timer = 1.5 + Math.random() * 4;
        ped.dir += (Math.random() - 0.5) * 2;
      }
      const nx = ped.x + Math.cos(ped.dir) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.dir) * ped.speed * dt;
      if (canStand(nx, ny, 10) && !isRoad(nx, ny)) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.dir += Math.PI * (0.65 + Math.random() * 0.7);
      }
    }
  }

  function update(dt) {
    if (state.paused || !actionSheet.hidden || !helpPanel.hidden) return;

    if (!state.player.inVehicle) state.drive.signalClock += dt;
    if (state.player.inVehicle) updateCar(dt);
    else updatePlayerOnFoot(dt);

    updateTraffic(dt);
    updatePedestrians(dt);

    state.visual.weatherClock += dt;
    state.visual.rainPhase += dt;
    if (state.visual.weatherClock >= state.visual.weatherDuration) {
      state.visual.weatherClock = 0;
      const roll = hash2(state.day, Math.floor(state.minute / 60), Math.floor(performance.now() / 1000));
      state.visual.weather = roll < .54 ? "clear" : roll < .76 ? "cloudy" : "rain";
      state.visual.weatherDuration = 45 + roll * 50;
      if (state.visual.weather === "rain") showToast("雨が降ってきました");
      if (state.visual.weather === "clear") showToast("空が晴れてきました");
    }

    const gameMinutes = dt * 0.7;
    advanceTime(gameMinutes);

    autosaveTimer += dt;
    if (autosaveTimer >= 5) {
      autosaveTimer = 0;
      saveGame(false);
    }

    const p = actorPosition();
    let desiredLeadX = 0;
    let desiredLeadY = 0;
    if (state.player.inVehicle) {
      const lead = clamp(34 + personalCar.speed * .34, 34, 155);
      desiredLeadX = Math.cos(personalCar.angle) * lead;
      desiredLeadY = Math.sin(personalCar.angle) * lead;
    } else {
      desiredLeadX = state.player.facingX * 26;
      desiredLeadY = state.player.facingY * 26;
    }

    const leadBlend = 1 - Math.pow(.9, dt * 60);
    state.visual.cameraLeadX += (desiredLeadX - state.visual.cameraLeadX) * leadBlend;
    state.visual.cameraLeadY += (desiredLeadY - state.visual.cameraLeadY) * leadBlend;

    const targetX = clamp(p.x + state.visual.cameraLeadX - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
    const targetY = clamp(p.y + state.visual.cameraLeadY - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
    const blend = 1 - Math.pow(0.9, dt * 60);
    state.camera.x += (targetX - state.camera.x) * blend;
    state.camera.y += (targetY - state.camera.y) * blend;

    clampNeeds();
  }

  function beginWorldProjection() {
    ctx.save();
    const cx = viewWidth / 2;
    const cy = viewHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(WORLD_TILT_X, WORLD_TILT_Y);
    ctx.translate(-cx, -cy);
  }

  function endWorldProjection() {
    ctx.restore();
  }

  function worldToScreen(x, y) {
    return { x: x - state.camera.x, y: y - state.camera.y };
  }

  function visibleRect(rect, padding = 0) {
    return !(
      rect.x + rect.w < state.camera.x - padding ||
      rect.y + rect.h < state.camera.y - padding ||
      rect.x > state.camera.x + viewWidth + padding ||
      rect.y > state.camera.y + viewHeight + padding
    );
  }

  function visualTime() {
    const t = state.minute / 1440;
    const sun = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));
    const angle = (t - 0.25) * Math.PI * 2;
    return {
      daylight: sun,
      shadowX: Math.cos(angle) * (18 + (1 - sun) * 24),
      shadowY: Math.sin(angle) * (18 + (1 - sun) * 24),
      night: clamp(1 - sun * 1.18, 0, 1)
    };
  }

  function roundedRectPath(context, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + w, y, x + w, y + h, radius);
    context.arcTo(x + w, y + h, x, y + h, radius);
    context.arcTo(x, y + h, x, y, radius);
    context.arcTo(x, y, x + w, y, radius);
    context.closePath();
  }

  function drawWorldDashedVertical(worldX, dashLength, gapLength, color, lineWidth) {
    const period = dashLength + gapLength;
    const minWorldY = state.camera.y - period;
    const maxWorldY = state.camera.y + viewHeight + period;
    let worldY = Math.floor(minWorldY / period) * period;
    const screenX = worldX - state.camera.x;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (; worldY <= maxWorldY; worldY += period) {
      const sy = worldY - state.camera.y;
      ctx.moveTo(screenX, sy);
      ctx.lineTo(screenX, sy + dashLength);
    }
    ctx.stroke();
  }

  function drawWorldDashedHorizontal(worldY, dashLength, gapLength, color, lineWidth) {
    const period = dashLength + gapLength;
    const minWorldX = state.camera.x - period;
    const maxWorldX = state.camera.x + viewWidth + period;
    let worldX = Math.floor(minWorldX / period) * period;
    const screenY = worldY - state.camera.y;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (; worldX <= maxWorldX; worldX += period) {
      const sx = worldX - state.camera.x;
      ctx.moveTo(sx, screenY);
      ctx.lineTo(sx + dashLength, screenY);
    }
    ctx.stroke();
  }

  function drawRoadCenterSegmentVertical(worldX, worldY1, worldY2, major) {
    const sx = worldX - state.camera.x;
    const sy1 = worldY1 - state.camera.y;
    const sy2 = worldY2 - state.camera.y;
    ctx.strokeStyle = major ? "rgba(226,164,46,.9)" : "rgba(238,240,236,.72)";
    ctx.lineWidth = major ? 3.2 : 2.2;
    if (major) {
      ctx.beginPath();
      ctx.moveTo(sx, sy1);
      ctx.lineTo(sx, sy2);
      ctx.stroke();
      return;
    }
    const dash = 22;
    const gap = 18;
    const period = dash + gap;
    let wy = Math.floor(worldY1 / period) * period;
    ctx.beginPath();
    for (; wy <= worldY2; wy += period) {
      const fromY = Math.max(wy, worldY1) - state.camera.y;
      const toY = Math.min(wy + dash, worldY2) - state.camera.y;
      if (toY <= fromY) continue;
      ctx.moveTo(sx, fromY);
      ctx.lineTo(sx, toY);
    }
    ctx.stroke();
  }

  function drawRoadCenterSegmentHorizontal(worldY, worldX1, worldX2, major) {
    const sy = worldY - state.camera.y;
    const sx1 = worldX1 - state.camera.x;
    const sx2 = worldX2 - state.camera.x;
    ctx.strokeStyle = major ? "rgba(226,164,46,.9)" : "rgba(238,240,236,.72)";
    ctx.lineWidth = major ? 3.2 : 2.2;
    if (major) {
      ctx.beginPath();
      ctx.moveTo(sx1, sy);
      ctx.lineTo(sx2, sy);
      ctx.stroke();
      return;
    }
    const dash = 22;
    const gap = 18;
    const period = dash + gap;
    let wx = Math.floor(worldX1 / period) * period;
    ctx.beginPath();
    for (; wx <= worldX2; wx += period) {
      const fromX = Math.max(wx, worldX1) - state.camera.x;
      const toX = Math.min(wx + dash, worldX2) - state.camera.x;
      if (toX <= fromX) continue;
      ctx.moveTo(fromX, sy);
      ctx.lineTo(toX, sy);
    }
    ctx.stroke();
  }

  function drawRoadArrow(screenX, screenY, angle) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(244,245,240,.76)";
    ctx.beginPath();
    ctx.moveTo(23, 0);
    ctx.lineTo(7, -8);
    ctx.lineTo(7, -3);
    ctx.lineTo(-18, -3);
    ctx.lineTo(-18, 3);
    ctx.lineTo(7, 3);
    ctx.lineTo(7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTactilePad(x, y, vertical = false) {
    ctx.fillStyle = "#d8b736";
    ctx.fillRect(x - (vertical ? 6 : 11), y - (vertical ? 11 : 6), vertical ? 12 : 22, vertical ? 22 : 12);
    ctx.fillStyle = "rgba(103,83,22,.28)";
    for (let ix = -1; ix <= 1; ix += 1) {
      for (let iy = -1; iy <= 1; iy += 1) {
        ctx.beginPath();
        ctx.arc(x + ix * 6, y + iy * 4, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGuardPipe(x1, y1, x2, y2) {
    ctx.strokeStyle = "#eceee9";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    for (let t = .15; t < 1; t += .34) {
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (vertical ? 7 : 0), y + (vertical ? 0 : 7));
      ctx.stroke();
    }
  }

  function drawJapaneseIntersectionMarkings(sx, sy, wx, wy) {
    const crossingSpan = ROAD_WIDTH - 44;
    const stripe = 5;
    const stripeGap = 6;
    const halfSpan = crossingSpan / 2;

    ctx.fillStyle = "rgba(244,245,240,.88)";

    // Zebra crossings: each white bar runs in the pedestrian travel direction.
    // North/south crossings use vertical bars repeated across the road.
    for (let d = -halfSpan; d <= halfSpan; d += stripe + stripeGap) {
      ctx.fillRect(
        sx + d,
        sy - CROSSWALK_OFFSET - CROSSWALK_DEPTH / 2,
        stripe,
        CROSSWALK_DEPTH
      );
      ctx.fillRect(
        sx + d,
        sy + CROSSWALK_OFFSET - CROSSWALK_DEPTH / 2,
        stripe,
        CROSSWALK_DEPTH
      );
    }

    // East/west crossings use horizontal bars repeated across the road.
    for (let d = -halfSpan; d <= halfSpan; d += stripe + stripeGap) {
      ctx.fillRect(
        sx - CROSSWALK_OFFSET - CROSSWALK_DEPTH / 2,
        sy + d,
        CROSSWALK_DEPTH,
        stripe
      );
      ctx.fillRect(
        sx + CROSSWALK_OFFSET - CROSSWALK_DEPTH / 2,
        sy + d,
        CROSSWALK_DEPTH,
        stripe
      );
    }

    // Japanese left-hand traffic: one stop line per incoming lane.
    // Keep a small gap at the center line and at the shoulder so the line reads
    // as a lane-width stop line rather than a road-wide barrier.
    const inner = STOP_LINE_CENTER_MARGIN;
    const outer = ROAD_HALF - STOP_LINE_EDGE_MARGIN;
    const lineLength = outer - inner;
    const lineWidth = 4;
    ctx.fillStyle = "rgba(248,248,244,.96)";

    // North approach, travelling south: east/right half of the vertical road.
    ctx.fillRect(sx + inner, sy - STOP_LINE_OFFSET - lineWidth / 2, lineLength, lineWidth);
    // South approach, travelling north: west/left half.
    ctx.fillRect(sx - outer, sy + STOP_LINE_OFFSET - lineWidth / 2, lineLength, lineWidth);
    // West approach, travelling east: north/top half of the horizontal road.
    ctx.fillRect(sx - STOP_LINE_OFFSET - lineWidth / 2, sy - outer, lineWidth, lineLength);
    // East approach, travelling west: south/bottom half.
    ctx.fillRect(sx + STOP_LINE_OFFSET - lineWidth / 2, sy + inner, lineWidth, lineLength);

    // Direction arrows sit behind the stop line.
    const arrowDistance = STOP_LINE_OFFSET + 62;
    drawRoadArrow(sx + LANE_OFFSET, sy - arrowDistance, Math.PI / 2);
    drawRoadArrow(sx - LANE_OFFSET, sy + arrowDistance, -Math.PI / 2);
    drawRoadArrow(sx - arrowDistance, sy - LANE_OFFSET, 0);
    drawRoadArrow(sx + arrowDistance, sy + LANE_OFFSET, Math.PI);

    // Yellow tactile paving at curb ramps.
    const curb = ROAD_HALF + 14;
    drawTactilePad(sx - curb, sy - CROSSWALK_OFFSET, false);
    drawTactilePad(sx + curb, sy - CROSSWALK_OFFSET, false);
    drawTactilePad(sx - curb, sy + CROSSWALK_OFFSET, false);
    drawTactilePad(sx + curb, sy + CROSSWALK_OFFSET, false);
    drawTactilePad(sx - CROSSWALK_OFFSET, sy - curb, true);
    drawTactilePad(sx - CROSSWALK_OFFSET, sy + curb, true);
    drawTactilePad(sx + CROSSWALK_OFFSET, sy - curb, true);
    drawTactilePad(sx + CROSSWALK_OFFSET, sy + curb, true);

    // Short white guard pipes on the sidewalk corners.
    drawGuardPipe(sx - curb - 20, sy - curb - 44, sx - curb - 20, sy - curb - 10);
    drawGuardPipe(sx + curb + 20, sy + curb + 10, sx + curb + 20, sy + curb + 44);
    drawGuardPipe(sx - curb - 44, sy + curb + 20, sx - curb - 10, sy + curb + 20);
    drawGuardPipe(sx + curb + 10, sy - curb - 20, sx + curb + 44, sy - curb - 20);

    // Occasional pavement speed marking on major roads.
    const limit = speedLimitAt(wx, wy);
    if (limit >= 50 && hash2(Math.round(wx / ROAD_GAP), Math.round(wy / ROAD_GAP), 1251) > .54) {
      ctx.save();
      ctx.fillStyle = "rgba(242,243,239,.5)";
      ctx.font = "700 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(limit), sx - LANE_OFFSET, sy + arrowDistance + 54);
      ctx.restore();
    }
  }

  function drawGround() {
    const time = visualTime();
    ctx.fillStyle = "#7e8f78";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const startBlockX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endBlockX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startBlockY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endBlockY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;

    for (let gx = startBlockX; gx <= endBlockX; gx += 1) {
      for (let gy = startBlockY; gy <= endBlockY; gy += 1) {
        const sx = gx * ROAD_GAP - state.camera.x;
        const sy = gy * ROAD_GAP - state.camera.y;
        const seed = hash2(gx, gy, 700);
        ctx.fillStyle = seed > 0.5 ? "rgba(255,255,255,.018)" : "rgba(0,0,0,.018)";
        ctx.fillRect(sx + ROAD_HALF, sy + ROAD_HALF, ROAD_GAP - ROAD_WIDTH, ROAD_GAP - ROAD_WIDTH);
      }
    }

    const edges = {
      left: COAST - state.camera.x,
      top: COAST - state.camera.y,
      right: WORLD_SIZE - COAST - state.camera.x,
      bottom: WORLD_SIZE - COAST - state.camera.y
    };

    ctx.fillStyle = "#4e7d89";
    if (edges.left > 0) ctx.fillRect(0, 0, edges.left, viewHeight);
    if (edges.top > 0) ctx.fillRect(0, 0, viewWidth, edges.top);
    if (edges.right < viewWidth) ctx.fillRect(edges.right, 0, viewWidth - edges.right, viewHeight);
    if (edges.bottom < viewHeight) ctx.fillRect(0, edges.bottom, viewWidth, viewHeight - edges.bottom);

    ctx.strokeStyle = "rgba(220,242,244,.18)";
    ctx.lineWidth = 2;
    for (let y = 28; y < viewHeight; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin((y + state.camera.x) * 0.012) * 5);
      ctx.lineTo(Math.max(0, edges.left), y);
      ctx.stroke();
      if (edges.right < viewWidth) {
        ctx.beginPath();
        ctx.moveTo(edges.right, y);
        ctx.lineTo(viewWidth, y + Math.cos((y + state.camera.y) * 0.01) * 4);
        ctx.stroke();
      }
    }

    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;

    ctx.fillStyle = "#343a3c";
    for (let i = startX; i <= endX; i += 1) {
      const sx = i * ROAD_GAP - ROAD_HALF - state.camera.x;
      ctx.fillRect(sx, 0, ROAD_WIDTH, viewHeight);
    }
    for (let i = startY; i <= endY; i += 1) {
      const sy = i * ROAD_GAP - ROAD_HALF - state.camera.y;
      ctx.fillRect(0, sy, viewWidth, ROAD_WIDTH);
    }

    ctx.fillStyle = "rgba(255,255,255,.025)";
    for (let i = startX; i <= endX; i += 1) {
      const cx = i * ROAD_GAP - state.camera.x;
      ctx.fillRect(cx - 60, 0, 18, viewHeight);
      ctx.fillRect(cx + 42, 0, 18, viewHeight);
    }
    for (let i = startY; i <= endY; i += 1) {
      const cy = i * ROAD_GAP - state.camera.y;
      ctx.fillRect(0, cy - 60, viewWidth, 18);
      ctx.fillRect(0, cy + 42, viewWidth, 18);
    }

    // Sidewalks exist between intersections, not across the vehicle junction.
    for (let i = startX; i <= endX; i += 1) {
      const left = i * ROAD_GAP - ROAD_HALF - 16 - state.camera.x;
      const right = i * ROAD_GAP + ROAD_HALF - state.camera.x;
      for (let gy = startY - 1; gy <= endY; gy += 1) {
        const y1 = gy * ROAD_GAP + ROAD_HALF - state.camera.y;
        const y2 = (gy + 1) * ROAD_GAP - ROAD_HALF - state.camera.y;
        if (y2 <= y1) continue;
        ctx.fillStyle = "#a9aaa4";
        ctx.fillRect(left, y1, 16, y2 - y1);
        ctx.fillRect(right, y1, 16, y2 - y1);
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(left, y1, 2, y2 - y1);
        ctx.fillRect(right + 14, y1, 2, y2 - y1);
      }
    }
    for (let i = startY; i <= endY; i += 1) {
      const top = i * ROAD_GAP - ROAD_HALF - 16 - state.camera.y;
      const bottom = i * ROAD_GAP + ROAD_HALF - state.camera.y;
      for (let gx = startX - 1; gx <= endX; gx += 1) {
        const x1 = gx * ROAD_GAP + ROAD_HALF - state.camera.x;
        const x2 = (gx + 1) * ROAD_GAP - ROAD_HALF - state.camera.x;
        if (x2 <= x1) continue;
        ctx.fillStyle = "#a9aaa4";
        ctx.fillRect(x1, top, x2 - x1, 16);
        ctx.fillRect(x1, bottom, x2 - x1, 16);
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(x1, top, x2 - x1, 2);
        ctx.fillRect(x1, bottom + 14, x2 - x1, 2);
      }
    }

    // Japanese-style two-way streets: one lane each direction, edge lines, and
    // center lines that stop before each intersection instead of running through it.
    ctx.strokeStyle = "rgba(239,241,237,.68)";
    ctx.lineWidth = 2;
    const edgeClearance = ROAD_HALF + 58;
    for (let i = startX; i <= endX; i += 1) {
      const sx = i * ROAD_GAP - state.camera.x;
      for (let gy = startY - 1; gy <= endY; gy += 1) {
        const sy1 = gy * ROAD_GAP + edgeClearance - state.camera.y;
        const sy2 = (gy + 1) * ROAD_GAP - edgeClearance - state.camera.y;
        if (sy2 <= sy1) continue;
        for (const edge of [-ROAD_HALF + 18, ROAD_HALF - 18]) {
          ctx.beginPath();
          ctx.moveTo(sx + edge, sy1);
          ctx.lineTo(sx + edge, sy2);
          ctx.stroke();
        }
      }
    }
    for (let i = startY; i <= endY; i += 1) {
      const sy = i * ROAD_GAP - state.camera.y;
      for (let gx = startX - 1; gx <= endX; gx += 1) {
        const sx1 = gx * ROAD_GAP + edgeClearance - state.camera.x;
        const sx2 = (gx + 1) * ROAD_GAP - edgeClearance - state.camera.x;
        if (sx2 <= sx1) continue;
        for (const edge of [-ROAD_HALF + 18, ROAD_HALF - 18]) {
          ctx.beginPath();
          ctx.moveTo(sx1, sy + edge);
          ctx.lineTo(sx2, sy + edge);
          ctx.stroke();
        }
      }
    }

    const intersectionClearance = ROAD_HALF + 66;
    for (let i = startX; i <= endX; i += 1) {
      const major = Math.abs(i) % 5 === 0;
      for (let gy = startY - 1; gy <= endY; gy += 1) {
        const y1 = gy * ROAD_GAP + intersectionClearance;
        const y2 = (gy + 1) * ROAD_GAP - intersectionClearance;
        if (y2 > y1) drawRoadCenterSegmentVertical(i * ROAD_GAP, y1, y2, major);
      }
    }
    for (let i = startY; i <= endY; i += 1) {
      const major = Math.abs(i) % 5 === 0;
      for (let gx = startX - 1; gx <= endX; gx += 1) {
        const x1 = gx * ROAD_GAP + intersectionClearance;
        const x2 = (gx + 1) * ROAD_GAP - intersectionClearance;
        if (x2 > x1) drawRoadCenterSegmentHorizontal(i * ROAD_GAP, x1, x2, major);
      }
    }

    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const wx = gx * ROAD_GAP;
        const wy = gy * ROAD_GAP;
        const sx = wx - state.camera.x;
        const sy = wy - state.camera.y;
        drawJapaneseIntersectionMarkings(sx, sy, wx, wy);
      }
    }

    if (state.visual.weather === "rain") {
      ctx.fillStyle = "rgba(113,148,159,.10)";
      for (let i = startX; i <= endX; i += 1) {
        const sx = i * ROAD_GAP - ROAD_HALF - state.camera.x;
        ctx.fillRect(sx, 0, ROAD_WIDTH, viewHeight);
      }
      for (let i = startY; i <= endY; i += 1) {
        const sy = i * ROAD_GAP - ROAD_HALF - state.camera.y;
        ctx.fillRect(0, sy, viewWidth, ROAD_WIDTH);
      }
      ctx.fillStyle = "rgba(221,232,232,.07)";
      for (let i = startX; i <= endX; i += 1) {
        const sx = i * ROAD_GAP - state.camera.x;
        ctx.fillRect(sx - 3, 0, 6, viewHeight);
      }
      for (let i = startY; i <= endY; i += 1) {
        const sy = i * ROAD_GAP - state.camera.y;
        ctx.fillRect(0, sy - 3, viewWidth, 6);
      }
    }

    ctx.fillStyle = "rgba(18,22,22,.36)";
    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        if (hash2(gx, gy, 733) < 0.43) continue;
        const sx = gx * ROAD_GAP + 128 - state.camera.x;
        const sy = gy * ROAD_GAP - 34 - state.camera.y;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 9, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (time.daylight < 0.26) {
      ctx.fillStyle = "rgba(248,224,165,.035)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
  }

  function drawTree(x, y, scale = 1) {
    const p = worldToScreen(x, y);
    if (p.x < -60 || p.y < -60 || p.x > viewWidth + 60 || p.y > viewHeight + 60) return;
    const time = visualTime();
    ctx.fillStyle = "rgba(16,25,19,.18)";
    ctx.beginPath();
    ctx.ellipse(p.x + time.shadowX * .3, p.y + 10 + time.shadowY * .2, 18 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6c5140";
    ctx.fillRect(p.x - 3 * scale, p.y - 2 * scale, 6 * scale, 17 * scale);
    ctx.fillStyle = "#3f6c4d";
    ctx.beginPath();
    ctx.arc(p.x - 8 * scale, p.y - 10 * scale, 13 * scale, 0, Math.PI * 2);
    ctx.arc(p.x + 7 * scale, p.y - 12 * scale, 15 * scale, 0, Math.PI * 2);
    ctx.arc(p.x, p.y - 22 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(143,185,129,.42)";
    ctx.beginPath();
    ctx.arc(p.x - 4 * scale, p.y - 20 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLamp(x, y) {
    const p = worldToScreen(x, y);
    if (p.x < -30 || p.y < -60 || p.x > viewWidth + 30 || p.y > viewHeight + 60) return;
    const time = visualTime();
    if (time.night > .45) {
      const glow = ctx.createRadialGradient(p.x, p.y - 29, 2, p.x, p.y - 29, 38);
      glow.addColorStop(0, "rgba(255,224,157,.28)");
      glow.addColorStop(1, "rgba(255,224,157,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 29, 38, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#343b3d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 8);
    ctx.lineTo(p.x, p.y - 28);
    ctx.lineTo(p.x + 9, p.y - 28);
    ctx.stroke();
    ctx.fillStyle = time.night > .45 ? "#ffd98a" : "#c5c8c4";
    ctx.fillRect(p.x + 6, p.y - 31, 9, 6);
  }

  function drawNeighborhoodGround() {
    const startGX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endGX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startGY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endGY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;

    for (let gx = startGX; gx <= endGX; gx += 1) {
      for (let gy = startGY; gy <= endGY; gy += 1) {
        const style = cityBlockStyle(gx, gy);
        if (style === "outer") continue;

        const x = gx * ROAD_GAP + ROAD_HALF + BLOCK_MARGIN - state.camera.x;
        const y = gy * ROAD_GAP + ROAD_HALF + BLOCK_MARGIN - state.camera.y;
        const w = ROAD_GAP - ROAD_WIDTH - BLOCK_MARGIN * 2;
        const h = w;

        if (style === "station") {
          ctx.fillStyle = "#b7b4aa";
          roundedRectPath(ctx, x + 6, y + 6, w - 12, h - 12, 10);
          ctx.fill();

          ctx.strokeStyle = "rgba(255,255,255,.19)";
          ctx.lineWidth = 1;
          for (let tx = x + 18; tx < x + w - 18; tx += 28) {
            ctx.beginPath();
            ctx.moveTo(tx, y + 12);
            ctx.lineTo(tx, y + h - 12);
            ctx.stroke();
          }
          for (let ty = y + 18; ty < y + h - 18; ty += 28) {
            ctx.beginPath();
            ctx.moveTo(x + 12, ty);
            ctx.lineTo(x + w - 12, ty);
            ctx.stroke();
          }

          // Compressed bus/taxi bays facing the arterial.
          ctx.strokeStyle = "rgba(239,241,237,.65)";
          ctx.lineWidth = 2;
          for (let n = 0; n < 4; n += 1) {
            const bx = x + 40 + n * 58;
            ctx.strokeRect(bx, y + h - 55, 45, 36);
          }
          ctx.fillStyle = "rgba(52,69,67,.58)";
          ctx.font = "700 10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("BUS", x + w - 54, y + h - 31);
          continue;
        }

        if (style === "arcade") {
          const laneW = 78;
          const laneX = x + w / 2 - laneW / 2;
          ctx.fillStyle = "#b9b5a8";
          roundedRectPath(ctx, laneX, y + 5, laneW, h - 10, 7);
          ctx.fill();
          ctx.fillStyle = "rgba(236,231,212,.23)";
          for (let ty = y + 14; ty < y + h - 12; ty += 24) {
            ctx.fillRect(laneX + 6, ty, laneW - 12, 8);
          }
          ctx.strokeStyle = "rgba(73,81,78,.34)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(laneX + 8, y + 8);
          ctx.lineTo(laneX + 8, y + h - 8);
          ctx.moveTo(laneX + laneW - 8, y + 8);
          ctx.lineTo(laneX + laneW - 8, y + h - 8);
          ctx.stroke();
          continue;
        }

        if (style === "alley") {
          const laneW = 54;
          const cx = x + w / 2;
          const bendY = y + h * .58;
          ctx.fillStyle = "#777a76";
          roundedRectPath(ctx, cx - laneW / 2, y + 8, laneW, h * .62, 5);
          ctx.fill();
          roundedRectPath(ctx, cx - laneW / 2, bendY - laneW / 2, w * .42, laneW, 5);
          ctx.fill();

          ctx.fillStyle = "rgba(255,255,255,.07)";
          for (let ty = y + 22; ty < bendY - 16; ty += 26) {
            ctx.fillRect(cx - 3, ty, 6, 10);
          }
          ctx.fillStyle = "rgba(207,88,67,.14)";
          ctx.fillRect(cx + 12, y + 20, 8, h * .45);
          continue;
        }

        if (style === "residential") {
          const laneW = 38;
          const offset = hash2(gx, gy, 1410) > .5 ? w * .38 : w * .58;
          ctx.fillStyle = "#8c8f89";
          roundedRectPath(ctx, x + offset - laneW / 2, y + 5, laneW, h - 10, 6);
          ctx.fill();

          ctx.strokeStyle = "rgba(215,219,211,.24)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + offset - laneW / 2 + 4, y + 8);
          ctx.lineTo(x + offset - laneW / 2 + 4, y + h - 8);
          ctx.moveTo(x + offset + laneW / 2 - 4, y + 8);
          ctx.lineTo(x + offset + laneW / 2 - 4, y + h - 8);
          ctx.stroke();

          // Small concrete parking pads and garden strips.
          ctx.fillStyle = "#aaa9a1";
          ctx.fillRect(x + 14, y + 18, 52, 38);
          ctx.fillRect(x + w - 68, y + h - 58, 54, 40);
          ctx.fillStyle = "#718b68";
          ctx.fillRect(x + 18, y + h - 34, 62, 15);
          continue;
        }

        if (style === "green") {
          ctx.fillStyle = "#708f67";
          roundedRectPath(ctx, x + 6, y + 6, w - 12, h - 12, 16);
          ctx.fill();

          ctx.strokeStyle = "#c0b895";
          ctx.lineWidth = 20;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x + 30, y + h * .72);
          ctx.bezierCurveTo(x + w * .28, y + h * .3, x + w * .66, y + h * .78, x + w - 28, y + h * .3);
          ctx.stroke();

          if ((gx + gy) % 2 === 0) {
            ctx.fillStyle = "#557987";
            ctx.beginPath();
            ctx.ellipse(x + w * .72, y + h * .68, 45, 28, -.25, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }

        if (style === "mixed-core") {
          ctx.fillStyle = "rgba(167,164,153,.22)";
          ctx.fillRect(x + 8, y + h - 46, w - 16, 34);
          for (let n = 0; n < 6; n += 1) {
            ctx.fillStyle = n % 2 ? "rgba(192,183,154,.12)" : "rgba(255,255,255,.055)";
            ctx.fillRect(x + 18 + n * 54, y + h - 42, 35, 26);
          }

          // Short diagonal pedestrian cut-throughs break the rigid grid without
          // becoming part of the car navigation graph.
          if (hash2(gx, gy, 1440) > .48) {
            ctx.strokeStyle = "#93958e";
            ctx.lineWidth = 30;
            ctx.lineCap = "round";
            ctx.beginPath();
            if ((gx + gy) % 2 === 0) {
              ctx.moveTo(x + 34, y + h * .25);
              ctx.lineTo(x + w - 34, y + h * .72);
            } else {
              ctx.moveTo(x + w - 34, y + h * .22);
              ctx.lineTo(x + 34, y + h * .76);
            }
            ctx.stroke();
            ctx.strokeStyle = "rgba(240,240,232,.18)";
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    }
  }

  function drawCityLandmarks() {
    const station = worldToScreen(8 * ROAD_GAP + ROAD_GAP / 2, 5 * ROAD_GAP + ROAD_GAP / 2);
    if (station.x > -400 && station.y > -400 && station.x < viewWidth + 400 && station.y < viewHeight + 400) {
      // Station entrance / canopy.
      ctx.fillStyle = "#4a5554";
      roundedRectPath(ctx, station.x - 92, station.y - 30, 184, 42, 7);
      ctx.fill();
      ctx.fillStyle = "#dfe5df";
      ctx.fillRect(station.x - 82, station.y - 20, 164, 20);
      ctx.fillStyle = "#384340";
      ctx.font = "800 16px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉駅", station.x, station.y - 5);
      ctx.fillStyle = "#5a6864";
      ctx.fillRect(station.x - 76, station.y + 11, 10, 42);
      ctx.fillRect(station.x + 66, station.y + 11, 10, 42);

      // Taxi rank.
      ctx.fillStyle = "#d6d9d2";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.fillText("TAXI", station.x + 128, station.y + 78);
    }

    const arcade = worldToScreen(7 * ROAD_GAP + ROAD_GAP / 2, 6 * ROAD_GAP + ROAD_HALF + BLOCK_MARGIN + 12);
    if (arcade.x > -250 && arcade.y > -250 && arcade.x < viewWidth + 250 && arcade.y < viewHeight + 250) {
      ctx.strokeStyle = "#5b6661";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(arcade.x - 48, arcade.y + 26);
      ctx.lineTo(arcade.x - 48, arcade.y - 24);
      ctx.lineTo(arcade.x + 48, arcade.y - 24);
      ctx.lineTo(arcade.x + 48, arcade.y + 26);
      ctx.stroke();
      ctx.fillStyle = "#d9c77b";
      roundedRectPath(ctx, arcade.x - 42, arcade.y - 38, 84, 21, 5);
      ctx.fill();
      ctx.fillStyle = "#493f2f";
      ctx.font = "800 10px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉サンモール", arcade.x, arcade.y - 24);
    }

    const shrine = worldToScreen(5 * ROAD_GAP + ROAD_GAP / 2, 9 * ROAD_GAP + ROAD_GAP / 2);
    if (shrine.x > -220 && shrine.y > -220 && shrine.x < viewWidth + 220 && shrine.y < viewHeight + 220) {
      ctx.strokeStyle = "#a64f43";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(shrine.x - 23, shrine.y + 18);
      ctx.lineTo(shrine.x - 23, shrine.y - 26);
      ctx.moveTo(shrine.x + 23, shrine.y + 18);
      ctx.lineTo(shrine.x + 23, shrine.y - 26);
      ctx.moveTo(shrine.x - 35, shrine.y - 22);
      ctx.lineTo(shrine.x + 35, shrine.y - 22);
      ctx.moveTo(shrine.x - 29, shrine.y - 31);
      ctx.lineTo(shrine.x + 29, shrine.y - 31);
      ctx.stroke();
      ctx.fillStyle = "#5f695e";
      ctx.font = "700 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("若葉神社", shrine.x, shrine.y + 34);
    }

    const alley = worldToScreen(10 * ROAD_GAP + ROAD_GAP / 2, 6 * ROAD_GAP + ROAD_GAP / 2);
    if (alley.x > -220 && alley.y > -220 && alley.x < viewWidth + 220 && alley.y < viewHeight + 220) {
      ctx.fillStyle = "rgba(164,69,54,.84)";
      for (let n = -2; n <= 2; n += 1) {
        ctx.beginPath();
        ctx.arc(alley.x + n * 20, alley.y - 58 + Math.abs(n) * 3, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(74,62,54,.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(alley.x - 52, alley.y - 61);
      ctx.lineTo(alley.x + 52, alley.y - 61);
      ctx.stroke();
    }
  }

  function drawStreetProps() {
    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;
    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const baseX = gx * ROAD_GAP;
        const baseY = gy * ROAD_GAP;
        const style = cityBlockStyle(gx, gy);
        const seed = hash2(gx, gy, 810);

        const center = worldToScreen(baseX + ROAD_GAP / 2, baseY + ROAD_GAP / 2);
        if (style === "station") {
          // Bicycle parking and bollards around the station plaza.
          ctx.strokeStyle = "#59635f";
          ctx.lineWidth = 1.5;
          for (let n = -3; n <= 3; n += 1) {
            const bx = center.x + n * 18;
            const by = center.y + 132;
            ctx.beginPath();
            ctx.arc(bx - 4, by, 5, 0, Math.PI * 2);
            ctx.arc(bx + 5, by, 5, 0, Math.PI * 2);
            ctx.moveTo(bx - 4, by);
            ctx.lineTo(bx + 1, by - 7);
            ctx.lineTo(bx + 5, by);
            ctx.stroke();
          }
          ctx.fillStyle = "#4f5b57";
          for (let n = -3; n <= 3; n += 1) {
            ctx.fillRect(center.x + n * 28 - 2, center.y - 132, 4, 15);
          }
        } else if (style === "arcade") {
          // Dense projecting shop signs and alternating awnings.
          for (let n = -2; n <= 2; n += 1) {
            const sy = center.y + n * 52;
            ctx.fillStyle = n % 2 ? "#a76055" : "#547b76";
            ctx.fillRect(center.x - 92, sy - 11, 24, 15);
            ctx.fillStyle = n % 2 ? "#6f8299" : "#b58b55";
            ctx.fillRect(center.x + 68, sy - 7, 24, 15);
            ctx.fillStyle = "rgba(239,226,195,.72)";
            ctx.fillRect(center.x - 65, sy + 13, 130, 5);
          }
        } else if (style === "alley") {
          // Lantern strings and standing signs make the narrow dining alleys read at night.
          ctx.strokeStyle = "rgba(71,61,54,.75)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(center.x - 48, center.y - 92);
          ctx.lineTo(center.x + 48, center.y - 92);
          ctx.stroke();
          for (let n = -2; n <= 2; n += 1) {
            ctx.fillStyle = "#b85c4f";
            ctx.beginPath();
            ctx.arc(center.x + n * 21, center.y - 88 + Math.abs(n) * 2, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#433c36";
          ctx.fillRect(center.x + 35, center.y + 54, 18, 27);
          ctx.fillStyle = "#d7c49a";
          ctx.fillRect(center.x + 38, center.y + 58, 12, 16);
        } else if (style === "residential") {
          // Hedges, low fences and utility clutter instead of commercial furniture.
          ctx.fillStyle = "#607c5b";
          ctx.fillRect(center.x - 126, center.y + 102, 72, 9);
          ctx.fillRect(center.x + 54, center.y - 108, 68, 9);
          ctx.strokeStyle = "#8d918a";
          ctx.lineWidth = 2;
          for (let n = 0; n < 5; n += 1) {
            ctx.beginPath();
            ctx.moveTo(center.x - 122 + n * 16, center.y + 88);
            ctx.lineTo(center.x - 122 + n * 16, center.y + 106);
            ctx.stroke();
          }
        } else if (style === "green") {
          drawTree(baseX + ROAD_GAP * .36, baseY + ROAD_GAP * .38, 1.05);
          drawTree(baseX + ROAD_GAP * .68, baseY + ROAD_GAP * .66, 1.1);
        }
        if (seed > .18) {
          drawTree(baseX + ROAD_HALF + 35, baseY + 145, .82);
          drawTree(baseX + 145, baseY + ROAD_HALF + 35, .78);
        }
        if (seed > .36) {
          drawLamp(baseX + ROAD_HALF + 23, baseY + 240);
          drawLamp(baseX + 240, baseY + ROAD_HALF + 23);
        }
        if (seed > .58) {
          const poleA = worldToScreen(baseX + ROAD_HALF + 30, baseY + 330);
          const poleB = worldToScreen(baseX + 330, baseY + ROAD_HALF + 30);
          ctx.strokeStyle = "#555c59";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(poleA.x, poleA.y + 15);
          ctx.lineTo(poleA.x, poleA.y - 24);
          ctx.moveTo(poleB.x + 15, poleB.y);
          ctx.lineTo(poleB.x - 24, poleB.y);
          ctx.stroke();
          ctx.strokeStyle = "#3e4543";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(poleA.x - 9, poleA.y - 18);
          ctx.lineTo(poleA.x + 9, poleA.y - 18);
          ctx.moveTo(poleB.x - 18, poleB.y - 9);
          ctx.lineTo(poleB.x - 18, poleB.y + 9);
          ctx.stroke();
        }
        const p = worldToScreen(baseX + ROAD_HALF + 40, baseY + ROAD_HALF + 54);
        if (p.x > -40 && p.y > -40 && p.x < viewWidth + 40 && p.y < viewHeight + 40) {
          if (seed > .72) {
            ctx.fillStyle = "#315c70";
            ctx.fillRect(p.x, p.y, 12, 23);
            ctx.fillStyle = "#cde0e6";
            ctx.fillRect(p.x + 2, p.y + 3, 8, 5);
            ctx.fillStyle = "#e3b65d";
            ctx.fillRect(p.x + 3, p.y + 12, 6, 2);
          } else if (seed < .2) {
            ctx.fillStyle = "#5d4c3c";
            ctx.fillRect(p.x - 12, p.y + 10, 28, 4);
            ctx.fillRect(p.x - 9, p.y + 14, 3, 7);
            ctx.fillRect(p.x + 10, p.y + 14, 3, 7);
          }
        }
      }
    }
  }

  function drawRoute() {
    if (!state.player.inVehicle || !state.drive.route.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(89,190,255,.32)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(personalCar.x - state.camera.x, personalCar.y - state.camera.y);
    for (let i = state.drive.routeIndex; i < state.drive.route.length; i += 1) {
      const point = state.drive.route[i];
      ctx.lineTo(point.x - state.camera.x, point.y - state.camera.y);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(111,208,255,.9)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.stroke();
    ctx.restore();
  }

  function drawSignalHead(x, y, orientation, stateName) {
    const horizontal = orientation === "h";
    const w = horizontal ? 34 : 12;
    const h = horizontal ? 12 : 34;
    ctx.fillStyle = "#262b2a";
    roundedRectPath(ctx, x - w / 2, y - h / 2, w, h, 4);
    ctx.fill();

    const colors = horizontal
      ? [["green", "#3c6651"], ["yellow", "#6a6034"], ["red", "#663b39"]]
      : [["red", "#663b39"], ["yellow", "#6a6034"], ["green", "#3c6651"]];
    const positions = horizontal ? [-10, 0, 10] : [-10, 0, 10];
    for (let i = 0; i < 3; i += 1) {
      const [name, dim] = colors[i];
      ctx.fillStyle = name === stateName
        ? (name === "green" ? "#58c57a" : name === "yellow" ? "#efc74f" : "#e65c55")
        : dim;
      ctx.beginPath();
      ctx.arc(horizontal ? x + positions[i] : x, horizontal ? y : y + positions[i], 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPedestrianSignal(x, y, canWalk) {
    ctx.fillStyle = "#29302e";
    roundedRectPath(ctx, x - 5, y - 8, 10, 16, 2);
    ctx.fill();
    ctx.fillStyle = canWalk ? "#50bd70" : "#67413e";
    ctx.beginPath();
    ctx.arc(x, y + 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = canWalk ? "#38543f" : "#e35b55";
    ctx.beginPath();
    ctx.arc(x, y - 4, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTrafficLights() {
    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;

    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const wx = gx * ROAD_GAP;
        const wy = gy * ROAD_GAP;
        const sx = wx - state.camera.x;
        const sy = wy - state.camera.y;
        const hState = signalStateAt(wx, wy, "h");
        const vState = signalStateAt(wx, wy, "v");
        const pole = ROAD_HALF + 30;

        ctx.strokeStyle = "#4d5552";
        ctx.lineWidth = 3;

        // North approach: pole on sidewalk, arm over southbound lane.
        ctx.beginPath();
        ctx.moveTo(sx + ROAD_HALF + 11, sy - pole - 18);
        ctx.lineTo(sx + ROAD_HALF + 11, sy - pole);
        ctx.lineTo(sx + LANE_OFFSET, sy - pole);
        ctx.stroke();
        drawSignalHead(sx + LANE_OFFSET, sy - pole, "h", vState);

        // South approach.
        ctx.beginPath();
        ctx.moveTo(sx - ROAD_HALF - 11, sy + pole + 18);
        ctx.lineTo(sx - ROAD_HALF - 11, sy + pole);
        ctx.lineTo(sx - LANE_OFFSET, sy + pole);
        ctx.stroke();
        drawSignalHead(sx - LANE_OFFSET, sy + pole, "h", vState);

        // West approach.
        ctx.beginPath();
        ctx.moveTo(sx - pole - 18, sy - ROAD_HALF - 11);
        ctx.lineTo(sx - pole, sy - ROAD_HALF - 11);
        ctx.lineTo(sx - pole, sy - LANE_OFFSET);
        ctx.stroke();
        drawSignalHead(sx - pole, sy - LANE_OFFSET, "v", hState);

        // East approach.
        ctx.beginPath();
        ctx.moveTo(sx + pole + 18, sy + ROAD_HALF + 11);
        ctx.lineTo(sx + pole, sy + ROAD_HALF + 11);
        ctx.lineTo(sx + pole, sy + LANE_OFFSET);
        ctx.stroke();
        drawSignalHead(sx + pole, sy + LANE_OFFSET, "v", hState);

        // Separate pedestrian signals at the four corners.
        const pedV = vState === "red";
        const pedH = hState === "red";
        drawPedestrianSignal(sx - ROAD_HALF - 18, sy - ROAD_HALF - 18, pedV);
        drawPedestrianSignal(sx + ROAD_HALF + 18, sy + ROAD_HALF + 18, pedV);
        drawPedestrianSignal(sx + ROAD_HALF + 18, sy - ROAD_HALF - 18, pedH);
        drawPedestrianSignal(sx - ROAD_HALF - 18, sy + ROAD_HALF + 18, pedH);
      }
    }
  }

  function drawBuildings() {
    const time = visualTime();
    const visible = buildings
      .filter((building) => visibleRect(building, 120))
      .sort((a, b) => (a.y + a.h) - (b.y + b.h));

    for (const building of visible) {
      const x = building.x - state.camera.x;
      const y = building.y - state.camera.y;
      const palette = VISUAL_PALETTES[building.palette % VISUAL_PALETTES.length];
      const baseElevation =
        building.kind === "tower" ? 34 :
        building.kind === "low" ? 17 :
        22;
      const elevation = clamp(baseElevation + building.floors * 2.2, 19, 48);
      const roofDx = -elevation * BUILDING_DEPTH_X;
      const roofDy = -elevation;
      const rx = x + roofDx;
      const ry = y + roofDy;

      ctx.fillStyle = "rgba(20,25,23," + (0.16 + time.night * .04).toFixed(2) + ")";
      roundedRectPath(
        ctx,
        x + time.shadowX * .32,
        y + time.shadowY * .24,
        building.w,
        building.h,
        5
      );
      ctx.fill();

      ctx.fillStyle = palette.wall;
      ctx.beginPath();
      ctx.moveTo(rx, ry + building.h);
      ctx.lineTo(rx + building.w, ry + building.h);
      ctx.lineTo(x + building.w, y + building.h);
      ctx.lineTo(x, y + building.h);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(42,47,45,.28)";
      ctx.beginPath();
      ctx.moveTo(rx + building.w, ry);
      ctx.lineTo(rx + building.w, ry + building.h);
      ctx.lineTo(x + building.w, y + building.h);
      ctx.lineTo(x + building.w, y);
      ctx.closePath();
      ctx.fill();

      const facadeTop = ry + building.h + 5;
      const facadeBottom = y + building.h - 5;
      const facadeHeight = Math.max(8, facadeBottom - facadeTop);
      const windowCols = Math.max(2, Math.floor((building.w - 34) / 42));
      const windowW = Math.min(18, (building.w - 28) / windowCols - 8);
      for (let col = 0; col < windowCols; col += 1) {
        const denominator = Math.max(1, windowCols - 1);
        const wx = rx + 19 + col * ((building.w - 38) / denominator);
        const lit = time.night > .45 && hash2(Math.floor(building.x) + col, Math.floor(building.y), 911) > .5;
        ctx.fillStyle = lit ? "#dcb96c" : palette.glass;
        ctx.fillRect(wx - windowW / 2, facadeTop + Math.min(4, facadeHeight * .15), windowW, Math.min(10, facadeHeight * .48));
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(wx - windowW / 2 + 2, facadeTop + Math.min(5, facadeHeight * .15), 2, Math.min(8, facadeHeight * .4));
      }

      const doorW = Math.min(34, building.w * .14);
      const doorH = Math.min(22, elevation * .72);
      ctx.fillStyle = "#35403e";
      ctx.fillRect(x + building.w * .5 - doorW / 2, y + building.h - doorH, doorW, doorH);
      ctx.fillStyle = "rgba(177,205,211,.5)";
      ctx.fillRect(x + building.w * .5 - doorW * .36, y + building.h - doorH + 3, doorW * .72, 7);

      ctx.fillStyle = palette.roof;
      roundedRectPath(ctx, rx, ry, building.w, building.h, 5);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.09)";
      ctx.lineWidth = 1;
      roundedRectPath(ctx, rx + 5, ry + 5, building.w - 10, building.h - 10, 4);
      ctx.stroke();

      if (building.facadeBand) {
        ctx.fillStyle = palette.trim;
        ctx.fillRect(rx + 8, ry + building.h - 12, building.w - 16, 5);
      }

      if (building.roofDetail === 0) {
        ctx.fillStyle = "#747d79";
        roundedRectPath(ctx, rx + building.w - 48, ry + 14, 26, 16, 3);
        ctx.fill();
        ctx.strokeStyle = "#505956";
        ctx.stroke();
      } else if (building.roofDetail === 1) {
        ctx.fillStyle = "#606a66";
        ctx.beginPath();
        ctx.arc(rx + building.w - 34, ry + 22, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.beginPath();
        ctx.arc(rx + building.w - 37, ry + 19, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (building.roofDetail === 2) {
        ctx.strokeStyle = "#56605d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx + building.w - 42, ry + 31);
        ctx.lineTo(rx + building.w - 42, ry + 10);
        ctx.lineTo(rx + building.w - 26, ry + 10);
        ctx.stroke();
      }
    }
  }

  function drawFacilityBuilding(p, w, h, wall, roof, glass) {
    const time = visualTime();
    const elevation = 25;
    const roofDx = -elevation * BUILDING_DEPTH_X;
    const roofDy = -elevation;
    const left = p.x - w / 2;
    const top = p.y - h / 2;
    const rx = left + roofDx;
    const ry = top + roofDy;

    ctx.fillStyle = "rgba(20,26,24,.2)";
    roundedRectPath(ctx, left + time.shadowX * .32, top + time.shadowY * .24, w, h, 8);
    ctx.fill();

    ctx.fillStyle = wall;
    ctx.beginPath();
    ctx.moveTo(rx, ry + h);
    ctx.lineTo(rx + w, ry + h);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left, top + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(40,48,45,.28)";
    ctx.beginPath();
    ctx.moveTo(rx + w, ry);
    ctx.lineTo(rx + w, ry + h);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left + w, top);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = roof;
    roundedRectPath(ctx, rx, ry, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.1)";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, rx + 6, ry + 6, w - 12, h - 12, 6);
    ctx.stroke();

    ctx.fillStyle = glass;
    ctx.fillRect(p.x - w * .34, top + h - 20, w * .68, 9);
    ctx.fillStyle = "#303a37";
    ctx.fillRect(p.x - 20, top + h - 22, 40, 22);
  }

  function drawPlace(place) {
    const p = worldToScreen(place.x, place.y);
    if (p.x < -300 || p.y < -300 || p.x > viewWidth + 300 || p.y > viewHeight + 300) return;

    if (place.id === "park") {
      ctx.fillStyle = "#668f63";
      roundedRectPath(ctx, p.x - 190, p.y - 190, 380, 380, 18);
      ctx.fill();
      ctx.fillStyle = "#b8b08d";
      roundedRectPath(ctx, p.x - 14, p.y - 170, 28, 340, 8);
      ctx.fill();
      roundedRectPath(ctx, p.x - 170, p.y - 14, 340, 28, 8);
      ctx.fill();
      ctx.fillStyle = "#6f9a69";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#6d8e92";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 10; i += 1) {
        const angle = i * Math.PI * 2 / 10;
        drawTree(place.x + Math.cos(angle) * 135, place.y + Math.sin(angle) * 135, .95);
      }
    } else if (place.id === "home") {
      drawFacilityBuilding(p, 300, 270, "#d0b68f", "#6d655c", "#8fa8ad");
      ctx.fillStyle = "#a07e5b";
      ctx.fillRect(p.x - 118, p.y - 70, 236, 12);
      ctx.fillStyle = "#f0e1c2";
      ctx.fillRect(p.x - 95, p.y - 38, 44, 26);
      ctx.fillRect(p.x + 51, p.y - 38, 44, 26);
      ctx.fillStyle = "#6f8a68";
      ctx.beginPath(); ctx.arc(p.x - 125, p.y + 90, 17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x + 125, p.y + 90, 17, 0, Math.PI * 2); ctx.fill();
    } else if (place.id === "cafe") {
      drawFacilityBuilding(p, 300, 270, "#b77a64", "#604f48", "#89a5a9");
      ctx.fillStyle = "#f1d4b0";
      ctx.fillRect(p.x - 112, p.y - 18, 224, 20);
      for (let i = -5; i <= 5; i += 1) {
        ctx.fillStyle = i % 2 ? "#ad5c54" : "#eee1ca";
        ctx.fillRect(p.x + i * 20 - 10, p.y + 3, 20, 25);
      }
      ctx.fillStyle = "#352c29";
      ctx.font = "700 17px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("LUNE", p.x, p.y - 35);
    } else if (place.id === "store") {
      drawFacilityBuilding(p, 320, 260, "#6f9a82", "#455e55", "#a8c3c4");
      ctx.fillStyle = "#e7ede5";
      ctx.fillRect(p.x - 125, p.y - 55, 250, 32);
      ctx.fillStyle = "#487660";
      ctx.font = "800 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("MARCHÉ", p.x, p.y - 33);
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      for (let i = -2; i <= 2; i += 1) {
        ctx.strokeRect(p.x + i * 45 - 16, p.y + 106, 32, 52);
      }
    } else if (place.id === "gym") {
      drawFacilityBuilding(p, 305, 265, "#718ead", "#465b70", "#8faebb");
      ctx.fillStyle = "#e3ebee";
      ctx.fillRect(p.x - 118, p.y - 54, 236, 30);
      ctx.fillStyle = "#49657f";
      ctx.font = "800 16px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("CITY GYM", p.x, p.y - 33);
      ctx.strokeStyle = "#d7e0e3";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x - 28, p.y + 18); ctx.lineTo(p.x + 28, p.y + 18);
      ctx.moveTo(p.x - 35, p.y + 10); ctx.lineTo(p.x - 35, p.y + 26);
      ctx.moveTo(p.x + 35, p.y + 10); ctx.lineTo(p.x + 35, p.y + 26);
      ctx.stroke();
    } else if (place.id === "library") {
      drawFacilityBuilding(p, 310, 275, "#9d91b4", "#5d5868", "#9eb2bb");
      ctx.fillStyle = "#e3dced";
      ctx.fillRect(p.x - 125, p.y - 62, 250, 28);
      ctx.fillStyle = "#5e566c";
      ctx.font = "700 14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("CITY LIBRARY", p.x, p.y - 43);
      ctx.fillStyle = "#ddd9cf";
      for (let i = -2; i <= 2; i += 1) ctx.fillRect(p.x + i * 47 - 5, p.y + 12, 10, 79);
    }

    ctx.fillStyle = "rgba(18,24,21,.76)";
    roundedRectPath(ctx, p.x - 72, p.y - 179, 144, 24, 8);
    ctx.fill();
    ctx.fillStyle = "#f5f7f5";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(place.name, p.x, p.y - 163);

    ctx.fillStyle = "#f7f8f7";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#26312b";
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.fillText(place.symbol, p.x, p.y + 4);
  }

  function drawPerson(x, y, dir, shirt, pants, hair, skin, phase, scale = 1) {
    const p = worldToScreen(x, y);
    if (p.x < -45 || p.y < -55 || p.x > viewWidth + 45 || p.y > viewHeight + 55) return;
    const moving = Math.sin(phase);
    const fx = Math.cos(dir);
    const fy = Math.sin(dir);
    const sx = -fy;
    const sy = fx;
    const leg = moving * 4.5 * scale;
    const baseY = p.y + 9 * scale;
    const hipY = p.y + 2 * scale;
    const shoulderY = p.y - 9 * scale;
    const headY = p.y - 20 * scale;

    ctx.fillStyle = "rgba(18,24,22,.2)";
    ctx.beginPath();
    ctx.ellipse(p.x + 2, baseY + 4, 9 * scale, 4 * scale, dir, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = pants;
    ctx.lineWidth = 4 * scale;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x - sx * 3, hipY);
    ctx.lineTo(p.x - sx * 3 + fx * leg, baseY + fy * leg);
    ctx.moveTo(p.x + sx * 3, hipY);
    ctx.lineTo(p.x + sx * 3 - fx * leg, baseY - fy * leg);
    ctx.stroke();

    ctx.strokeStyle = shirt;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(p.x - sx * 7, shoulderY + 4);
    ctx.lineTo(p.x - sx * 10 - fx * leg * .5, p.y + fy * leg * .35);
    ctx.moveTo(p.x + sx * 7, shoulderY + 4);
    ctx.lineTo(p.x + sx * 10 + fx * leg * .5, p.y - fy * leg * .35);
    ctx.stroke();

    ctx.fillStyle = shirt;
    roundedRectPath(ctx, p.x - 7 * scale, shoulderY, 14 * scale, 16 * scale, 4 * scale);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.11)";
    ctx.fillRect(p.x - 5 * scale, shoulderY + 2 * scale, 3 * scale, 10 * scale);

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(p.x, headY, 7 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(p.x - fx * 1.4, headY - 3 * scale, 7 * scale, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  function drawNpc(npc) {
    drawPerson(npc.x, npc.y, -Math.PI / 2, npc.color, "#394248", "#3c2d25", "#e7b28f", performance.now() * .004 + npc.x * .01, 1.05);
    const p = worldToScreen(npc.x, npc.y);
    if (p.x < -40 || p.y < -40 || p.x > viewWidth + 40 || p.y > viewHeight + 40) return;
    ctx.fillStyle = "rgba(12,18,15,.76)";
    roundedRectPath(ctx, p.x - 27, p.y - 33, 54, 17, 6);
    ctx.fill();
    ctx.fillStyle = "#f4f6f5";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(npc.name, p.x, p.y - 21);
  }

  function drawPedestrians() {
    for (const ped of pedestrians) {
      drawPerson(ped.x, ped.y, ped.dir, ped.color, ped.pants, ped.hair, ped.skin, ped.phase, .92);
    }
  }

  function drawCar(car, owned = false) {
    const p = worldToScreen(car.x, car.y);
    if (p.x < -110 || p.y < -110 || p.x > viewWidth + 110 || p.y > viewHeight + 110) return;
    const type = car.type || (owned ? "sedan" : "compact");
    const dims = type === "compact" ? [66, 36] : type === "suv" ? [80, 43] : type === "van" ? [82, 42] : [76, 39];
    const length = dims[0];
    const width = dims[1];
    const lift = type === "suv" || type === "van" ? 5 : 4;
    const braking = owned
      ? (state.player.inVehicle && (touch.driveBrake || keys.has("s") || keys.has("arrowdown") || keys.has(" ")))
      : Boolean(car.brakeGlow > .15);

    ctx.save();
    ctx.translate(p.x + 3, p.y + 6);
    ctx.rotate(car.angle);
    ctx.fillStyle = "rgba(10,15,14,.24)";
    roundedRectPath(ctx, -length / 2, -width / 2, length, width, 10);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y - lift);
    ctx.rotate(car.angle);

    const time = visualTime();
    if (time.night > .4) {
      const beam = ctx.createLinearGradient(length * .25, 0, length * 1.7, 0);
      beam.addColorStop(0, "rgba(255,240,184," + (.13 * time.night).toFixed(2) + ")");
      beam.addColorStop(1, "rgba(255,240,184,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(length / 2 - 3, -width * .3);
      ctx.lineTo(length * 1.7, -width * .75);
      ctx.lineTo(length * 1.7, width * .75);
      ctx.lineTo(length / 2 - 3, width * .3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#252b2b";
    roundedRectPath(ctx, -length / 2, -width / 2 + 4, length, width, type === "van" ? 7 : 11);
    ctx.fill();

    ctx.fillStyle = "#15191a";
    ctx.fillRect(-length * .31, -width / 2 - 3, 14, 5);
    ctx.fillRect(length * .13, -width / 2 - 3, 14, 5);
    ctx.fillRect(-length * .31, width / 2 - 2, 14, 5);
    ctx.fillRect(length * .13, width / 2 - 2, 14, 5);

    ctx.fillStyle = car.color;
    roundedRectPath(ctx, -length / 2, -width / 2, length, width - 4, type === "van" ? 7 : 11);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.17)";
    roundedRectPath(ctx, -length / 2 + 5, -width / 2 + 4, length - 10, 7, 4);
    ctx.fill();

    const cabinStart = type === "van" ? -length * .18 : -length * .12;
    const cabinLength = type === "compact" ? length * .46 : length * .42;
    ctx.save();
    ctx.translate(0, -2.5);
    ctx.fillStyle = "#26363b";
    roundedRectPath(ctx, cabinStart, -width * .36, cabinLength, width * .68, 6);
    ctx.fill();
    ctx.fillStyle = "#91adb5";
    roundedRectPath(ctx, cabinStart + 3, -width * .3, cabinLength * .43, width * .55, 3);
    ctx.fill();
    ctx.fillStyle = "#7899a3";
    roundedRectPath(ctx, cabinStart + cabinLength * .52, -width * .3, cabinLength * .41, width * .55, 3);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#eee6c5";
    ctx.fillRect(length / 2 - 7, -width * .32, 5, 8);
    ctx.fillRect(length / 2 - 7, width * .32 - 10, 5, 8);
    ctx.fillStyle = braking ? "#ff4d44" : "#a84843";
    ctx.fillRect(-length / 2 + 2, -width * .32, 5, 8);
    ctx.fillRect(-length / 2 + 2, width * .32 - 10, 5, 8);

    if (braking) {
      ctx.fillStyle = "rgba(255,72,58,.15)";
      ctx.fillRect(-length / 2 - 12, -width / 2, 14, width - 4);
    }

    if (owned) {
      ctx.strokeStyle = "rgba(233,244,249,.82)";
      ctx.lineWidth = 1.5;
      roundedRectPath(ctx, -length / 2 - 3, -width / 2 - 3, length + 6, width + 2, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (state.player.inVehicle) return;
    const dir = Math.atan2(state.player.facingY, state.player.facingX);
    const moving = keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d") || Math.abs(touch.x) > .08 || Math.abs(touch.y) > .08;
    const phase = moving ? performance.now() * .009 : 0;
    drawPerson(state.player.x, state.player.y, dir, "#405c50", "#313b42", "#332a24", "#edbea0", phase, 1.12);
  }

  function drawStreetLightsGlow() {
    const time = visualTime();
    if (time.night < .35) return;
    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        if (hash2(gx, gy, 810) <= .36) continue;
        const pts = [
          [gx * ROAD_GAP + ROAD_HALF + 23, gy * ROAD_GAP + 240],
          [gx * ROAD_GAP + 240, gy * ROAD_GAP + ROAD_HALF + 23]
        ];
        for (const [wx, wy] of pts) {
          const p = worldToScreen(wx, wy);
          const glow = ctx.createRadialGradient(p.x, p.y - 24, 1, p.x, p.y - 24, 54);
          glow.addColorStop(0, "rgba(255,220,145," + (0.22 * time.night).toFixed(2) + ")");
          glow.addColorStop(1, "rgba(255,220,145,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y - 24, 54, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawNightOverlay() {
    const time = visualTime();
    const rain = state.visual.weather === "rain" ? .06 : 0;
    const cloud = state.visual.weather === "cloudy" ? .08 : 0;
    const alpha = clamp(time.night * .48 + rain + cloud, 0, .56);
    if (alpha > .01) {
      ctx.fillStyle = "rgba(12,19,31," + alpha.toFixed(3) + ")";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
    }
    if (time.daylight > .2 && time.daylight < .55) {
      const warm = Math.abs(state.minute - 18 * 60) < 160 || Math.abs(state.minute - 6 * 60) < 120;
      if (warm) {
        ctx.fillStyle = "rgba(236,167,104,.045)";
        ctx.fillRect(0, 0, viewWidth, viewHeight);
      }
    }
  }

  function drawWeather() {
    const weather = state.visual.weather;
    if (weather === "clear") return;
    if (weather === "cloudy") {
      ctx.fillStyle = "rgba(105,118,121,.07)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
      return;
    }
    if (weather === "rain") {
      ctx.fillStyle = "rgba(53,70,77,.11)";
      ctx.fillRect(0, 0, viewWidth, viewHeight);
      ctx.strokeStyle = "rgba(201,221,228,.42)";
      ctx.lineWidth = 1;
      const phase = state.visual.rainPhase;
      for (let i = 0; i < 150; i += 1) {
        const x = ((i * 83 + phase * 290) % (viewWidth + 80)) - 40;
        const y = ((i * 47 + phase * 520) % (viewHeight + 80)) - 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 15);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(190,213,219,.07)";
      for (let i = 0; i < 22; i += 1) {
        const x = (i * 149 + phase * 90) % viewWidth;
        const y = (i * 97 + phase * 55) % viewHeight;
        ctx.beginPath();
        ctx.ellipse(x, y, 18, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawMinimap() {
    const w = minimap.width;
    const h = minimap.height;
    const p = actorPosition();
    const range = 1500;
    const scale = w / (range * 2);

    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "#101613";
    mctx.fillRect(0, 0, w, h);

    const startRoadX = Math.floor((p.x - range) / ROAD_GAP) - 1;
    const endRoadX = Math.ceil((p.x + range) / ROAD_GAP) + 1;
    const startRoadY = Math.floor((p.y - range) / ROAD_GAP) - 1;
    const endRoadY = Math.ceil((p.y + range) / ROAD_GAP) + 1;

    mctx.strokeStyle = "#59625e";
    mctx.lineWidth = Math.max(3, ROAD_WIDTH * scale);
    for (let i = startRoadX; i <= endRoadX; i += 1) {
      const x = w / 2 + (i * ROAD_GAP - p.x) * scale;
      mctx.beginPath();
      mctx.moveTo(x, 0);
      mctx.lineTo(x, h);
      mctx.stroke();
    }
    for (let i = startRoadY; i <= endRoadY; i += 1) {
      const y = h / 2 + (i * ROAD_GAP - p.y) * scale;
      mctx.beginPath();
      mctx.moveTo(0, y);
      mctx.lineTo(w, y);
      mctx.stroke();
    }

    function dot(wx, wy, color, radius) {
      const x = w / 2 + (wx - p.x) * scale;
      const y = h / 2 + (wy - p.y) * scale;
      if (x < -8 || y < -8 || x > w + 8 || y > h + 8) return;
      mctx.fillStyle = color;
      mctx.beginPath();
      mctx.arc(x, y, radius, 0, Math.PI * 2);
      mctx.fill();
    }

    if (state.player.inVehicle && state.drive.route.length) {
      mctx.save();
      mctx.strokeStyle = "#68c9ff";
      mctx.lineWidth = 3;
      mctx.beginPath();
      mctx.moveTo(w / 2, h / 2);
      for (let i = state.drive.routeIndex; i < state.drive.route.length; i += 1) {
        const point = state.drive.route[i];
        mctx.lineTo(w / 2 + (point.x - p.x) * scale, h / 2 + (point.y - p.y) * scale);
      }
      mctx.stroke();
      mctx.restore();
    }

    for (const place of PLACES) dot(place.x, place.y, place.color, 4.2);
    dot(personalCar.x, personalCar.y, "#e8edf0", 2.7);

    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.arc(w / 2, h / 2, 4.5, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = "rgba(255,255,255,.24)";
    mctx.lineWidth = 2;
    mctx.strokeRect(4, 4, w - 8, h - 8);
  }

  function needStatusColor(value) {
    if (value < 25) return "#df7772";
    if (value < 50) return "#d8b467";
    return "#9fd4aa";
  }

  function updateObjective() {
    if (state.player.inVehicle) {
      const destination = PLACES.find((place) => place.id === state.drive.destination);
      objectiveTitle.textContent = destination ? "運転中: " + destination.name : "目的地を選択";
      if (!destination) objectiveText.textContent = "E / ROUTEから行き先を設定する";
      else {
        const signal = upcomingSignal();
        const lead = leadVehicleInfo();
        if (signal && signal.state === "red" && signal.distance < STOP_LINE_OFFSET + 85) objectiveText.textContent = "赤信号です。横断歩道手前の停止線で止まる";
        else if (lead && lead.distance < 130) objectiveText.textContent = "前走車との車間を保つ";
        else objectiveText.textContent = "W / ↑・ACCELで加速、S / ↓・BRAKEで減速";
      }
      return;
    }

    const n = state.needs;
    if (state.cash < 0) {
      objectiveTitle.textContent = "家計を立て直そう";
      objectiveText.textContent = "カフェで働いて赤字を減らす";
      return;
    }
    if (n.energy < 25) {
      objectiveTitle.textContent = "かなり疲れている";
      objectiveText.textContent = "自宅で眠るか休憩しよう";
      return;
    }
    if (n.hunger < 25) {
      objectiveTitle.textContent = "お腹が空いている";
      objectiveText.textContent = state.groceries > 0 ? "自宅で料理する" : "スーパーで食料を買う";
      return;
    }
    if (n.hygiene < 25) {
      objectiveTitle.textContent = "シャワーを浴びたい";
      objectiveText.textContent = "自宅かジムで清潔を回復できる";
      return;
    }
    if (n.social < 25) {
      objectiveTitle.textContent = "誰かと話したい";
      objectiveText.textContent = "公園・カフェ・図書館で知り合いを探す";
      return;
    }
    if (n.fun < 25) {
      objectiveTitle.textContent = "気分転換が必要";
      objectiveText.textContent = "公園、図書館、ジムで自由時間を過ごす";
      return;
    }
    if (state.cash < RENT && nextRentDay() - state.day <= 3) {
      objectiveTitle.textContent = "家賃に備えよう";
      objectiveText.textContent = "カフェの4時間シフトで収入を増やす";
      return;
    }
    objectiveTitle.textContent = "今日はどう過ごす？";
    objectiveText.textContent = "仕事・買い物・運動・読書・交流を自由に選べる";
  }

  function updateHUD() {
    const p = actorPosition();
    areaNameEl.textContent = currentDistrict(p.x, p.y);
    const hours = Math.floor(state.minute / 60);
    const minutes = Math.floor(state.minute % 60);
    worldClockEl.textContent = "Day " + state.day + "  " + String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
    cashText.textContent = "¥" + Math.floor(state.cash).toLocaleString("ja-JP");
    foodText.textContent = "食料 " + state.groceries;

    for (const [key, [bar, text]] of Object.entries(needEls)) {
      const value = clamp(state.needs[key], 0, 100);
      bar.style.width = value + "%";
      bar.style.background = needStatusColor(value);
      text.textContent = Math.round(value);
    }

    const values = Object.values(state.needs);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const minimum = Math.min(...values);
    lifeStatus.textContent = minimum < 20 ? "かなりつらい" : average > 75 ? "とても充実" : average > 55 ? "いい感じ" : "少し疲れ気味";
    rentText.textContent = "次の家賃: Day " + nextRentDay() + " / ¥" + RENT.toLocaleString("ja-JP");
    updateObjective();

    driveHud.hidden = !state.player.inVehicle;
    mobileDrivingControls.hidden = !state.player.inVehicle;
    document.body.classList.toggle("driving", state.player.inVehicle);

    if (state.player.inVehicle) {
      const limit = speedLimitAt(personalCar.x, personalCar.y);
      const signal = upcomingSignal();
      const lead = leadVehicleInfo();
      const destination = PLACES.find((place) => place.id === state.drive.destination);
      speedText.textContent = Math.round(personalCar.speed * SPEED_TO_KMH);
      speedLimitText.textContent = limit;
      driveScoreText.textContent = state.drive.score;
      driveDestinationText.textContent = destination ? "→ " + destination.name : "目的地を選択";
      signalText.textContent = signal
        ? (signal.state === "green" ? "信号 青" : signal.state === "yellow" ? "信号 黄" : "信号 赤")
        : "信号 —";
      signalText.classList.toggle("route-warning", Boolean(signal && signal.state === "yellow"));
      signalText.classList.toggle("route-danger", Boolean(signal && signal.state === "red"));
      gapText.textContent = lead ? "車間 " + Math.max(0, Math.round(lead.distance / 10)) + "m" : "車間 —";
      gapText.classList.toggle("route-danger", Boolean(lead && lead.distance < 80));
    }

    const interaction = nearestInteraction();
    if (interaction && actionSheet.hidden && helpPanel.hidden) {
      interactionText.textContent = interaction.label;
      interactionPrompt.hidden = false;
    } else {
      interactionPrompt.hidden = true;
    }
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    ctx.fillStyle = "#74836f";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    beginWorldProjection();
    drawGround();
    drawNeighborhoodGround();
    drawRoute();
    drawStreetProps();
    drawBuildings();
    for (const place of PLACES) drawPlace(place);
    drawCityLandmarks();
    drawPedestrians();
    for (const npc of NPCS) drawNpc(npc);
    for (const car of traffic) drawCar(car, false);
    drawCar(personalCar, true);
    drawPlayer();
    drawTrafficLights();
    drawStreetLightsGlow();
    endWorldProjection();

    drawNightOverlay();
    drawWeather();
    drawMinimap();
    updateHUD();
  }

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    if (actionQueued) {
      actionQueued = false;
      performAction();
    }

    update(dt);

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.hidden = true;
    }

    render();
    requestAnimationFrame(frame);
  }

  function togglePause() {
    if (!actionSheet.hidden) {
      closeActionSheet();
      return;
    }
    if (!helpPanel.hidden) {
      helpPanel.hidden = true;
      return;
    }
    state.paused = !state.paused;
    pausedOverlay.hidden = !state.paused;
  }

  function updateJoystick(event) {
    const rect = joystick.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy);
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    touch.x = dx / max;
    touch.y = dy / max;
    joystickKnob.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  function resetJoystick() {
    touch.x = 0;
    touch.y = 0;
    touch.pointerId = null;
    joystickKnob.style.transform = "translate(0,0)";
  }

  document.getElementById("gameShell").addEventListener("contextmenu", (event) => event.preventDefault());
  document.getElementById("gameShell").addEventListener("selectstart", (event) => event.preventDefault());

  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "e", "shift"].includes(key)) {
      event.preventDefault();
    }

    if (key === "e" && !event.repeat) {
      actionQueued = true;
      return;
    }
    if (key === "escape" && !event.repeat) {
      togglePause();
      return;
    }

    keys.add(key);
  }, { passive: false });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  window.addEventListener("blur", () => {
    keys.clear();
    resetJoystick();
    touch.run = false;
    touch.driveAccel = false;
    touch.driveBrake = false;
  });

  joystick.addEventListener("pointerdown", (event) => {
    touch.pointerId = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener("pointermove", (event) => {
    if (touch.pointerId === event.pointerId) updateJoystick(event);
  });
  joystick.addEventListener("pointerup", (event) => {
    if (touch.pointerId === event.pointerId) resetJoystick();
  });
  joystick.addEventListener("pointercancel", resetJoystick);

  actionButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    actionQueued = true;
  });

  runButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touch.run = true;
    try {
      runButton.setPointerCapture(event.pointerId);
    } catch (_) {}
  });
  const stopRun = () => { touch.run = false; };
  runButton.addEventListener("pointerup", stopRun);
  runButton.addEventListener("pointercancel", stopRun);
  runButton.addEventListener("lostpointercapture", stopRun);

  const bindHoldButton = (button, key) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      touch[key] = true;
      try {
        button.setPointerCapture(event.pointerId);
      } catch (_) {}
    });
    const stop = () => { touch[key] = false; };
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  };

  bindHoldButton(driveAccelButton, "driveAccel");
  bindHoldButton(driveBrakeButton, "driveBrake");
  driveMenuButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    actionQueued = true;
  });

  actionClose.addEventListener("click", closeActionSheet);
  helpButton.addEventListener("click", () => { helpPanel.hidden = false; });
  helpClose.addEventListener("click", () => { helpPanel.hidden = true; });
  saveButton.addEventListener("click", () => saveGame(true));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame(false);
  });
  window.addEventListener("pagehide", () => saveGame(false));

  generateBuildings();
  generateTraffic();
  generatePedestrians();
  loadGame();
  resize();
  if (state.player.inVehicle) {
    personalCar.speed = 0;
    state.drive.route = [];
    state.drive.signals = [];
    state.drive.destination = null;
    document.body.classList.add("driving");
  }

  if (!canStand(state.player.x, state.player.y)) {
    state.player.x = HOME.x + 55;
    state.player.y = HOME.y + 65;
    state.player.inVehicle = false;
  }

  state.camera.x = clamp(state.player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
  state.camera.y = clamp(state.player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));

  showToast("CITY DAYSへようこそ。今日は自由に過ごせます");
  requestAnimationFrame(frame);
})();
