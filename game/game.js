(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
  const minimap = document.getElementById("minimap");
  const mctx = minimap.getContext("2d");

  const areaNameEl = document.getElementById("areaName");
  const worldClockEl = document.getElementById("worldClock");
  const healthBar = document.getElementById("healthBar");
  const healthText = document.getElementById("healthText");
  const cashText = document.getElementById("cashText");
  const ammoText = document.getElementById("ammoText");
  const wantedStars = document.getElementById("wantedStars");
  const wantedStatus = document.getElementById("wantedStatus");
  const missionTitle = document.getElementById("missionTitle");
  const missionText = document.getElementById("missionText");
  const interactionPrompt = document.getElementById("interactionPrompt");
  const interactionText = document.getElementById("interactionText");
  const dialogue = document.getElementById("dialogue");
  const dialogueName = document.getElementById("dialogueName");
  const dialogueText = document.getElementById("dialogueText");
  const dialogueClose = document.getElementById("dialogueClose");
  const helpPanel = document.getElementById("helpPanel");
  const helpButton = document.getElementById("helpButton");
  const helpClose = document.getElementById("helpClose");
  const saveButton = document.getElementById("saveButton");
  const toast = document.getElementById("toast");
  const pausedOverlay = document.getElementById("pausedOverlay");
  const joystick = document.getElementById("joystick");
  const joystickKnob = document.getElementById("joystickKnob");
  const actionButton = document.getElementById("actionButton");
  const fireButton = document.getElementById("fireButton");
  const boostButton = document.getElementById("boostButton");

  const WORLD_SIZE = 12400;
  const COAST = 170;
  const ROAD_GAP = 620;
  const ROAD_WIDTH = 180;
  const ROAD_HALF = ROAD_WIDTH / 2;
  const BLOCK_MARGIN = 34;
  const PLAYER_RADIUS = 14;
  const WALK_SPEED = 205;
  const SPRINT_SPEED = 315;
  const SAVE_KEY = "testCodeCrimeSandboxSave:v1";
  const CENTER = ROAD_GAP * 10;
  const SPAWN = { x: CENTER + 125, y: CENTER + 235 };
  const CONTACT = { x: CENTER + 235, y: CENTER + 285, name: "Rin" };
  const GARAGE = { x: ROAD_GAP * 15 + 240, y: ROAD_GAP * 15 + 240 };
  const HOSPITAL = { x: CENTER - 210, y: CENTER + 265 };
  const SPECIAL_BLOCKS = new Set(["10,10", "15,15", "9,10", "10,9"]);
  const keys = new Set();
  const buildings = [];
  const vehicles = [];
  const pedestrians = [];
  const bullets = [];
  const police = [];
  const mouse = { x: 0, y: 0, active: false };
  const touch = { x: 0, y: 0, boost: false, pointerId: null };

  let viewWidth = window.innerWidth;
  let viewHeight = window.innerHeight;
  let dpr = 1;
  let lastFrame = performance.now();
  let actionQueued = false;
  let fireQueued = false;
  let toastTimer = 0;
  let autosaveTimer = 0;
  let policeSpawnTimer = 0;
  let nextVehicleId = 1;

  const state = {
    player: {
      x: SPAWN.x,
      y: SPAWN.y,
      facingX: 0,
      facingY: 1,
      health: 100,
      cash: 2500,
      ammo: 48,
      magazine: 12,
      reloadTimer: 0,
      fireCooldown: 0,
      inVehicle: null
    },
    camera: { x: SPAWN.x - viewWidth / 2, y: SPAWN.y - viewHeight / 2 },
    wanted: 0,
    wantedDecay: 0,
    time: 0.49,
    paused: false,
    mission: { step: 0, completed: false }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function angleWrap(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
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
        const tint = 0.75 + hash2(gx, gy, 91) * 0.2;

        if (r < 0.18) continue;

        if (r < 0.52) {
          buildings.push({
            x: left + 22,
            y: top + 20,
            w: bw - 44,
            h: bh - 40,
            tint,
            kind: hash2(gx, gy, 301) > 0.76 ? "tower" : "normal"
          });
        } else if (r < 0.78) {
          const split = bw * (0.43 + hash2(gx, gy, 104) * 0.12);
          buildings.push({ x: left + 12, y: top + 16, w: split - 22, h: bh - 32, tint, kind: "normal" });
          buildings.push({ x: left + split + 10, y: top + 32, w: bw - split - 22, h: bh - 64, tint: tint * 0.94, kind: "normal" });
        } else {
          const split = bh * (0.43 + hash2(gx, gy, 205) * 0.12);
          buildings.push({ x: left + 20, y: top + 12, w: bw - 40, h: split - 22, tint, kind: "normal" });
          buildings.push({ x: left + 34, y: top + split + 10, w: bw - 68, h: bh - split - 22, tint: tint * 0.92, kind: "warehouse" });
        }
      }
    }
  }

  function randomRoadPoint(seedA, seedB, offset = 0) {
    const horizontal = hash2(seedA, seedB, 5) > 0.5;
    const roadIndex = 1 + Math.floor(hash2(seedA, seedB, 8) * 18);
    const along = COAST + 240 + hash2(seedA, seedB, 13) * (WORLD_SIZE - COAST * 2 - 480);
    const lane = (hash2(seedA, seedB, 17) > 0.5 ? 1 : -1) * (34 + offset);
    if (horizontal) {
      return { x: along, y: roadIndex * ROAD_GAP + lane, angle: hash2(seedA, seedB, 19) > 0.5 ? 0 : Math.PI, orientation: "h" };
    }
    return { x: roadIndex * ROAD_GAP + lane, y: along, angle: hash2(seedA, seedB, 19) > 0.5 ? Math.PI / 2 : -Math.PI / 2, orientation: "v" };
  }

  function addVehicle(options) {
    const vehicle = {
      id: nextVehicleId++,
      x: options.x,
      y: options.y,
      angle: options.angle || 0,
      speed: options.speed || 0,
      width: options.width || 44,
      length: options.length || 76,
      color: options.color || "#d7d7d7",
      type: options.type || "sedan",
      ai: options.ai || null,
      police: Boolean(options.police),
      stolen: false,
      health: options.health || 100,
      driver: null,
      turnTimer: 0,
      sirenPhase: Math.random() * Math.PI * 2
    };
    vehicles.push(vehicle);
    if (vehicle.police) police.push(vehicle);
    return vehicle;
  }

  function generateVehicles() {
    const colors = ["#d7d9dc", "#4d78a8", "#a44e4e", "#c99d3a", "#49524f", "#7d6494", "#3f8a78"];

    for (let i = 0; i < 26; i += 1) {
      const p = randomRoadPoint(i + 2, i * 7 + 3, 18);
      addVehicle({
        x: p.x,
        y: p.y,
        angle: p.angle,
        speed: 75 + hash2(i, 4, 22) * 70,
        color: colors[i % colors.length],
        ai: { mode: "traffic", orientation: p.orientation }
      });
    }

    for (let i = 0; i < 18; i += 1) {
      const p = randomRoadPoint(i + 50, i * 3 + 11, 60);
      addVehicle({
        x: p.x,
        y: p.y,
        angle: p.angle,
        speed: 0,
        color: colors[(i + 3) % colors.length],
        ai: null
      });
    }

    addVehicle({ x: CENTER + 18, y: CENTER + 42, angle: 0, color: "#b23a3a", type: "sport" });
    addVehicle({ x: CENTER - 52, y: CENTER + 42, angle: Math.PI, color: "#d9d9dc", type: "coupe" });
    addVehicle({ x: CENTER + 42, y: CENTER - 58, angle: Math.PI / 2, color: "#4e8e74", type: "sedan" });
  }

  function generatePedestrians() {
    for (let i = 0; i < 58; i += 1) {
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
        speed: 35 + hash2(i, 8, 96) * 35,
        color: ["#dfb49d", "#a8c6dc", "#dbbf7f", "#b8a5d6", "#9ec7a7"][i % 5],
        down: 0,
        panic: 0
      });
    }
  }

  function currentVehicle() {
    if (state.player.inVehicle == null) return null;
    return vehicles.find((vehicle) => vehicle.id === state.player.inVehicle) || null;
  }

  function actorPosition() {
    const vehicle = currentVehicle();
    return vehicle ? { x: vehicle.x, y: vehicle.y } : { x: state.player.x, y: state.player.y };
  }

  function actorFacing() {
    const vehicle = currentVehicle();
    if (vehicle) return { x: Math.cos(vehicle.angle), y: Math.sin(vehicle.angle) };
    return { x: state.player.facingX, y: state.player.facingY };
  }

  function currentDistrict(x, y) {
    if (y > WORLD_SIZE * 0.72) return "South Harbor";
    if (y < WORLD_SIZE * 0.28) return "North Hills";
    if (x < WORLD_SIZE * 0.3) return "West End";
    if (x > WORLD_SIZE * 0.7) return "East Junction";
    if (distance(x, y, CENTER, CENTER) < 1700) return "Central City";
    return "Neon County";
  }

  function snapToRoad(x, y) {
    const rx = Math.round(x / ROAD_GAP) * ROAD_GAP;
    const ry = Math.round(y / ROAD_GAP) * ROAD_GAP;
    if (Math.abs(x - rx) < Math.abs(y - ry)) {
      return { x: clamp(rx + 34, COAST + 50, WORLD_SIZE - COAST - 50), y: clamp(y, COAST + 50, WORLD_SIZE - COAST - 50), angle: Math.PI / 2 };
    }
    return { x: clamp(x, COAST + 50, WORLD_SIZE - COAST - 50), y: clamp(ry + 34, COAST + 50, WORLD_SIZE - COAST - 50), angle: 0 };
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

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = 2.5;
  }

  function openDialogue(name, text) {
    dialogueName.textContent = name;
    dialogueText.textContent = text;
    dialogue.hidden = false;
  }

  function closeDialogue() {
    dialogue.hidden = true;
  }

  function saveGame(showMessage = false) {
    try {
      const vehicle = currentVehicle();
      const pos = vehicle ? { x: vehicle.x, y: vehicle.y } : { x: state.player.x, y: state.player.y };
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        player: {
          x: Math.round(pos.x * 10) / 10,
          y: Math.round(pos.y * 10) / 10,
          health: state.player.health,
          cash: state.player.cash,
          ammo: state.player.ammo,
          magazine: state.player.magazine
        },
        mission: state.mission,
        time: state.time,
        savedAt: Date.now()
      }));
      if (showMessage) showToast("ゲームを保存しました");
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
      if (saved && saved.player) {
        const x = Number(saved.player.x);
        const y = Number(saved.player.y);
        if (Number.isFinite(x) && Number.isFinite(y) && canStand(x, y, PLAYER_RADIUS)) {
          state.player.x = x;
          state.player.y = y;
        }
        state.player.health = clamp(Number(saved.player.health) || 100, 1, 100);
        state.player.cash = Math.max(0, Math.floor(Number(saved.player.cash) || 0));
        state.player.ammo = Math.max(0, Math.floor(Number(saved.player.ammo) || 0));
        state.player.magazine = clamp(Math.floor(Number(saved.player.magazine) || 0), 0, 12);
      }
      if (saved && saved.mission) {
        state.mission.step = clamp(Math.floor(Number(saved.mission.step) || 0), 0, 4);
        state.mission.completed = Boolean(saved.mission.completed);
      }
      if (saved && Number.isFinite(Number(saved.time))) {
        state.time = ((Number(saved.time) % 1) + 1) % 1;
      }
    } catch (error) {
      console.warn("load failed", error);
    }
  }

  function addWanted(level = 1) {
    state.wanted = clamp(Math.max(state.wanted, level), 0, 5);
    state.wantedDecay = 12 + state.wanted * 4;
  }

  function escalateWanted(amount = 1) {
    state.wanted = clamp(state.wanted + amount, 0, 5);
    state.wantedDecay = 14 + state.wanted * 4;
  }

  function nearestCivilianVehicle(maxDistance = 64) {
    const p = actorPosition();
    let best = null;
    let bestD = maxDistance;
    for (const vehicle of vehicles) {
      if (vehicle.police || vehicle.health <= 0) continue;
      if (state.player.inVehicle === vehicle.id) continue;
      const d = distance(p.x, p.y, vehicle.x, vehicle.y);
      if (d < bestD) {
        best = vehicle;
        bestD = d;
      }
    }
    return best;
  }

  function enterVehicle(vehicle) {
    if (!vehicle || state.player.inVehicle != null) return;
    const occupiedTraffic = Boolean(vehicle.ai && vehicle.ai.mode === "traffic");
    state.player.inVehicle = vehicle.id;
    vehicle.driver = "player";
    vehicle.ai = null;
    vehicle.stolen = true;
    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
    if (occupiedTraffic) {
      addWanted(1);
      showToast("車両強奪を目撃された");
    } else {
      showToast("車に乗った");
    }
    if (state.mission.step === 1) {
      state.mission.step = 2;
      addWanted(1);
      showToast("車を港のガレージへ運べ");
    }
  }

  function exitVehicle() {
    const vehicle = currentVehicle();
    if (!vehicle) return;
    const sideX = Math.cos(vehicle.angle + Math.PI / 2) * 48;
    const sideY = Math.sin(vehicle.angle + Math.PI / 2) * 48;
    const candidates = [
      [vehicle.x + sideX, vehicle.y + sideY],
      [vehicle.x - sideX, vehicle.y - sideY],
      [vehicle.x - Math.cos(vehicle.angle) * 54, vehicle.y - Math.sin(vehicle.angle) * 54]
    ];
    const spot = candidates.find(([x, y]) => canStand(x, y, PLAYER_RADIUS));
    if (!spot) {
      showToast("ここでは降りられない");
      return;
    }
    state.player.x = spot[0];
    state.player.y = spot[1];
    state.player.inVehicle = null;
    vehicle.driver = null;
    vehicle.speed *= 0.35;
  }

  function nearestInteraction() {
    const p = actorPosition();
    if (state.player.inVehicle != null) return { type: "exit", label: "車から降りる" };

    if (state.mission.step === 0 && distance(p.x, p.y, CONTACT.x, CONTACT.y) < 78) {
      return { type: "contact", label: "Rinと話す" };
    }

    const vehicle = nearestCivilianVehicle(68);
    if (vehicle) return { type: "vehicle", target: vehicle, label: "車に乗る" };
    return null;
  }

  function performAction() {
    if (!dialogue.hidden) {
      closeDialogue();
      return;
    }

    const interaction = nearestInteraction();
    if (!interaction) {
      showToast("近くに操作できるものはない");
      return;
    }

    if (interaction.type === "exit") {
      exitVehicle();
      return;
    }

    if (interaction.type === "vehicle") {
      enterVehicle(interaction.target);
      return;
    }

    if (interaction.type === "contact") {
      openDialogue("Rin", "港まで足が必要だ。適当な車を手に入れて、南東のガレージまで持ってこい。警察を連れてくるなよ。");
      state.mission.step = 1;
      showToast("ミッション開始: NIGHT RUN");
    }
  }

  function reload() {
    if (state.player.reloadTimer > 0 || state.player.magazine >= 12 || state.player.ammo <= 0) return;
    state.player.reloadTimer = 1.05;
    showToast("リロード");
  }

  function fireWeapon() {
    if (state.player.inVehicle != null) return;
    if (state.player.fireCooldown > 0 || state.player.reloadTimer > 0) return;
    if (state.player.magazine <= 0) {
      reload();
      return;
    }

    let dx = state.player.facingX;
    let dy = state.player.facingY;

    if (mouse.active) {
      const wx = mouse.x + state.camera.x;
      const wy = mouse.y + state.camera.y;
      const mag = Math.hypot(wx - state.player.x, wy - state.player.y);
      if (mag > 4) {
        dx = (wx - state.player.x) / mag;
        dy = (wy - state.player.y) / mag;
      }
    }

    state.player.facingX = dx;
    state.player.facingY = dy;
    state.player.magazine -= 1;
    state.player.fireCooldown = 0.19;
    bullets.push({
      x: state.player.x + dx * 20,
      y: state.player.y + dy * 20,
      vx: dx * 930,
      vy: dy * 930,
      life: 0.72
    });
    addWanted(1);

    for (const ped of pedestrians) {
      if (distance(ped.x, ped.y, state.player.x, state.player.y) < 420 && ped.down <= 0) ped.panic = 5;
    }
  }

  function damagePlayer(amount) {
    state.player.health = Math.max(0, state.player.health - amount);
    if (state.player.health <= 0) respawnPlayer();
  }

  function respawnPlayer() {
    const vehicle = currentVehicle();
    if (vehicle) {
      vehicle.driver = null;
      vehicle.speed = 0;
    }
    state.player.inVehicle = null;
    state.player.x = HOSPITAL.x;
    state.player.y = HOSPITAL.y;
    state.player.health = 100;
    state.player.cash = Math.max(0, state.player.cash - 250);
    state.player.magazine = Math.min(12, state.player.magazine + state.player.ammo);
    state.wanted = 0;
    state.wantedDecay = 0;
    for (const cop of police) cop.remove = true;
    showToast("病院で治療された -$250");
  }

  function nearestAngleDifference(target, current) {
    return angleWrap(target - current);
  }

  function drivePlayerVehicle(vehicle, dt) {
    let throttle = 0;
    let steer = 0;
    let boost = touch.boost || keys.has("shift");

    if (Math.abs(touch.x) > 0.02 || Math.abs(touch.y) > 0.02) {
      steer = touch.x;
      throttle = -touch.y;
    } else {
      if (keys.has("w") || keys.has("arrowup")) throttle += 1;
      if (keys.has("s") || keys.has("arrowdown")) throttle -= 1;
      if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
      if (keys.has("d") || keys.has("arrowright")) steer += 1;
    }

    const onRoad = isRoad(vehicle.x, vehicle.y);
    const maxSpeed = (vehicle.type === "sport" ? 430 : 365) * (boost ? 1.12 : 1) * (onRoad ? 1 : 0.62);
    const reverseMax = -135;
    const accel = vehicle.type === "sport" ? 330 : 275;

    if (throttle > 0.05) vehicle.speed += accel * throttle * dt;
    else if (throttle < -0.05) vehicle.speed += accel * 0.72 * throttle * dt;
    else vehicle.speed *= Math.pow(0.86, dt * 10);

    if (keys.has(" ")) vehicle.speed *= Math.pow(0.45, dt * 10);
    vehicle.speed = clamp(vehicle.speed, reverseMax, maxSpeed);

    const turnStrength = clamp(Math.abs(vehicle.speed) / 150, 0.18, 1.15);
    vehicle.angle += steer * 2.25 * turnStrength * dt * (vehicle.speed >= 0 ? 1 : -1);

    const oldX = vehicle.x;
    const oldY = vehicle.y;
    vehicle.x += Math.cos(vehicle.angle) * vehicle.speed * dt;
    vehicle.y += Math.sin(vehicle.angle) * vehicle.speed * dt;

    if (!inWorld(vehicle.x, vehicle.y, 34) || collidesBuilding(vehicle.x, vehicle.y, 30)) {
      vehicle.x = oldX;
      vehicle.y = oldY;
      const impact = Math.abs(vehicle.speed);
      vehicle.speed *= -0.24;
      if (impact > 210) damagePlayer(Math.min(18, impact * 0.035));
    }

    state.player.x = vehicle.x;
    state.player.y = vehicle.y;
  }

  function updateTraffic(vehicle, dt) {
    if (!vehicle.ai || vehicle.ai.mode !== "traffic") return;
    const oldX = vehicle.x;
    const oldY = vehicle.y;
    vehicle.x += Math.cos(vehicle.angle) * vehicle.speed * dt;
    vehicle.y += Math.sin(vehicle.angle) * vehicle.speed * dt;

    if (!inWorld(vehicle.x, vehicle.y, 28)) {
      vehicle.angle = angleWrap(vehicle.angle + Math.PI);
      vehicle.x = oldX;
      vehicle.y = oldY;
      return;
    }

    if (collidesBuilding(vehicle.x, vehicle.y, 26)) {
      vehicle.angle = angleWrap(vehicle.angle + Math.PI);
      vehicle.x = oldX;
      vehicle.y = oldY;
    }
  }

  function spawnPoliceCar() {
    const p = actorPosition();
    const angle = Math.random() * Math.PI * 2;
    const d = 720 + Math.random() * 260;
    const rawX = clamp(p.x + Math.cos(angle) * d, COAST + 100, WORLD_SIZE - COAST - 100);
    const rawY = clamp(p.y + Math.sin(angle) * d, COAST + 100, WORLD_SIZE - COAST - 100);
    const road = snapToRoad(rawX, rawY);
    addVehicle({
      x: road.x,
      y: road.y,
      angle: road.angle,
      speed: 120,
      color: "#e8edf2",
      type: "police",
      police: true,
      health: 145,
      ai: { mode: "police" }
    });
  }

  function updatePolice(cop, dt) {
    if (cop.remove || cop.health <= 0) return;
    const target = actorPosition();
    const desired = Math.atan2(target.y - cop.y, target.x - cop.x);
    const diff = nearestAngleDifference(desired, cop.angle);
    const steer = clamp(diff * 1.55, -1, 1);
    const dist = distance(cop.x, cop.y, target.x, target.y);
    const targetSpeed = dist > 260 ? 300 + state.wanted * 15 : 195;
    cop.speed += (targetSpeed - cop.speed) * Math.min(1, dt * 1.8);
    cop.angle += steer * 2.05 * dt;

    const oldX = cop.x;
    const oldY = cop.y;
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;

    if (!inWorld(cop.x, cop.y, 30) || collidesBuilding(cop.x, cop.y, 29)) {
      cop.x = oldX;
      cop.y = oldY;
      cop.angle += (Math.random() - 0.5) * 1.8;
      cop.speed *= 0.55;
    }

    if (dist < 62) {
      damagePlayer((7 + state.wanted * 1.7) * dt);
      const playerCar = currentVehicle();
      if (playerCar) playerCar.speed *= Math.pow(0.82, dt * 10);
    }

    if (dist > 2100 && state.wanted === 0) cop.remove = true;
  }

  function updateWanted(dt) {
    if (state.wanted <= 0) {
      state.wanted = 0;
      state.wantedDecay = 0;
      return;
    }

    policeSpawnTimer -= dt;
    const activePolice = police.filter((cop) => !cop.remove && cop.health > 0);
    const desired = Math.min(8, 1 + state.wanted * 2);
    if (activePolice.length < desired && policeSpawnTimer <= 0) {
      spawnPoliceCar();
      policeSpawnTimer = Math.max(1.7, 4.5 - state.wanted * 0.45);
    }

    const p = actorPosition();
    let nearest = Infinity;
    for (const cop of activePolice) nearest = Math.min(nearest, distance(p.x, p.y, cop.x, cop.y));

    if (nearest > 650) {
      state.wantedDecay -= dt;
      if (state.wantedDecay <= 0) {
        state.wanted -= 1;
        state.wantedDecay = state.wanted > 0 ? 8 + state.wanted * 3 : 0;
        showToast(state.wanted > 0 ? "手配度が下がった" : "警察の追跡を振り切った");
      }
    } else {
      state.wantedDecay = Math.max(state.wantedDecay, 4 + state.wanted * 1.5);
    }

    if (state.wanted === 0) {
      for (const cop of activePolice) {
        if (distance(p.x, p.y, cop.x, cop.y) > 900) cop.remove = true;
      }
    }
  }

  function updatePedestrians(dt) {
    const playerCar = currentVehicle();
    for (const ped of pedestrians) {
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }

      if (ped.panic > 0) {
        ped.panic -= dt;
        const p = actorPosition();
        ped.dir = Math.atan2(ped.y - p.y, ped.x - p.x);
      } else {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          ped.timer = 1.5 + Math.random() * 4;
          ped.dir += (Math.random() - 0.5) * 2.1;
        }
      }

      const speed = ped.panic > 0 ? 105 : ped.speed;
      const nx = ped.x + Math.cos(ped.dir) * speed * dt;
      const ny = ped.y + Math.sin(ped.dir) * speed * dt;
      if (canStand(nx, ny, 10) && !isRoad(nx, ny)) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.dir += Math.PI * (0.6 + Math.random() * 0.8);
      }

      if (playerCar && Math.abs(playerCar.speed) > 90 && distance(playerCar.x, playerCar.y, ped.x, ped.y) < 34) {
        ped.down = 10;
        playerCar.speed *= 0.78;
        escalateWanted(1);
        showToast("事故が通報された");
      }
    }
  }

  function updateBullets(dt) {
    for (const bullet of bullets) {
      bullet.life -= dt;
      if (bullet.life <= 0) continue;
      const nx = bullet.x + bullet.vx * dt;
      const ny = bullet.y + bullet.vy * dt;
      if (!inWorld(nx, ny, 2) || collidesBuilding(nx, ny, 2)) {
        bullet.life = 0;
        continue;
      }
      bullet.x = nx;
      bullet.y = ny;

      for (const ped of pedestrians) {
        if (ped.down > 0) continue;
        if (distance(bullet.x, bullet.y, ped.x, ped.y) < 14) {
          ped.down = 12;
          bullet.life = 0;
          escalateWanted(1);
          break;
        }
      }

      if (bullet.life <= 0) continue;

      for (const vehicle of vehicles) {
        if (vehicle.health <= 0) continue;
        if (distance(bullet.x, bullet.y, vehicle.x, vehicle.y) < 31) {
          vehicle.health -= vehicle.police ? 24 : 30;
          bullet.life = 0;
          if (vehicle.police) escalateWanted(1);
          if (vehicle.health <= 0) {
            vehicle.speed = 0;
            if (vehicle.police) showToast("警察車両を無力化した");
          }
          break;
        }
      }
    }

    while (bullets.length && bullets[0].life <= 0) bullets.shift();
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      if (bullets[i].life <= 0) bullets.splice(i, 1);
    }
  }

  function updateMission() {
    if (state.mission.completed) return;
    const pos = actorPosition();

    if (state.mission.step === 2 && distance(pos.x, pos.y, GARAGE.x, GARAGE.y) < 130) {
      if (state.wanted > 0) {
        if (!updateMission.warned) {
          showToast("警察を振り切ってからガレージに入れ");
          updateMission.warned = true;
        }
      } else if (state.player.inVehicle != null) {
        state.mission.step = 4;
        state.mission.completed = true;
        state.player.cash += 1500;
        showToast("MISSION COMPLETE +$1,500");
        saveGame(false);
      }
    } else {
      updateMission.warned = false;
    }
  }

  function updatePlayerOnFoot(dt) {
    let x = 0;
    let y = 0;
    let sprint = touch.boost || keys.has("shift");

    if (Math.abs(touch.x) > 0.03 || Math.abs(touch.y) > 0.03) {
      x = touch.x;
      y = touch.y;
      if (Math.hypot(x, y) > 0.92) sprint = true;
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
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      const nx = state.player.x + x * speed * dt;
      const ny = state.player.y + y * speed * dt;
      if (canStand(nx, state.player.y)) state.player.x = nx;
      if (canStand(state.player.x, ny)) state.player.y = ny;
    }
  }

  function update(dt) {
    if (state.paused || !dialogue.hidden || !helpPanel.hidden) return;

    state.player.fireCooldown = Math.max(0, state.player.fireCooldown - dt);
    if (state.player.reloadTimer > 0) {
      state.player.reloadTimer -= dt;
      if (state.player.reloadTimer <= 0) {
        const needed = 12 - state.player.magazine;
        const amount = Math.min(needed, state.player.ammo);
        state.player.magazine += amount;
        state.player.ammo -= amount;
      }
    }

    const vehicle = currentVehicle();
    if (vehicle) drivePlayerVehicle(vehicle, dt);
    else updatePlayerOnFoot(dt);

    for (const car of vehicles) {
      if (car.id === state.player.inVehicle || car.police || car.health <= 0) continue;
      updateTraffic(car, dt);
    }

    for (const cop of police) updatePolice(cop, dt);
    updatePedestrians(dt);
    updateBullets(dt);
    updateWanted(dt);
    updateMission();

    for (let i = vehicles.length - 1; i >= 0; i -= 1) {
      const car = vehicles[i];
      if (car.remove) {
        const policeIndex = police.indexOf(car);
        if (policeIndex >= 0) police.splice(policeIndex, 1);
        vehicles.splice(i, 1);
      }
    }

    state.time = (state.time + dt / 300) % 1;
    autosaveTimer += dt;
    if (autosaveTimer > 5) {
      autosaveTimer = 0;
      saveGame(false);
    }

    const p = actorPosition();
    const targetX = clamp(p.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
    const targetY = clamp(p.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
    const blend = 1 - Math.pow(0.88, dt * 60);
    state.camera.x += (targetX - state.camera.x) * blend;
    state.camera.y += (targetY - state.camera.y) * blend;
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
    ctx.fillStyle = "#71806f";
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const coastScreens = {
      left: COAST - state.camera.x,
      top: COAST - state.camera.y,
      right: WORLD_SIZE - COAST - state.camera.x,
      bottom: WORLD_SIZE - COAST - state.camera.y
    };

    ctx.fillStyle = "#356b78";
    if (coastScreens.left > 0) ctx.fillRect(0, 0, coastScreens.left, viewHeight);
    if (coastScreens.top > 0) ctx.fillRect(0, 0, viewWidth, coastScreens.top);
    if (coastScreens.right < viewWidth) ctx.fillRect(coastScreens.right, 0, viewWidth - coastScreens.right, viewHeight);
    if (coastScreens.bottom < viewHeight) ctx.fillRect(0, coastScreens.bottom, viewWidth, viewHeight - coastScreens.bottom);

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

    ctx.strokeStyle = "rgba(236,218,139,.55)";
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

    ctx.fillStyle = "#8d9290";
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

  function drawBuildings() {
    for (const building of buildings) {
      if (!visibleRect(building, 30)) continue;
      const x = building.x - state.camera.x;
      const y = building.y - state.camera.y;
      const base = Math.floor(96 * building.tint);
      const g = Math.floor(102 * building.tint);
      const b = Math.floor(108 * building.tint);

      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.fillRect(x + 10, y + 12, building.w, building.h);
      ctx.fillStyle = "rgb(" + base + "," + g + "," + b + ")";
      ctx.fillRect(x, y, building.w, building.h);

      ctx.fillStyle = building.kind === "warehouse" ? "#7a6e62" : "#777e83";
      ctx.fillRect(x + 7, y + 7, building.w - 14, 12);

      if (building.kind === "tower") {
        ctx.fillStyle = "rgba(178,211,225,.38)";
        const cols = Math.max(2, Math.floor(building.w / 46));
        const rows = Math.max(2, Math.floor(building.h / 48));
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            ctx.fillRect(x + 18 + cx * 42, y + 30 + cy * 44, 16, 10);
          }
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,.07)";
        ctx.fillRect(x + building.w * 0.18, y + building.h * 0.22, building.w * 0.64, 10);
      }
    }
  }

  function drawSpecialPlaces() {
    const contact = worldToScreen(CONTACT.x, CONTACT.y);
    ctx.fillStyle = "#f0c84b";
    ctx.beginPath();
    ctx.arc(contact.x, contact.y, 10, 0, Math.PI * 2);
    ctx.fill();

    const garage = worldToScreen(GARAGE.x, GARAGE.y);
    ctx.strokeStyle = "#f0c84b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(garage.x, garage.y, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(240,200,75,.08)";
    ctx.fill();

    const hospital = worldToScreen(HOSPITAL.x, HOSPITAL.y);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(hospital.x - 13, hospital.y - 4, 26, 8);
    ctx.fillRect(hospital.x - 4, hospital.y - 13, 8, 26);

    if (!state.mission.completed) {
      let target = null;
      if (state.mission.step === 0) target = CONTACT;
      if (state.mission.step === 2) target = GARAGE;
      if (target) {
        const p = worldToScreen(target.x, target.y);
        const pulse = 22 + Math.sin(performance.now() * 0.005) * 5;
        ctx.strokeStyle = "rgba(255,210,74,.8)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawVehicle(vehicle, now) {
    const p = worldToScreen(vehicle.x, vehicle.y);
    if (p.x < -90 || p.y < -90 || p.x > viewWidth + 90 || p.y > viewHeight + 90) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(vehicle.angle);

    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(-vehicle.length / 2 + 6, -vehicle.width / 2 + 7, vehicle.length, vehicle.width);

    ctx.fillStyle = vehicle.health <= 0 ? "#42484a" : vehicle.color;
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);

    ctx.fillStyle = vehicle.police ? "#183f69" : "#20282b";
    ctx.fillRect(-11, -vehicle.width / 2 + 5, 28, vehicle.width - 10);

    ctx.fillStyle = "#c7d8df";
    ctx.fillRect(-26, -vehicle.width / 2 + 6, 11, vehicle.width - 12);
    ctx.fillRect(20, -vehicle.width / 2 + 6, 11, vehicle.width - 12);

    ctx.fillStyle = "#16191a";
    ctx.fillRect(-28, -vehicle.width / 2 - 3, 13, 4);
    ctx.fillRect(16, -vehicle.width / 2 - 3, 13, 4);
    ctx.fillRect(-28, vehicle.width / 2 - 1, 13, 4);
    ctx.fillRect(16, vehicle.width / 2 - 1, 13, 4);

    if (vehicle.police && vehicle.health > 0) {
      const flash = Math.sin(now * 0.018 + vehicle.sirenPhase) > 0;
      ctx.fillStyle = flash ? "#ff5656" : "#4d8cff";
      ctx.fillRect(-3, -vehicle.width / 2 - 6, 8, 5);
    }

    if (state.player.inVehicle === vehicle.id) {
      ctx.strokeStyle = "rgba(255,255,255,.65)";
      ctx.lineWidth = 2;
      ctx.strokeRect(-vehicle.length / 2 - 3, -vehicle.width / 2 - 3, vehicle.length + 6, vehicle.width + 6);
    }

    ctx.restore();
  }

  function drawPedestrians() {
    for (const ped of pedestrians) {
      const p = worldToScreen(ped.x, ped.y);
      if (p.x < -30 || p.y < -30 || p.x > viewWidth + 30 || p.y > viewHeight + 30) continue;

      if (ped.down > 0) {
        ctx.fillStyle = "rgba(0,0,0,.24)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 14, 6, ped.dir, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.fillStyle = "rgba(0,0,0,.2)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 7, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(p.x - 5, p.y + 2, 10, 13);
    }
  }

  function drawBullets() {
    ctx.fillStyle = "#ffe7a3";
    for (const bullet of bullets) {
      const p = worldToScreen(bullet.x, bullet.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer() {
    if (state.player.inVehicle != null) return;
    const p = worldToScreen(state.player.x, state.player.y);
    ctx.fillStyle = "rgba(0,0,0,.24)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 9, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f0e9df";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 5, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#242b31";
    ctx.fillRect(p.x - 7, p.y + 3, 14, 19);

    const fx = state.player.facingX;
    const fy = state.player.facingY;
    ctx.strokeStyle = "#d1d6d8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + fx * 7, p.y + fy * 7);
    ctx.lineTo(p.x + fx * 18, p.y + fy * 18);
    ctx.stroke();
  }

  function drawNightOverlay() {
    const daylight = Math.max(0, Math.sin((state.time - 0.25) * Math.PI * 2));
    const alpha = 0.48 - daylight * 0.43;
    if (alpha <= 0.02) return;
    ctx.fillStyle = "rgba(10,16,32," + alpha.toFixed(3) + ")";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  }

  function drawCrosshair() {
    if (!mouse.active || state.player.inVehicle != null) return;
    ctx.strokeStyle = "rgba(255,255,255,.68)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 8, 0, Math.PI * 2);
    ctx.moveTo(mouse.x - 13, mouse.y);
    ctx.lineTo(mouse.x - 5, mouse.y);
    ctx.moveTo(mouse.x + 5, mouse.y);
    ctx.lineTo(mouse.x + 13, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 13);
    ctx.lineTo(mouse.x, mouse.y - 5);
    ctx.moveTo(mouse.x, mouse.y + 5);
    ctx.lineTo(mouse.x, mouse.y + 13);
    ctx.stroke();
  }

  function drawMinimap() {
    const w = minimap.width;
    const h = minimap.height;
    const p = actorPosition();
    const range = 1450;
    const scale = w / (range * 2);

    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "#121719";
    mctx.fillRect(0, 0, w, h);

    const startRoadX = Math.floor((p.x - range) / ROAD_GAP) - 1;
    const endRoadX = Math.ceil((p.x + range) / ROAD_GAP) + 1;
    const startRoadY = Math.floor((p.y - range) / ROAD_GAP) - 1;
    const endRoadY = Math.ceil((p.y + range) / ROAD_GAP) + 1;

    mctx.strokeStyle = "#555d60";
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

    if (!state.mission.completed) {
      if (state.mission.step === 0) dot(CONTACT.x, CONTACT.y, "#ffd24a", 5);
      if (state.mission.step === 2) dot(GARAGE.x, GARAGE.y, "#ffd24a", 5);
    }
    dot(HOSPITAL.x, HOSPITAL.y, "#ffffff", 3);

    for (const cop of police) {
      if (!cop.remove && cop.health > 0) dot(cop.x, cop.y, "#5b91ff", 3.2);
    }

    const facing = actorFacing();
    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.moveTo(w / 2 + facing.x * 9, h / 2 + facing.y * 9);
    mctx.lineTo(w / 2 - facing.y * 5 - facing.x * 5, h / 2 + facing.x * 5 - facing.y * 5);
    mctx.lineTo(w / 2 + facing.y * 5 - facing.x * 5, h / 2 - facing.x * 5 - facing.y * 5);
    mctx.closePath();
    mctx.fill();

    mctx.strokeStyle = "rgba(255,255,255,.25)";
    mctx.lineWidth = 2;
    mctx.strokeRect(4, 4, w - 8, h - 8);
  }

  function updateHUD() {
    const p = actorPosition();
    areaNameEl.textContent = currentDistrict(p.x, p.y);
    const hoursFloat = state.time * 24;
    const hours = Math.floor(hoursFloat) % 24;
    const minutes = Math.floor((hoursFloat - Math.floor(hoursFloat)) * 60);
    worldClockEl.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
    healthBar.style.width = state.player.health + "%";
    healthText.textContent = Math.ceil(state.player.health);
    cashText.textContent = "$" + Math.floor(state.player.cash).toLocaleString("en-US");

    if (state.player.reloadTimer > 0) ammoText.textContent = "RELOADING";
    else ammoText.textContent = state.player.magazine + " / " + state.player.ammo;

    const stars = clamp(Math.round(state.wanted), 0, 5);
    wantedStars.textContent = "★".repeat(stars) + "☆".repeat(5 - stars);
    wantedStatus.textContent = stars === 0 ? "CLEAR" : (state.wantedDecay > 0 ? "POLICE SEARCHING" : "ESCAPING");

    if (state.mission.completed) {
      missionTitle.textContent = "FREE ROAM";
      missionText.textContent = "街を自由に探索できる";
    } else if (state.mission.step === 0) {
      missionTitle.textContent = "Rinに会う";
      missionText.textContent = "黄色いマーカーへ向かえ";
    } else if (state.mission.step === 1) {
      missionTitle.textContent = "車を手に入れる";
      missionText.textContent = "近くの車でE / ACTION";
    } else if (state.mission.step === 2) {
      missionTitle.textContent = "NIGHT RUN";
      missionText.textContent = state.wanted > 0 ? "手配を振り切って港のガレージへ" : "港のガレージへ車を届けろ";
    }

    const interaction = nearestInteraction();
    if (interaction && dialogue.hidden && helpPanel.hidden) {
      interactionText.textContent = interaction.label;
      interactionPrompt.hidden = false;
    } else {
      interactionPrompt.hidden = true;
    }
  }

  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    drawGround();
    drawBuildings();
    drawSpecialPlaces();
    drawPedestrians();
    for (const vehicle of vehicles) drawVehicle(vehicle, now);
    drawBullets();
    drawPlayer();
    drawNightOverlay();
    drawCrosshair();
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
    if (fireQueued) {
      fireQueued = false;
      fireWeapon();
    }

    update(dt);

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.hidden = true;
    }

    render(now);
    requestAnimationFrame(frame);
  }

  function togglePause() {
    if (!dialogue.hidden) {
      closeDialogue();
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

  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "e", "f", "r", "shift"].includes(key)) {
      event.preventDefault();
    }

    if (key === "e" && !event.repeat) {
      actionQueued = true;
      return;
    }
    if (key === "f" && !event.repeat) {
      fireQueued = true;
      return;
    }
    if (key === "r" && !event.repeat) {
      reload();
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

  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.active = event.pointerType === "mouse";
  });

  canvas.addEventListener("pointerleave", () => {
    mouse.active = false;
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button === 0) {
      event.preventDefault();
      fireQueued = true;
    }
  });

  window.addEventListener("blur", () => {
    keys.clear();
    resetJoystick();
    touch.boost = false;
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
  fireButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    fireQueued = true;
  });
  boostButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touch.boost = true;
    try {
      boostButton.setPointerCapture(event.pointerId);
    } catch (_) {}
  });
  const stopBoost = () => { touch.boost = false; };
  boostButton.addEventListener("pointerup", stopBoost);
  boostButton.addEventListener("pointercancel", stopBoost);
  boostButton.addEventListener("lostpointercapture", stopBoost);

  dialogueClose.addEventListener("click", closeDialogue);
  helpButton.addEventListener("click", () => { helpPanel.hidden = false; });
  helpClose.addEventListener("click", () => { helpPanel.hidden = true; });
  saveButton.addEventListener("click", () => saveGame(true));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame(false);
  });
  window.addEventListener("pagehide", () => saveGame(false));

  generateBuildings();
  generateVehicles();
  generatePedestrians();
  loadGame();
  resize();

  if (!canStand(state.player.x, state.player.y, PLAYER_RADIUS)) {
    state.player.x = SPAWN.x;
    state.player.y = SPAWN.y;
  }

  state.camera.x = clamp(state.player.x - viewWidth / 2, 0, WORLD_SIZE - viewWidth);
  state.camera.y = clamp(state.player.y - viewHeight / 2, 0, WORLD_SIZE - viewHeight);

  showToast("NEON COUNTYへようこそ");
  requestAnimationFrame(frame);
})();
