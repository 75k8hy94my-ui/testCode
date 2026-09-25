(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
  const minimap = document.getElementById("minimap");
  const mctx = minimap.getContext("2d");

  const areaNameEl = document.getElementById("areaName");
  const worldClockEl = document.getElementById("worldClock");
  const coordsEl = document.getElementById("coords");
  const questTitleEl = document.getElementById("questTitle");
  const questProgressEl = document.getElementById("questProgress");
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
  const sprintButton = document.getElementById("sprintButton");

  const TILE = 48;
  const WORLD_TILES = 320;
  const WORLD_SIZE = TILE * WORLD_TILES;
  const SAVE_KEY = "testCodeOpenWorldSave:v1";
  const SPAWN = { x: WORLD_SIZE * 0.5, y: WORLD_SIZE * 0.5 };
  const PLAYER_RADIUS = 14;
  const WALK_SPEED = 205;
  const SPRINT_SPEED = 318;
  const CAMERA_LERP = 0.12;

  const terrainColors = {
    water: "#467c83",
    sand: "#c5ad79",
    grass: "#6b955e",
    forest: "#4f7c52",
    mountain: "#777b73"
  };

  const POIS = [
    { id: "town", name: "風見の町", x: SPAWN.x, y: SPAWN.y, radius: 520, color: "#e5c07b" },
    { id: "grove", name: "月影の森", x: SPAWN.x - 2600, y: SPAWN.y + 1300, radius: 450, color: "#77b77c" },
    { id: "ruins", name: "古代遺跡", x: SPAWN.x + 2700, y: SPAWN.y - 2100, radius: 420, color: "#b9a3d8" },
    { id: "cliffs", name: "赤岩の高地", x: SPAWN.x + 3300, y: SPAWN.y + 2700, radius: 500, color: "#cf8e6b" },
    { id: "lake", name: "蒼鏡湖", x: SPAWN.x - 3100, y: SPAWN.y - 2600, radius: 520, color: "#75b7c7" }
  ];

  const SHARDS = [
    { id: "s1", x: SPAWN.x + 650, y: SPAWN.y + 220 },
    { id: "s2", x: SPAWN.x - 2450, y: SPAWN.y + 1180 },
    { id: "s3", x: SPAWN.x + 2550, y: SPAWN.y - 1960 },
    { id: "s4", x: SPAWN.x + 3150, y: SPAWN.y + 2540 },
    { id: "s5", x: SPAWN.x - 2860, y: SPAWN.y - 2420 }
  ];

  const NPCS = [
    {
      id: "mira",
      name: "長老ミラ",
      x: SPAWN.x + 115,
      y: SPAWN.y - 65,
      color: "#e2b6cf"
    },
    {
      id: "ren",
      name: "旅人レン",
      x: SPAWN.x - 180,
      y: SPAWN.y + 125,
      color: "#9fc8e7"
    }
  ];

  const roads = [
    ["town", "grove"],
    ["town", "ruins"],
    ["town", "cliffs"]
  ];

  const tileCache = new Map();
  const keys = new Set();
  const touch = { x: 0, y: 0, sprint: false, pointerId: null };

  let viewWidth = window.innerWidth;
  let viewHeight = window.innerHeight;
  let dpr = 1;
  let actionQueued = false;
  let toastTimer = 0;
  let saveAccumulator = 0;
  let lastFrame = performance.now();

  const state = {
    player: {
      x: SPAWN.x,
      y: SPAWN.y + 70,
      facingX: 0,
      facingY: 1,
      stamina: 100
    },
    camera: {
      x: SPAWN.x - viewWidth / 2,
      y: SPAWN.y - viewHeight / 2
    },
    quest: {
      started: false,
      completed: false,
      collected: []
    },
    time: 0.31,
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

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function valueNoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash2(xi, yi, seed);
    const b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed);
    const d = hash2(xi + 1, yi + 1, seed);
    const u = smooth(xf);
    const v = smooth(yf);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return top + (bottom - top) * v;
  }

  function fbm(x, y, seed) {
    let value = 0;
    let amplitude = 0.56;
    let frequency = 1;
    let total = 0;
    for (let i = 0; i < 4; i += 1) {
      value += valueNoise(x * frequency, y * frequency, seed + i * 17) * amplitude;
      total += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / total;
  }

  function forcedLand(wx, wy) {
    for (const poi of POIS) {
      if (poi.id !== "lake" && distance(wx, wy, poi.x, poi.y) < Math.min(300, poi.radius * 0.65)) return true;
    }
    for (const shard of SHARDS) {
      if (distance(wx, wy, shard.x, shard.y) < 100) return true;
    }
    return false;
  }

  function makeTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
      return { type: "water", detail: 0 };
    }

    const wx = (tx + 0.5) * TILE;
    const wy = (ty + 0.5) * TILE;
    const nx = wx / 1750;
    const ny = wy / 1750;

    let elevation = fbm(nx, ny, 11);
    const moisture = fbm(nx + 40, ny - 23, 91);
    const edge = Math.min(wx, wy, WORLD_SIZE - wx, WORLD_SIZE - wy);
    if (edge < 850) elevation -= (850 - edge) / 1500;

    let type;
    if (elevation < 0.34) type = "water";
    else if (elevation < 0.39) type = "sand";
    else if (elevation > 0.73) type = "mountain";
    else if (moisture > 0.58) type = "forest";
    else type = "grass";

    if (forcedLand(wx, wy)) type = "grass";
    const lake = POIS.find((poi) => poi.id === "lake");
    if (distance(wx, wy, lake.x, lake.y) < 340) type = "water";

    return {
      type,
      detail: hash2(tx, ty, 301),
      detail2: hash2(tx, ty, 711)
    };
  }

  function getTile(tx, ty) {
    const key = tx + "," + ty;
    if (!tileCache.has(key)) {
      if (tileCache.size > 26000) tileCache.clear();
      tileCache.set(key, makeTile(tx, ty));
    }
    return tileCache.get(key);
  }

  function terrainAt(x, y) {
    return getTile(Math.floor(x / TILE), Math.floor(y / TILE)).type;
  }

  function canStand(x, y) {
    if (x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > WORLD_SIZE - PLAYER_RADIUS || y > WORLD_SIZE - PLAYER_RADIUS) return false;
    const probes = [
      [0, 0],
      [PLAYER_RADIUS * 0.7, 0],
      [-PLAYER_RADIUS * 0.7, 0],
      [0, PLAYER_RADIUS * 0.7],
      [0, -PLAYER_RADIUS * 0.7]
    ];
    return probes.every(([ox, oy]) => terrainAt(x + ox, y + oy) !== "water");
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

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.player) {
        const x = Number(saved.player.x);
        const y = Number(saved.player.y);
        if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 && x < WORLD_SIZE && y < WORLD_SIZE) {
          state.player.x = x;
          state.player.y = y;
        }
      }
      if (saved && saved.quest) {
        state.quest.started = Boolean(saved.quest.started);
        state.quest.completed = Boolean(saved.quest.completed);
        state.quest.collected = Array.isArray(saved.quest.collected)
          ? saved.quest.collected.filter((id) => SHARDS.some((shard) => shard.id === id))
          : [];
      }
      if (saved && Number.isFinite(Number(saved.time))) {
        state.time = ((Number(saved.time) % 1) + 1) % 1;
      }
    } catch (error) {
      console.warn("Could not load game save", error);
    }
  }

  function saveGame(showMessage = false) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        version: 1,
        player: {
          x: Math.round(state.player.x * 10) / 10,
          y: Math.round(state.player.y * 10) / 10
        },
        quest: state.quest,
        time: state.time,
        savedAt: Date.now()
      }));
      if (showMessage) showToast("冒険を保存しました");
    } catch (error) {
      console.warn("Could not save game", error);
      if (showMessage) showToast("保存できませんでした");
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = 2.4;
  }

  function closeDialogue() {
    dialogue.hidden = true;
  }

  function openDialogue(name, text) {
    dialogueName.textContent = name;
    dialogueText.textContent = text;
    dialogue.hidden = false;
  }

  function talkTo(npc) {
    if (npc.id === "mira") {
      if (!state.quest.started) {
        state.quest.started = true;
        openDialogue(
          npc.name,
          "この谷には、空から落ちた「星の欠片」が散らばっています。3つ見つけて持ち帰ってくれませんか。森や遺跡の近くを探してみてください。"
        );
        showToast("クエスト開始: 星の欠片");
      } else if (!state.quest.completed && state.quest.collected.length >= 3) {
        state.quest.completed = true;
        openDialogue(
          npc.name,
          "3つも見つけてくれたのですね。ありがとう。これで町の古い灯台を再び灯せます。残りの欠片も、世界のどこかで輝いているはずです。"
        );
        showToast("クエスト完了！");
      } else if (!state.quest.completed) {
        openDialogue(
          npc.name,
          "欠片は遠くからでも淡く光ります。まず3つ。焦らず谷を歩いてみてください。"
        );
      } else {
        openDialogue(npc.name, "世界はまだ広いですよ。森、高地、遺跡……好きな方角へ旅してみてください。");
      }
      return;
    }

    const terrain = terrainAt(state.player.x, state.player.y);
    const hints = {
      grass: "草原は歩きやすいですね。北東には古い遺跡があるそうです。",
      forest: "森では木々の影に光るものを見落とさないように。",
      sand: "水辺の砂地は遠回りの目印になります。",
      mountain: "高地は視界が開けます。赤岩の向こうにも道が続いています。"
    };
    openDialogue(npc.name, hints[terrain] || "湖は深い場所があります。岸沿いを進むのが安全です。");
  }

  function collectShard(shard) {
    if (state.quest.collected.includes(shard.id)) return;
    state.quest.collected.push(shard.id);
    showToast("星の欠片を入手 " + state.quest.collected.length + "/3");
    if (state.quest.collected.length >= 3 && !state.quest.completed) {
      showToast("3つ集まりました。長老ミラに報告しよう");
    }
    saveGame(false);
  }

  function nearestInteraction() {
    let best = null;
    let bestDistance = Infinity;

    for (const shard of SHARDS) {
      if (state.quest.collected.includes(shard.id)) continue;
      const d = distance(state.player.x, state.player.y, shard.x, shard.y);
      if (d < 66 && d < bestDistance) {
        best = { type: "shard", target: shard, label: "星の欠片を拾う" };
        bestDistance = d;
      }
    }

    for (const npc of NPCS) {
      const d = distance(state.player.x, state.player.y, npc.x, npc.y);
      if (d < 84 && d < bestDistance) {
        best = { type: "npc", target: npc, label: npc.name + "と話す" };
        bestDistance = d;
      }
    }

    return best;
  }

  function performAction() {
    if (!dialogue.hidden) {
      closeDialogue();
      return;
    }

    const item = nearestInteraction();
    if (!item) {
      showToast("近くに調べられるものはありません");
      return;
    }

    if (item.type === "shard") collectShard(item.target);
    if (item.type === "npc") talkTo(item.target);
  }

  function getMovement() {
    if (Math.abs(touch.x) > 0.03 || Math.abs(touch.y) > 0.03) {
      return { x: touch.x, y: touch.y, sprint: touch.sprint || Math.hypot(touch.x, touch.y) > 0.93 };
    }

    let x = 0;
    let y = 0;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    return { x, y, sprint: keys.has("shift") };
  }

  function update(dt) {
    if (state.paused || !dialogue.hidden || !helpPanel.hidden) return;

    const move = getMovement();
    const magnitude = Math.hypot(move.x, move.y);

    if (magnitude > 0.01) {
      const nx = move.x / Math.max(1, magnitude);
      const ny = move.y / Math.max(1, magnitude);
      const sprinting = move.sprint && state.player.stamina > 1;
      const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      const nextX = state.player.x + nx * speed * dt;
      const nextY = state.player.y + ny * speed * dt;

      if (canStand(nextX, state.player.y)) state.player.x = nextX;
      if (canStand(state.player.x, nextY)) state.player.y = nextY;

      state.player.facingX = nx;
      state.player.facingY = ny;

      if (sprinting) state.player.stamina = Math.max(0, state.player.stamina - dt * 23);
      else state.player.stamina = Math.min(100, state.player.stamina + dt * 14);
    } else {
      state.player.stamina = Math.min(100, state.player.stamina + dt * 18);
    }

    state.time = (state.time + dt / 240) % 1;

    const targetX = clamp(state.player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
    const targetY = clamp(state.player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));
    const cameraBlend = 1 - Math.pow(1 - CAMERA_LERP, dt * 60);
    state.camera.x += (targetX - state.camera.x) * cameraBlend;
    state.camera.y += (targetY - state.camera.y) * cameraBlend;

    saveAccumulator += dt;
    if (saveAccumulator >= 4) {
      saveAccumulator = 0;
      saveGame(false);
    }
  }

  function worldToScreen(x, y) {
    return { x: x - state.camera.x, y: y - state.camera.y };
  }

  function drawTerrain() {
    const startX = Math.max(0, Math.floor(state.camera.x / TILE) - 1);
    const startY = Math.max(0, Math.floor(state.camera.y / TILE) - 1);
    const endX = Math.min(WORLD_TILES - 1, Math.ceil((state.camera.x + viewWidth) / TILE) + 1);
    const endY = Math.min(WORLD_TILES - 1, Math.ceil((state.camera.y + viewHeight) / TILE) + 1);

    for (let ty = startY; ty <= endY; ty += 1) {
      for (let tx = startX; tx <= endX; tx += 1) {
        const tile = getTile(tx, ty);
        const sx = tx * TILE - state.camera.x;
        const sy = ty * TILE - state.camera.y;

        ctx.fillStyle = terrainColors[tile.type];
        ctx.fillRect(Math.floor(sx), Math.floor(sy), TILE + 1, TILE + 1);

        if (tile.type === "water" && tile.detail > 0.52) {
          ctx.strokeStyle = "rgba(220,245,244,.18)";
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(sx + 8, sy + 19 + tile.detail2 * 12);
          ctx.quadraticCurveTo(sx + 23, sy + 13 + tile.detail2 * 12, sx + 39, sy + 19 + tile.detail2 * 12);
          ctx.stroke();
        } else if (tile.type === "forest" && tile.detail > 0.39) {
          const cx = sx + 13 + tile.detail2 * 22;
          const cy = sy + 15 + tile.detail * 18;
          ctx.fillStyle = "rgba(27,72,43,.55)";
          ctx.beginPath();
          ctx.arc(cx, cy, 8 + tile.detail2 * 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(22,56,35,.45)";
          ctx.beginPath();
          ctx.arc(cx + 4, cy - 5, 6 + tile.detail * 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile.type === "mountain" && tile.detail > 0.56) {
          ctx.fillStyle = "rgba(55,58,55,.3)";
          ctx.beginPath();
          ctx.moveTo(sx + 9, sy + 36);
          ctx.lineTo(sx + 22 + tile.detail2 * 8, sy + 11);
          ctx.lineTo(sx + 40, sy + 36);
          ctx.closePath();
          ctx.fill();
        } else if (tile.type === "grass" && tile.detail > 0.82) {
          ctx.strokeStyle = "rgba(38,93,45,.38)";
          ctx.beginPath();
          ctx.moveTo(sx + 18, sy + 34);
          ctx.lineTo(sx + 15, sy + 25);
          ctx.moveTo(sx + 18, sy + 34);
          ctx.lineTo(sx + 22, sy + 24);
          ctx.stroke();
        }
      }
    }
  }

  function drawRoads() {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 17;
    ctx.strokeStyle = "rgba(181,156,112,.42)";

    for (const [aId, bId] of roads) {
      const a = POIS.find((poi) => poi.id === aId);
      const b = POIS.find((poi) => poi.id === bId);
      const sa = worldToScreen(a.x, a.y);
      const sb = worldToScreen(b.x, b.y);
      if (
        Math.max(sa.x, sb.x) < -30 ||
        Math.min(sa.x, sb.x) > viewWidth + 30 ||
        Math.max(sa.y, sb.y) < -30 ||
        Math.min(sa.y, sb.y) > viewHeight + 30
      ) continue;

      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPOIs() {
    for (const poi of POIS) {
      const p = worldToScreen(poi.x, poi.y);
      if (p.x < -140 || p.y < -140 || p.x > viewWidth + 140 || p.y > viewHeight + 140) continue;

      if (poi.id === "town") {
        const buildings = [
          [-62, -38, 44, 35],
          [18, -70, 52, 40],
          [-12, 34, 48, 38]
        ];
        for (const [ox, oy, w, h] of buildings) {
          ctx.fillStyle = "#c69c6d";
          ctx.fillRect(p.x + ox, p.y + oy, w, h);
          ctx.fillStyle = "#7f5f46";
          ctx.beginPath();
          ctx.moveTo(p.x + ox - 5, p.y + oy);
          ctx.lineTo(p.x + ox + w / 2, p.y + oy - 18);
          ctx.lineTo(p.x + ox + w + 5, p.y + oy);
          ctx.closePath();
          ctx.fill();
        }
      } else if (poi.id === "ruins") {
        ctx.fillStyle = "rgba(93,81,108,.7)";
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(p.x + i * 28 - 7, p.y - 18 - Math.abs(i) * 4, 14, 54 + Math.abs(i) * 4);
        }
        ctx.fillRect(p.x - 72, p.y + 27, 144, 14);
      } else if (poi.id === "cliffs") {
        ctx.fillStyle = "rgba(126,75,59,.65)";
        ctx.beginPath();
        ctx.moveTo(p.x - 95, p.y + 48);
        ctx.lineTo(p.x - 45, p.y - 42);
        ctx.lineTo(p.x - 2, p.y + 9);
        ctx.lineTo(p.x + 44, p.y - 56);
        ctx.lineTo(p.x + 96, p.y + 48);
        ctx.closePath();
        ctx.fill();
      } else if (poi.id === "grove") {
        for (let i = 0; i < 8; i += 1) {
          const angle = (i / 8) * Math.PI * 2;
          const x = p.x + Math.cos(angle) * 72;
          const y = p.y + Math.sin(angle) * 50;
          ctx.fillStyle = "rgba(31,91,56,.78)";
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const d = distance(state.player.x, state.player.y, poi.x, poi.y);
      if (d < poi.radius + 180 && poi.id !== "lake") {
        ctx.fillStyle = "rgba(8,16,12,.62)";
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(poi.name, p.x, p.y - 100);
      }
    }
  }

  function drawShards(now) {
    for (const shard of SHARDS) {
      if (state.quest.collected.includes(shard.id)) continue;
      const p = worldToScreen(shard.x, shard.y);
      if (p.x < -40 || p.y < -40 || p.x > viewWidth + 40 || p.y > viewHeight + 40) continue;

      const pulse = 1 + Math.sin(now * 0.005 + shard.x) * 0.12;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = "rgba(215,205,255,.17)";
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ded3ff";
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.lineTo(11, -2);
      ctx.lineTo(5, 15);
      ctx.lineTo(-6, 15);
      ctx.lineTo(-11, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawNPCs() {
    for (const npc of NPCS) {
      const p = worldToScreen(npc.x, npc.y);
      if (p.x < -50 || p.y < -50 || p.x > viewWidth + 50 || p.y > viewHeight + 50) continue;

      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 14, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = npc.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 7, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(p.x - 9, p.y + 2, 18, 24);

      ctx.fillStyle = "rgba(10,16,13,.72)";
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(npc.name, p.x, p.y - 27);
    }
  }

  function drawPlayer() {
    const p = worldToScreen(state.player.x, state.player.y);

    ctx.fillStyle = "rgba(0,0,0,.23)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 12, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f3eee6";
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#2f4b43";
    ctx.beginPath();
    ctx.arc(p.x + state.player.facingX * 6, p.y + state.player.facingY * 6, 4, 0, Math.PI * 2);
    ctx.fill();

    const barW = 44;
    const barX = p.x - barW / 2;
    const barY = p.y + 25;
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fillRect(barX, barY, barW, 4);
    ctx.fillStyle = state.player.stamina > 25 ? "#d6e8b1" : "#e8b6a7";
    ctx.fillRect(barX, barY, barW * (state.player.stamina / 100), 4);
  }

  function drawNightOverlay() {
    const daylight = Math.max(0, Math.sin((state.time - 0.25) * Math.PI * 2));
    const alpha = 0.52 - daylight * 0.46;
    if (alpha <= 0.02) return;
    ctx.fillStyle = "rgba(12,19,37," + alpha.toFixed(3) + ")";
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  }

  function drawWorldBoundary() {
    const left = -state.camera.x;
    const top = -state.camera.y;
    const right = WORLD_SIZE - state.camera.x;
    const bottom = WORLD_SIZE - state.camera.y;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }

  function currentArea() {
    let nearest = null;
    let best = Infinity;
    for (const poi of POIS) {
      const d = distance(state.player.x, state.player.y, poi.x, poi.y);
      if (d < poi.radius && d < best) {
        nearest = poi;
        best = d;
      }
    }
    if (nearest) return nearest.name;

    const type = terrainAt(state.player.x, state.player.y);
    return {
      water: "蒼い水辺",
      sand: "風紋の浜",
      grass: "アスター草原",
      forest: "深緑の森",
      mountain: "石灰の高地"
    }[type] || "Aster Vale";
  }

  function updateHUD() {
    areaNameEl.textContent = currentArea();
    const hoursFloat = state.time * 24;
    const hours = Math.floor(hoursFloat) % 24;
    const minutes = Math.floor((hoursFloat - Math.floor(hoursFloat)) * 60);
    worldClockEl.textContent = String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
    coordsEl.textContent =
      "X " + Math.round(state.player.x) + " / Y " + Math.round(state.player.y);

    if (!state.quest.started) {
      questTitleEl.textContent = "街の長老ミラと話そう";
      questProgressEl.textContent = "風見の町で長老を探す";
    } else if (!state.quest.completed && state.quest.collected.length < 3) {
      questTitleEl.textContent = "星の欠片を3つ集める";
      questProgressEl.textContent = state.quest.collected.length + " / 3";
    } else if (!state.quest.completed) {
      questTitleEl.textContent = "長老ミラに報告する";
      questProgressEl.textContent = "風見の町へ戻ろう";
    } else {
      questTitleEl.textContent = "自由探索";
      questProgressEl.textContent = "見つけた欠片 " + state.quest.collected.length + " / " + SHARDS.length;
    }

    const interaction = nearestInteraction();
    if (interaction && dialogue.hidden && helpPanel.hidden) {
      interactionText.textContent = interaction.label;
      interactionPrompt.hidden = false;
    } else {
      interactionPrompt.hidden = true;
    }
  }

  function drawMinimap() {
    const w = minimap.width;
    const h = minimap.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "#15231d";
    mctx.fillRect(0, 0, w, h);

    mctx.strokeStyle = "rgba(255,255,255,.13)";
    mctx.lineWidth = 2;
    mctx.strokeRect(5, 5, w - 10, h - 10);

    for (const poi of POIS) {
      const x = 6 + (poi.x / WORLD_SIZE) * (w - 12);
      const y = 6 + (poi.y / WORLD_SIZE) * (h - 12);
      mctx.fillStyle = poi.color;
      mctx.beginPath();
      mctx.arc(x, y, poi.id === "town" ? 5 : 3.5, 0, Math.PI * 2);
      mctx.fill();
    }

    if (state.quest.started && !state.quest.completed) {
      for (const shard of SHARDS) {
        if (state.quest.collected.includes(shard.id)) continue;
        const x = 6 + (shard.x / WORLD_SIZE) * (w - 12);
        const y = 6 + (shard.y / WORLD_SIZE) * (h - 12);
        mctx.fillStyle = "#ded3ff";
        mctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }

    const px = 6 + (state.player.x / WORLD_SIZE) * (w - 12);
    const py = 6 + (state.player.y / WORLD_SIZE) * (h - 12);
    mctx.fillStyle = "#ffffff";
    mctx.beginPath();
    mctx.arc(px, py, 4.5, 0, Math.PI * 2);
    mctx.fill();

    mctx.strokeStyle = "rgba(255,255,255,.55)";
    mctx.beginPath();
    mctx.moveTo(px, py);
    mctx.lineTo(px + state.player.facingX * 9, py + state.player.facingY * 9);
    mctx.stroke();
  }

  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    drawTerrain();
    drawRoads();
    drawPOIs();
    drawShards(now);
    drawNPCs();
    drawPlayer();
    drawWorldBoundary();
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
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "e", "shift"].includes(key)) {
      event.preventDefault();
    }

    if ((key === "e" || key === " ") && !event.repeat) {
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
    touch.sprint = false;
  });

  joystick.addEventListener("pointerdown", (event) => {
    touch.pointerId = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });

  joystick.addEventListener("pointermove", (event) => {
    if (touch.pointerId !== event.pointerId) return;
    updateJoystick(event);
  });

  joystick.addEventListener("pointerup", (event) => {
    if (touch.pointerId !== event.pointerId) return;
    resetJoystick();
  });

  joystick.addEventListener("pointercancel", resetJoystick);

  actionButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    actionQueued = true;
  });

  sprintButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    touch.sprint = true;
    try {
      sprintButton.setPointerCapture(event.pointerId);
    } catch (_) {}
  });

  const stopSprint = () => {
    touch.sprint = false;
  };
  sprintButton.addEventListener("pointerup", stopSprint);
  sprintButton.addEventListener("pointercancel", stopSprint);
  sprintButton.addEventListener("lostpointercapture", stopSprint);

  dialogueClose.addEventListener("click", closeDialogue);
  helpButton.addEventListener("click", () => {
    helpPanel.hidden = false;
  });
  helpClose.addEventListener("click", () => {
    helpPanel.hidden = true;
  });
  saveButton.addEventListener("click", () => saveGame(true));

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame(false);
  });
  window.addEventListener("pagehide", () => saveGame(false));

  loadGame();
  resize();

  if (!canStand(state.player.x, state.player.y)) {
    state.player.x = SPAWN.x;
    state.player.y = SPAWN.y + 70;
  }

  state.camera.x = clamp(state.player.x - viewWidth / 2, 0, Math.max(0, WORLD_SIZE - viewWidth));
  state.camera.y = clamp(state.player.y - viewHeight / 2, 0, Math.max(0, WORLD_SIZE - viewHeight));

  showToast("Aster Valeへようこそ");
  requestAnimationFrame(frame);
})();
