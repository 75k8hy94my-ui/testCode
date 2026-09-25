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
  const BLOCK_MARGIN = 34;
  const PLAYER_RADIUS = 14;
  const WALK_SPEED = 200;
  const RUN_SPEED = 300;
  const SPEED_TO_KMH = 0.16;
  const SIGNAL_CYCLE = 20;
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
    drive: {
      route: [],
      routeIndex: 0,
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
        const r = hash2(gx, gy, 22);
        const tint = 0.76 + hash2(gx, gy, 91) * 0.18;

        if (r < 0.15) continue;

        if (r < 0.55) {
          buildings.push({
            x: left + 20,
            y: top + 20,
            w: bw - 40,
            h: bh - 40,
            tint,
            kind: hash2(gx, gy, 301) > 0.78 ? "tower" : "normal"
          });
        } else if (r < 0.8) {
          const split = bw * (0.43 + hash2(gx, gy, 104) * 0.12);
          buildings.push({ x: left + 12, y: top + 18, w: split - 22, h: bh - 36, tint, kind: "normal" });
          buildings.push({ x: left + split + 10, y: top + 32, w: bw - split - 22, h: bh - 64, tint: tint * 0.94, kind: "normal" });
        } else {
          const split = bh * (0.43 + hash2(gx, gy, 205) * 0.12);
          buildings.push({ x: left + 20, y: top + 12, w: bw - 40, h: split - 22, tint, kind: "normal" });
          buildings.push({ x: left + 34, y: top + split + 10, w: bw - 68, h: bh - split - 22, tint: tint * 0.93, kind: "low" });
        }
      }
    }
  }

  function randomRoadPoint(seedA, seedB, offset = 0) {
    const horizontal = hash2(seedA, seedB, 5) > 0.5;
    const roadIndex = 1 + Math.floor(hash2(seedA, seedB, 8) * 16);
    const along = COAST + 240 + hash2(seedA, seedB, 13) * (WORLD_SIZE - COAST * 2 - 480);
    const lane = (hash2(seedA, seedB, 17) > 0.5 ? 1 : -1) * (34 + offset);
    if (horizontal) {
      return { x: along, y: roadIndex * ROAD_GAP + lane, angle: hash2(seedA, seedB, 19) > 0.5 ? 0 : Math.PI };
    }
    return { x: roadIndex * ROAD_GAP + lane, y: along, angle: hash2(seedA, seedB, 19) > 0.5 ? Math.PI / 2 : -Math.PI / 2 };
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
        color: colors[i % colors.length]
      });
    }
  }

  function generatePedestrians() {
    for (let i = 0; i < 48; i += 1) {
      let x = COAST + 300 + hash2(i, 2, 31) * (WORLD_SIZE - COAST * 2 - 600);
      let y = COAST + 300 + hash2(i, 9, 71) * (WORLD_SIZE - COAST * 2 - 600);
      let attempts = 0;
      while ((!canStand(x, y, 10) || isRoad(x, y)) && attempts < 30) {
        x = COAST + 300 + hash2(i + attempts, 12, 44) * (WORLD_SIZE - COAST * 2 - 600);
        y = COAST + 300 + hash2(i + attempts, 16, 84) * (WORLD_SIZE - COAST * 2 - 600);
        attempts += 1;
      }
      pedestrians.push({
        x,
        y,
        dir: hash2(i, 3, 90) * Math.PI * 2,
        timer: 1 + hash2(i, 4, 93) * 4,
        speed: 28 + hash2(i, 8, 96) * 30,
        color: ["#ddb29d", "#a9c5d9", "#d7bf82", "#baa9d3", "#9fc3a4"][i % 5]
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

  function compactRoute(points) {
    const result = [];
    for (const point of points) {
      const previous = result[result.length - 1];
      if (!previous || distance(previous.x, previous.y, point.x, point.y) > 4) result.push(point);
    }
    return result;
  }

  function buildDrivingRoute(place) {
    const start = roadSnap(personalCar.x, personalCar.y);
    const startIntersection = start.orientation === "h"
      ? { x: Math.round(start.x / ROAD_GAP) * ROAD_GAP, y: start.y }
      : { x: start.x, y: Math.round(start.y / ROAD_GAP) * ROAD_GAP };
    const end = destinationRoadPoint(place);
    const endIntersection = { x: Math.round(end.x / ROAD_GAP) * ROAD_GAP, y: end.y };
    const bend = { x: endIntersection.x, y: startIntersection.y };

    return compactRoute([
      { x: start.x, y: start.y },
      startIntersection,
      bend,
      endIntersection,
      { x: end.x, y: end.y, final: true }
    ]);
  }

  function isIntersectionPoint(point) {
    if (!point) return false;
    const rx = Math.round(point.x / ROAD_GAP) * ROAD_GAP;
    const ry = Math.round(point.y / ROAD_GAP) * ROAD_GAP;
    return Math.abs(point.x - rx) < 5 && Math.abs(point.y - ry) < 5;
  }

  function routeDirection() {
    const target = state.drive.route[state.drive.routeIndex];
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
    const direction = routeDirection();
    if (!direction) return null;
    for (let i = state.drive.routeIndex; i < state.drive.route.length; i += 1) {
      const point = state.drive.route[i];
      if (!isIntersectionPoint(point)) continue;
      const d = distance(personalCar.x, personalCar.y, point.x, point.y);
      if (d > 180) continue;
      const stateName = signalStateAt(point.x, point.y, direction.orientation);
      return {
        state: stateName,
        distance: d,
        key: Math.round(point.x) + ":" + Math.round(point.y) + ":" + direction.orientation
      };
    }
    return null;
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
    state.drive.route = buildDrivingRoute(place);
    state.drive.routeIndex = 0;
    state.drive.score = 100;
    state.drive.speedingTimer = 0;
    state.drive.gapTimer = 0;
    state.drive.violationKeys = new Set();
    showToast(place.name + "へのルートを設定しました");
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
    if (y > WORLD_SIZE * 0.72) return "南港";
    if (y < WORLD_SIZE * 0.28) return "北丘";
    if (x < WORLD_SIZE * 0.3) return "西地区";
    if (x > WORLD_SIZE * 0.7) return "東地区";
    if (distance(x, y, HOME.x, HOME.y) < 1500) return "中央区";
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

  function closeActionSheet() {
    actionSheet.hidden = true;
    actionChoices.replaceChildren();
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
    const route = state.drive.route;
    let target = route[state.drive.routeIndex];

    if (target) {
      let d = distance(personalCar.x, personalCar.y, target.x, target.y);
      if (d < 32 && state.drive.routeIndex < route.length - 1) {
        state.drive.routeIndex += 1;
        target = route[state.drive.routeIndex];
        d = distance(personalCar.x, personalCar.y, target.x, target.y);
      }

      if (target) {
        const desired = Math.atan2(target.y - personalCar.y, target.x - personalCar.x);
        const diff = angleWrap(desired - personalCar.angle);
        const turnFactor = clamp(Math.abs(personalCar.speed) / 120, 0.28, 1);
        personalCar.angle += clamp(diff, -1.1, 1.1) * 2.5 * turnFactor * dt;
      }
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
    if (signal && signal.state === "red" && signal.distance < 34 && personalCar.speed > 18 && !state.drive.violationKeys.has(signal.key)) {
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
      let targetSpeed = car.cruise;
      if ((signal === "red" || signal === "yellow") && intersectionDistance < 95) {
        targetSpeed = Math.max(0, (intersectionDistance - 30) * 2.4);
      }

      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2.4);

      const ox = car.x;
      const oy = car.y;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;

      if (!inWorld(car.x, car.y, 28) || collidesBuilding(car.x, car.y, 25)) {
        car.x = ox;
        car.y = oy;
        car.angle += Math.PI;
      }
    }
  }

  function updatePedestrians(dt) {
    for (const ped of pedestrians) {
      ped.timer -= dt;
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

    const gameMinutes = dt * 0.7;
    advanceTime(gameMinutes);

    autosaveTimer += dt;
    if (autosaveTimer >= 5) {
      autosaveTimer = 0;
      saveGame(false);
    }

    const p = actorPosition();
    const targetX = clamp(p.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
    const targetY = clamp(p.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
    const blend = 1 - Math.pow(0.88, dt * 60);
    state.camera.x += (targetX - state.camera.x) * blend;
    state.camera.y += (targetY - state.camera.y) * blend;

    clampNeeds();
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

  function drawGround() {
    ctx.fillStyle = "#7a8976";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const edges = {
      left: COAST - state.camera.x,
      top: COAST - state.camera.y,
      right: WORLD_SIZE - COAST - state.camera.x,
      bottom: WORLD_SIZE - COAST - state.camera.y
    };

    ctx.fillStyle = "#477884";
    if (edges.left > 0) ctx.fillRect(0, 0, edges.left, viewHeight);
    if (edges.top > 0) ctx.fillRect(0, 0, viewWidth, edges.top);
    if (edges.right < viewWidth) ctx.fillRect(edges.right, 0, viewWidth - edges.right, viewHeight);
    if (edges.bottom < viewHeight) ctx.fillRect(0, edges.bottom, viewWidth, viewHeight - edges.bottom);

    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;

    ctx.fillStyle = "#3b4142";
    for (let i = startX; i <= endX; i += 1) {
      const sx = i * ROAD_GAP - ROAD_HALF - state.camera.x;
      ctx.fillRect(sx, 0, ROAD_WIDTH, viewHeight);
    }
    for (let i = startY; i <= endY; i += 1) {
      const sy = i * ROAD_GAP - ROAD_HALF - state.camera.y;
      ctx.fillRect(0, sy, viewWidth, ROAD_WIDTH);
    }

    ctx.strokeStyle = "rgba(244,225,160,.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 18]);
    for (let i = startX; i <= endX; i += 1) {
      const sx = i * ROAD_GAP - state.camera.x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, viewHeight);
      ctx.stroke();
    }
    for (let i = startY; i <= endY; i += 1) {
      const sy = i * ROAD_GAP - state.camera.y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(viewWidth, sy);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = "#929996";
    for (let i = startX; i <= endX; i += 1) {
      const a = i * ROAD_GAP - ROAD_HALF - 8 - state.camera.x;
      const b = i * ROAD_GAP + ROAD_HALF - state.camera.x;
      ctx.fillRect(a, 0, 8, viewHeight);
      ctx.fillRect(b, 0, 8, viewHeight);
    }
    for (let i = startY; i <= endY; i += 1) {
      const a = i * ROAD_GAP - ROAD_HALF - 8 - state.camera.y;
      const b = i * ROAD_GAP + ROAD_HALF - state.camera.y;
      ctx.fillRect(0, a, viewWidth, 8);
      ctx.fillRect(0, b, viewWidth, 8);
    }
  }

  function drawRoute() {
    if (!state.player.inVehicle || !state.drive.route.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(98,194,255,.68)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(personalCar.x - state.camera.x, personalCar.y - state.camera.y);
    for (let i = state.drive.routeIndex; i < state.drive.route.length; i += 1) {
      const point = state.drive.route[i];
      ctx.lineTo(point.x - state.camera.x, point.y - state.camera.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTrafficLights() {
    const startX = Math.floor(state.camera.x / ROAD_GAP) - 1;
    const endX = Math.ceil((state.camera.x + viewWidth) / ROAD_GAP) + 1;
    const startY = Math.floor(state.camera.y / ROAD_GAP) - 1;
    const endY = Math.ceil((state.camera.y + viewHeight) / ROAD_GAP) + 1;
    const lightColor = (name) => name === "green" ? "#65d47b" : name === "yellow" ? "#f0c95c" : "#e96862";

    for (let gx = startX; gx <= endX; gx += 1) {
      for (let gy = startY; gy <= endY; gy += 1) {
        const wx = gx * ROAD_GAP;
        const wy = gy * ROAD_GAP;
        const sx = wx - state.camera.x;
        const sy = wy - state.camera.y;
        const h = signalStateAt(wx, wy, "h");
        const v = signalStateAt(wx, wy, "v");

        ctx.fillStyle = "#1b201e";
        ctx.fillRect(sx - 52, sy - 61, 15, 22);
        ctx.fillRect(sx + 38, sy + 39, 15, 22);
        ctx.fillRect(sx + 39, sy - 52, 22, 15);
        ctx.fillRect(sx - 61, sy + 38, 22, 15);

        ctx.fillStyle = lightColor(h);
        ctx.beginPath();
        ctx.arc(sx - 44, sy - 50, 5, 0, Math.PI * 2);
        ctx.arc(sx + 45, sy + 50, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = lightColor(v);
        ctx.beginPath();
        ctx.arc(sx + 50, sy - 44, 5, 0, Math.PI * 2);
        ctx.arc(sx - 50, sy + 45, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawBuildings() {
    for (const building of buildings) {
      if (!visibleRect(building, 30)) continue;
      const x = building.x - state.camera.x;
      const y = building.y - state.camera.y;
      const base = Math.floor(102 * building.tint);
      const g = Math.floor(108 * building.tint);
      const b = Math.floor(111 * building.tint);

      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(x + 9, y + 11, building.w, building.h);
      ctx.fillStyle = "rgb(" + base + "," + g + "," + b + ")";
      ctx.fillRect(x, y, building.w, building.h);

      ctx.fillStyle = building.kind === "low" ? "#766e64" : "#7d8588";
      ctx.fillRect(x + 7, y + 7, building.w - 14, 12);

      if (building.kind === "tower") {
        ctx.fillStyle = "rgba(190,219,227,.34)";
        const cols = Math.max(2, Math.floor(building.w / 46));
        const rows = Math.max(2, Math.floor(building.h / 48));
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            ctx.fillRect(x + 18 + cx * 42, y + 30 + cy * 44, 16, 10);
          }
        }
      }
    }
  }

  function drawPlace(place) {
    const p = worldToScreen(place.x, place.y);
    if (p.x < -260 || p.y < -260 || p.x > viewWidth + 260 || p.y > viewHeight + 260) return;

    if (place.id === "park") {
      ctx.fillStyle = "#648f61";
      ctx.fillRect(p.x - 185, p.y - 185, 370, 370);
      ctx.fillStyle = "rgba(236,226,190,.55)";
      ctx.fillRect(p.x - 12, p.y - 165, 24, 330);
      ctx.fillRect(p.x - 165, p.y - 12, 330, 24);
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4;
        ctx.fillStyle = "#3f7148";
        ctx.beginPath();
        ctx.arc(p.x + Math.cos(angle) * 105, p.y + Math.sin(angle) * 105, 20, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(p.x - 142, p.y - 128, 294, 266);
      ctx.fillStyle = place.color;
      ctx.fillRect(p.x - 150, p.y - 140, 294, 266);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fillRect(p.x - 130, p.y - 118, 254, 22);
      ctx.fillStyle = "#28322e";
      ctx.fillRect(p.x - 24, p.y + 84, 48, 42);
    }

    ctx.fillStyle = "rgba(14,20,17,.78)";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(place.name, p.x, p.y - 164);

    ctx.fillStyle = "#f4f7f5";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#26312b";
    ctx.font = "800 13px system-ui, sans-serif";
    ctx.fillText(place.symbol, p.x, p.y + 5);
  }

  function drawNpc(npc) {
    const p = worldToScreen(npc.x, npc.y);
    if (p.x < -30 || p.y < -30 || p.x > viewWidth + 30 || p.y > viewHeight + 30) return;

    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 8, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x - 6, p.y + 2, 12, 16);

    ctx.fillStyle = "rgba(12,18,15,.72)";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(npc.name, p.x, p.y - 20);
  }

  function drawPedestrians() {
    for (const ped of pedestrians) {
      const p = worldToScreen(ped.x, ped.y);
      if (p.x < -24 || p.y < -24 || p.x > viewWidth + 24 || p.y > viewHeight + 24) continue;
      ctx.fillStyle = "rgba(0,0,0,.16)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 6, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(p.x - 4, p.y + 2, 8, 11);
    }
  }

  function drawCar(car, owned = false) {
    const p = worldToScreen(car.x, car.y);
    if (p.x < -85 || p.y < -85 || p.x > viewWidth + 85 || p.y > viewHeight + 85) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.fillRect(-33, -18, 72, 38);
    ctx.fillStyle = car.color;
    ctx.fillRect(-38, -21, 76, 42);
    ctx.fillStyle = "#263034";
    ctx.fillRect(-10, -16, 27, 32);
    ctx.fillStyle = "#c8d9df";
    ctx.fillRect(-27, -15, 10, 30);
    ctx.fillRect(23, -15, 9, 30);
    ctx.fillStyle = "#171a1b";
    ctx.fillRect(-27, -24, 13, 4);
    ctx.fillRect(16, -24, 13, 4);
    ctx.fillRect(-27, 20, 13, 4);
    ctx.fillRect(16, 20, 13, 4);
    if (owned) {
      ctx.strokeStyle = "rgba(255,255,255,.72)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-41, -24, 82, 48);
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (state.player.inVehicle) return;
    const p = worldToScreen(state.player.x, state.player.y);
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 9, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0e8dd";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#32443b";
    ctx.fillRect(p.x - 7, p.y + 3, 14, 19);
    ctx.fillStyle = "#d4d9d6";
    ctx.beginPath();
    ctx.arc(p.x + state.player.facingX * 6, p.y + state.player.facingY * 6, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawNightOverlay() {
    const t = state.minute / 1440;
    const daylight = Math.max(0, Math.sin((t - 0.25) * Math.PI * 2));
    const alpha = 0.48 - daylight * 0.43;
    if (alpha <= 0.02) return;
    ctx.fillStyle = "rgba(11,17,31," + alpha.toFixed(3) + ")";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
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
        if (signal && signal.state === "red" && signal.distance < 120) objectiveText.textContent = "赤信号です。停止線の手前で止まる";
        else if (lead && lead.distance < 130) objectiveText.textContent = "前走車との車間を保つ";
        else objectiveText.textContent = "ルートは自動。速度と停止・発進だけを操作";
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
    drawGround();
    drawRoute();
    drawTrafficLights();
    drawBuildings();
    for (const place of PLACES) drawPlace(place);
    drawPedestrians();
    for (const npc of NPCS) drawNpc(npc);
    for (const car of traffic) drawCar(car, false);
    drawCar(personalCar, true);
    drawPlayer();
    drawNightOverlay();
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
