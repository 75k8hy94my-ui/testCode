(function initCityDaysCharacterRenderer(global) {
  "use strict";

  const SPRITE_W = 64;
  const SPRITE_H = 88;
  const BASELINE = 80;
  const CACHE_LIMIT = 360;
  const cache = new Map();

  const BODY_TYPES = [
    { id:"balanced", height:1, width:1, leg:1, shoulder:1 },
    { id:"slim", height:1.01, width:.9, leg:1.03, shoulder:.92 },
    { id:"compact", height:.94, width:1.01, leg:.93, shoulder:.98 },
    { id:"tall", height:1.07, width:.96, leg:1.09, shoulder:.98 },
    { id:"broad", height:1.01, width:1.12, leg:.99, shoulder:1.12 }
  ];

  const SKINS = ["#f1c5a6","#e4b18f","#d59b78","#c48666","#b6795e"];
  const HAIRS = ["#242526","#332923","#4b362a","#6a4b35","#1f2325","#5a4030"];
  const TOPS = [
    "#49685d","#5e7892","#a06d61","#7a6e91","#81744e","#53656f",
    "#9a7153","#66785f","#7d5962","#53617c","#8b8b83","#3f5450"
  ];
  const BOTTOMS = ["#313a41","#46474e","#51443d","#374354","#4d5147","#3c3a3c","#665d52"];
  const SHOES = ["#202426","#383a39","#514941","#e5e1d7","#313844"];
  const GRAY_HAIRS = ["#777570","#8a8780","#aaa69d","#676866","#918d87"];
  const MALE_HAIR_STYLES = [0,1,2,3,4,5,11];
  const FEMALE_HAIR_STYLES = [1,3,4,6,8,10,11];

  const SPECIAL = {
    player:{ gender:"male", bodyType:"balanced", hairStyle:2, topStyle:3, bottomStyle:0, bottomGarment:"pants", accessory:"none", top:"#405c50", bottom:"#313b42", hair:"#332a24", skin:"#edbea0", shoe:"#272d2f" },
    aoi:{ gender:"female", bodyType:"tall", hairStyle:8, topStyle:6, bottomStyle:2, bottomGarment:"pants", accessory:"shoulder", top:"#c98f9d", bottom:"#42444b", hair:"#332923", skin:"#e8b596", shoe:"#3a3431" },
    sora:{ gender:"male", bodyType:"balanced", hairStyle:4, topStyle:4, bottomStyle:1, bottomGarment:"pants", accessory:"tote", top:"#7fa3be", bottom:"#3c4650", hair:"#292522", skin:"#efc1a2", shoe:"#30363a" },
    mei:{ gender:"female", bodyType:"slim", hairStyle:10, topStyle:8, bottomStyle:4, bottomGarment:"skirt", accessory:"backpack", top:"#ad9a74", bottom:"#41464b", hair:"#3d3028", skin:"#e9b99b", shoe:"#45413c" }
  };

  const WALK = [
    { stride: 1.00, liftL:0,   liftR:.18, bob:0,   twist:-1.00, arm:-1.00 },
    { stride: .62, liftL:.10,  liftR:.70, bob:1.0, twist:-.62, arm:-.62 },
    { stride: 0,   liftL:.68,  liftR:1.00, bob:1.6, twist:0,    arm:0 },
    { stride:-.62, liftL:.95,  liftR:.32, bob:1.0, twist:.62,  arm:.62 },
    { stride:-1.0, liftL:.18,  liftR:0,   bob:0,   twist:1.00, arm:1.00 },
    { stride:-.62, liftL:.70,  liftR:.10, bob:1.0, twist:.62,  arm:.62 },
    { stride: 0,   liftL:1.00, liftR:.68, bob:1.6, twist:0,    arm:0 },
    { stride: .62, liftL:.32,  liftR:.95, bob:1.0, twist:-.62, arm:-.62 }
  ];

  const IDLE = [
    { stride:0, liftL:0, liftR:0, bob:0,   twist:0, arm:0 },
    { stride:0, liftL:0, liftR:0, bob:.25, twist:.05, arm:.04 },
    { stride:0, liftL:0, liftR:0, bob:.45, twist:0, arm:0 },
    { stride:0, liftL:0, liftR:0, bob:.25, twist:-.05, arm:-.04 }
  ];

  const WAIT = [
    { stride:0, liftL:0, liftR:0, bob:0, twist:-.08, arm:-.08, glance:-.28 },
    { stride:0, liftL:0, liftR:0, bob:.15, twist:0, arm:0, glance:0 },
    { stride:0, liftL:0, liftR:0, bob:0, twist:.08, arm:.08, glance:.28 },
    { stride:0, liftL:0, liftR:0, bob:.12, twist:0, arm:0, glance:0 }
  ];

  function hash(seed, salt) {
    let h = Math.imul((seed | 0) ^ (salt | 0), 2654435761);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967295;
  }

  function pick(values, seed, salt) {
    return values[Math.floor(hash(seed, salt) * values.length) % values.length];
  }

  function shade(hex, amount) {
    if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return hex;
    const value = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (value >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
    const b = Math.max(0, Math.min(255, (value & 255) + amount));
    return "#" + [r,g,b].map((v) => Math.round(v).toString(16).padStart(2,"0")).join("");
  }

  function bodyById(id) {
    return BODY_TYPES.find((value) => value.id === id) || BODY_TYPES[0];
  }

  function ageGroupFor(age) {
    if (age <= 24) return "young";
    if (age <= 44) return "adult";
    if (age <= 64) return "mature";
    return "senior";
  }

  function createAppearance(seed, profile = {}) {
    const specialKey = profile.role === "player" ? "player" : profile.specialNpcId;
    const special = specialKey ? SPECIAL[specialKey] : null;
    const age = Math.max(18, Math.min(86, Number(profile.age) || 30));
    const ageGroup = ageGroupFor(age);
    const retired = profile.jobType === "retired" || ageGroup === "senior";
    const student = profile.jobType === "student" || age <= 22;
    const office = profile.jobType === "office";
    const gender = special?.gender || (profile.gender === "female" || profile.gender === "male"
      ? profile.gender
      : hash(seed, 7) < .5 ? "male" : "female");

    const bodyChoices = gender === "male"
      ? ["balanced","broad","tall","balanced","compact","slim"]
      : ["balanced","slim","compact","tall","balanced","broad"];
    const bodyType = special?.bodyType || bodyChoices[Math.floor(hash(seed, 11) * bodyChoices.length) % bodyChoices.length];

    const preferredHair = gender === "male" ? MALE_HAIR_STYLES : FEMALE_HAIR_STYLES;
    const crossoverHair = gender === "male" ? FEMALE_HAIR_STYLES : MALE_HAIR_STYLES;
    const hairPool = hash(seed, 13) > .82 ? crossoverHair : preferredHair;
    const hairStyle = special?.hairStyle ?? hairPool[Math.floor(hash(seed, 17) * hairPool.length) % hairPool.length];

    const topStyle = special?.topStyle ?? (
      office ? (hash(seed, 19) > .35 ? 5 : 1)
      : student ? Math.floor(hash(seed, 19) * 5)
      : Math.floor(hash(seed, 19) * 10)
    );
    const bottomStyle = special?.bottomStyle ?? Math.floor(hash(seed, 23) * 6) % 6;
    const bottomGarment = special?.bottomGarment || (
      gender === "female" && hash(seed, 25) > (office ? .72 : .64) ? "skirt" : "pants"
    );

    const accessoryRoll = hash(seed, 29);
    const accessory = special?.accessory || (
      office && accessoryRoll > .72 ? "briefcase"
      : student && accessoryRoll > .45 ? "backpack"
      : accessoryRoll > .86 ? "backpack"
      : accessoryRoll > .74 ? "tote"
      : accessoryRoll > .64 ? "shoulder"
      : "none"
    );

    const agePosture = ageGroup === "senior" ? .905 + hash(seed, 31) * .045
      : ageGroup === "mature" ? .955 + hash(seed, 31) * .035
      : .982 + hash(seed, 31) * .025;
    const genderHeight = gender === "male" ? 1.018 : .985;
    const ageHeight = ageGroup === "senior" ? .955 : ageGroup === "young" ? .992 : 1;
    const baseStature = specialKey === "player" ? 1.02 : (.95 + hash(seed, 37) * .11) * genderHeight * ageHeight;

    const grayChance = ageGroup === "senior" ? .72 : ageGroup === "mature" ? .20 : .015;
    const useGrayHair = !special?.hair && hash(seed, 39) < grayChance;
    const chosenTop = special?.top || pick(TOPS, seed, 47);

    return {
      rendererVersion:3,
      id:(specialKey || "citizen") + "-" + seed,
      seed,
      age,
      ageGroup,
      gender,
      bodyType,
      stature:baseStature,
      posture:agePosture,
      shoulderScale:gender === "male" ? 1.07 : .94,
      hipScale:gender === "female" ? 1.08 : .96,
      waistScale:gender === "female" ? .95 : 1.02,
      legScale:ageGroup === "senior" ? .96 : ageGroup === "young" ? 1.02 : 1,
      faceWidthScale:(gender === "female" ? .95 : 1.03) * (ageGroup === "young" ? 1.02 : 1),
      faceHeightScale:ageGroup === "senior" ? .98 : ageGroup === "young" ? 1.02 : 1,
      jawScale:gender === "female" ? .69 : .80,
      hairStyle,
      topStyle,
      bottomStyle,
      bottomGarment,
      accessory,
      skin:special?.skin || pick(SKINS, seed, 41),
      hair:special?.hair || (useGrayHair ? pick(GRAY_HAIRS, seed, 43) : pick(HAIRS, seed, 43)),
      hairGray:useGrayHair,
      top:chosenTop,
      bottom:special?.bottom || pick(BOTTOMS, seed, 53),
      shoe:special?.shoe || pick(SHOES, seed, 59),
      accent:shade(chosenTop, hash(seed, 61) > .5 ? 22 : -22),
      glasses:!specialKey && age > 34 && hash(seed, 67) > (ageGroup === "senior" ? .58 : .82),
      gait:(ageGroup === "senior" ? .80 : ageGroup === "mature" ? .92 : ageGroup === "young" ? 1.05 : 1) * (.96 + hash(seed, 71) * .08),
      stride:(ageGroup === "senior" ? .80 : ageGroup === "mature" ? .93 : ageGroup === "young" ? 1.04 : 1) * (.96 + hash(seed, 73) * .08),
      armSwing:(ageGroup === "senior" ? .82 : ageGroup === "mature" ? .94 : 1) * (.96 + hash(seed, 79) * .08)
    };
  }

  function createCanvas(width, height) {
    // Prefer a normal detached canvas for broad Safari/iOS compatibility.
    // OffscreenCanvas remains a fallback for worker-like environments.
    if (global.document?.createElement) {
      const canvas = global.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
    return null;
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function directionIndex(angle) {
    const full = Math.PI * 2;
    let normalized = angle % full;
    if (normalized < 0) normalized += full;
    return Math.round(normalized / (Math.PI / 4)) % 8;
  }

  function directionVector(index) {
    const angle = index * Math.PI / 4;
    return { x:Math.cos(angle), y:Math.sin(angle) };
  }

  function normalizeState(state) {
    if (state === "walking" || state === "walk" || state === "running") return "walk";
    if (state === "waiting" || state === "wait") return "wait";
    return "idle";
  }

  function frameIndex(state, phase, timeMs) {
    if (state === "walk") {
      const normalized = ((phase || 0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      return Math.floor(normalized / (Math.PI * 2) * WALK.length) % WALK.length;
    }
    const frames = state === "wait" ? WAIT.length : IDLE.length;
    return Math.floor((timeMs || 0) / (state === "wait" ? 620 : 760)) % frames;
  }

  function poseFor(state, frame) {
    if (state === "walk") return WALK[frame % WALK.length];
    if (state === "wait") return WAIT[frame % WAIT.length];
    return IDLE[frame % IDLE.length];
  }

  function drawLimb(ctx, a, b, outlineWidth, fillWidth, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(31,34,33,.34)";
    ctx.lineWidth = outlineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * .03, (a.y + b.y) / 2, b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = fillWidth;
    ctx.stroke();
    ctx.restore();
  }

  function drawShoe(ctx, foot, facing, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(foot.x + facing.x * 1.4, foot.y + facing.y * .35);
    ctx.rotate(facing.x * .10);
    ctx.fillStyle = "rgba(26,29,29,.34)";
    roundedRect(ctx, -3.6, -1.6, 7.4, 3.4, 1.4);
    ctx.fill();
    ctx.fillStyle = color;
    roundedRect(ctx, -3.4, -1.45, 7.1, 2.9, 1.3);
    ctx.fill();
    ctx.restore();
  }

  function drawLowerGarment(ctx, ap, centerX, hipY, kneeY, bodyWidth) {
    if (ap.bottomGarment !== "skirt") {
      ctx.fillStyle = ap.bottom;
      roundedRect(ctx, centerX - 5.2 * bodyWidth, hipY - 1.7, 10.4 * bodyWidth, 5.2, 1.8);
      ctx.fill();
      return;
    }

    const hipHalf = 5.7 * bodyWidth * (ap.hipScale || 1);
    const hemHalf = hipHalf * 1.18;
    const hemY = Math.min(kneeY + 3.5, hipY + 16);
    ctx.fillStyle = "rgba(30,33,32,.25)";
    ctx.beginPath();
    ctx.moveTo(centerX - hipHalf - .7, hipY - 1);
    ctx.lineTo(centerX + hipHalf + .7, hipY - 1);
    ctx.lineTo(centerX + hemHalf + .7, hemY + .7);
    ctx.lineTo(centerX - hemHalf - .7, hemY + .7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ap.bottom;
    ctx.beginPath();
    ctx.moveTo(centerX - hipHalf, hipY);
    ctx.lineTo(centerX + hipHalf, hipY);
    ctx.lineTo(centerX + hemHalf, hemY);
    ctx.lineTo(centerX - hemHalf, hemY);
    ctx.closePath();
    ctx.fill();
  }

  function drawHair(ctx, ap, cx, cy, rx, ry, facing, lod) {
    const style = ap.hairStyle % 12;
    const back = facing.y < -.28;
    ctx.fillStyle = shade(ap.hair, -12);

    if ([6,8,10].includes(style)) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * .24, rx * 1.08, ry * .98, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = ap.hair;
    ctx.beginPath();
    if (style === 0) {
      ctx.ellipse(cx, cy - ry * .43, rx * 1.02, ry * .60, 0, Math.PI, Math.PI * 2);
    } else if (style === 1) {
      ctx.ellipse(cx - facing.x * .6, cy - ry * .34, rx * 1.10, ry * .68, -.08 * facing.x, Math.PI, Math.PI * 2);
    } else if (style === 2) {
      ctx.ellipse(cx, cy - ry * .36, rx * 1.08, ry * .72, 0, Math.PI, Math.PI * 2);
    } else if (style === 3) {
      ctx.ellipse(cx + facing.x * .8, cy - ry * .31, rx * 1.04, ry * .73, .12 * facing.x, Math.PI, Math.PI * 2);
    } else if (style === 4) {
      ctx.ellipse(cx, cy - ry * .38, rx * 1.16, ry * .70, 0, Math.PI, Math.PI * 2);
    } else if (style === 5) {
      ctx.ellipse(cx, cy - ry * .45, rx * 1.02, ry * .58, 0, Math.PI, Math.PI * 2);
    } else {
      ctx.ellipse(cx, cy - ry * .30, rx * 1.12, ry * .72, 0, Math.PI, Math.PI * 2);
    }
    ctx.fill();

    if (style === 8 || style === 10) {
      ctx.beginPath();
      ctx.ellipse(cx - facing.x * rx * .95, cy + ry * .42, rx * .30, ry * .62, -.18 * facing.x, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 6) {
      ctx.beginPath();
      ctx.ellipse(cx + facing.x * rx * .92, cy + ry * .36, rx * .27, ry * .52, .14 * facing.x, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === 11) {
      ctx.beginPath();
      ctx.arc(cx - facing.x * rx * .8, cy - ry * .26, rx * .35, 0, Math.PI * 2);
      ctx.arc(cx + facing.x * rx * .8, cy - ry * .28, rx * .32, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!back && lod === "near") {
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.beginPath();
      ctx.ellipse(cx - rx * .28, cy - ry * .58, rx * .20, ry * .18, -.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAccessoryBehind(ctx, ap, torso, facing, alpha = 1) {
    if (ap.accessory !== "backpack") return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#47514e";
    roundedRect(ctx, torso.x - 6.6 - facing.x * 1.2, torso.y - 8.2, 13.2, 18.0, 3.8);
    ctx.fill();
    ctx.strokeStyle = "rgba(24,29,28,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawAccessoryFront(ctx, ap, torso, wrist, facing) {
    if (ap.accessory === "tote") {
      ctx.strokeStyle = shade(ap.accent, -20);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(wrist.x, wrist.y - 2);
      ctx.quadraticCurveTo(wrist.x + facing.x * 4, wrist.y + 5, wrist.x + facing.x * 2, wrist.y + 8);
      ctx.stroke();
      ctx.fillStyle = shade(ap.accent, -8);
      roundedRect(ctx, wrist.x - 4 + facing.x * 2, wrist.y + 5, 9, 9, 2);
      ctx.fill();
    } else if (ap.accessory === "shoulder") {
      ctx.strokeStyle = "rgba(41,38,35,.58)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(torso.x - 4, torso.y - 8);
      ctx.lineTo(torso.x + 5, torso.y + 9);
      ctx.stroke();
      ctx.fillStyle = "#5b5147";
      roundedRect(ctx, torso.x + 2, torso.y + 6, 8, 7, 2);
      ctx.fill();
    } else if (ap.accessory === "briefcase") {
      ctx.fillStyle = "#49433d";
      roundedRect(ctx, wrist.x - 4, wrist.y + 2, 10, 7, 1.5);
      ctx.fill();
      ctx.strokeStyle = "#2c2a28";
      ctx.lineWidth = 1;
      ctx.strokeRect(wrist.x - 1.5, wrist.y, 5, 3);
    }
  }

  function drawTorso(ctx, ap, body, centerX, shoulderY, waistY, hipY, facing, pose, lod) {
    const profile = Math.abs(facing.x);
    const shoulder = 7.5 * body.width * body.shoulder * (ap.shoulderScale || 1) * (1 - profile * .14);
    const waist = 4.8 * body.width * (ap.waistScale || 1) * (1 - profile * .19);
    const hip = 5.4 * body.width * (ap.hipScale || 1) * (1 - profile * .12);
    const twist = pose.twist * facing.x * .45;

    ctx.fillStyle = "rgba(30,33,32,.28)";
    ctx.beginPath();
    ctx.moveTo(centerX - shoulder - .7, shoulderY - .5);
    ctx.lineTo(centerX + shoulder + .7, shoulderY - .5);
    ctx.lineTo(centerX + hip + .7, hipY + .8);
    ctx.lineTo(centerX - hip - .7, hipY + .8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ap.top;
    ctx.beginPath();
    ctx.moveTo(centerX - shoulder + twist, shoulderY);
    ctx.quadraticCurveTo(centerX - shoulder * .95, waistY - 3, centerX - waist, waistY);
    ctx.lineTo(centerX - hip, hipY);
    ctx.lineTo(centerX + hip, hipY);
    ctx.lineTo(centerX + waist, waistY);
    ctx.quadraticCurveTo(centerX + shoulder * .95, waistY - 3, centerX + shoulder + twist, shoulderY);
    ctx.closePath();
    ctx.fill();

    const style = ap.topStyle % 10;
    if (lod !== "far") {
      if (style === 1 || style === 5) {
        ctx.strokeStyle = shade(ap.top, 28);
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(centerX, shoulderY + 1);
        ctx.lineTo(centerX, hipY - 1);
        ctx.stroke();
      }
      if (style === 2 || style === 6) {
        ctx.fillStyle = ap.accent;
        roundedRect(ctx, centerX - shoulder * .84, shoulderY + 1.5, shoulder * 1.68, 3.0, 1.2);
        ctx.fill();
      }
      if (style === 3 || style === 8) {
        ctx.strokeStyle = "rgba(247,247,239,.34)";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(centerX - shoulder * .78, waistY - 2);
        ctx.lineTo(centerX + shoulder * .78, waistY - 2);
        ctx.stroke();
      }
      if (style === 4) {
        ctx.fillStyle = shade(ap.top, -14);
        roundedRect(ctx, centerX - shoulder * .45, shoulderY - 1, shoulder * .90, 4, 2);
        ctx.fill();
      }
    }
  }

  function drawFace(ctx, ap, cx, cy, rx, ry, facing, pose, lod) {
    const back = facing.y < -.34;
    const jaw = rx * (ap.jawScale || .76);

    const facePath = (ox = 0, oy = 0, expand = 0) => {
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy - ry - expand + oy);
      ctx.bezierCurveTo(
        cx + rx + expand + ox, cy - ry * .82 + oy,
        cx + rx + expand + ox, cy + ry * .28 + oy,
        cx + jaw + expand * .6 + ox, cy + ry * .66 + oy
      );
      ctx.quadraticCurveTo(cx + ox, cy + ry + expand + oy, cx - jaw - expand * .6 + ox, cy + ry * .66 + oy);
      ctx.bezierCurveTo(
        cx - rx - expand + ox, cy + ry * .28 + oy,
        cx - rx - expand + ox, cy - ry * .82 + oy,
        cx + ox, cy - ry - expand + oy
      );
      ctx.closePath();
    };

    ctx.fillStyle = "rgba(49,42,37,.20)";
    facePath(.5, .8, .65);
    ctx.fill();

    ctx.fillStyle = ap.skin;
    facePath();
    ctx.fill();

    if (back || lod === "far") return;
    const faceTurn = facing.x * 1.15 + (pose.glance || 0);
    const profile = Math.abs(facing.x);
    const eyeY = cy - .5;

    ctx.fillStyle = "rgba(48,42,39,.74)";
    if (profile < .72) {
      ctx.beginPath();
      ctx.arc(cx - 1.45 + faceTurn * .35, eyeY, .48, 0, Math.PI * 2);
      ctx.arc(cx + 1.45 + faceTurn * .35, eyeY, .48, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx + faceTurn * .55, eyeY, .52, 0, Math.PI * 2);
      ctx.fill();
    }

    if (lod === "near") {
      ctx.strokeStyle = "rgba(123,71,62,.28)";
      ctx.lineWidth = .65;
      ctx.beginPath();
      ctx.moveTo(cx - .9 + faceTurn * .25, cy + 2.7);
      ctx.quadraticCurveTo(cx + faceTurn * .25, cy + 3.1, cx + .9 + faceTurn * .25, cy + 2.7);
      ctx.stroke();

      if (ap.glasses) {
        ctx.strokeStyle = "rgba(42,45,45,.55)";
        ctx.lineWidth = .65;
        ctx.strokeRect(cx - 3.1 + faceTurn * .2, cy - 1.6, 2.6, 2.0);
        ctx.strokeRect(cx + .5 + faceTurn * .2, cy - 1.6, 2.6, 2.0);
      }

      if (ap.ageGroup === "mature" || ap.ageGroup === "senior") {
        const alpha = ap.ageGroup === "senior" ? .22 : .12;
        ctx.strokeStyle = "rgba(92,65,57," + alpha + ")";
        ctx.lineWidth = .55;
        ctx.beginPath();
        ctx.moveTo(cx - 3.1, cy + .3);
        ctx.quadraticCurveTo(cx - 3.8, cy + 1.4, cx - 3.0, cy + 2.0);
        ctx.moveTo(cx + 3.1, cy + .3);
        ctx.quadraticCurveTo(cx + 3.8, cy + 1.4, cx + 3.0, cy + 2.0);
        ctx.stroke();
      }

      if (ap.ageGroup === "senior") {
        ctx.strokeStyle = "rgba(92,65,57,.18)";
        ctx.lineWidth = .5;
        ctx.beginPath();
        ctx.moveTo(cx - 2.4, cy - 2.9);
        ctx.lineTo(cx - .7, cy - 3.15);
        ctx.moveTo(cx + .7, cy - 3.15);
        ctx.lineTo(cx + 2.4, cy - 2.9);
        ctx.stroke();
      }
    }
  }

  function renderFrame(ap, dirIndex, state, frame, lod) {
    const pixelRatio = lod === "near" ? 1.5 : 1;
    const canvas = createCanvas(Math.round(SPRITE_W * pixelRatio), Math.round(SPRITE_H * pixelRatio));
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(pixelRatio, pixelRatio);

    const facing = directionVector(dirIndex);
    const body = bodyById(ap.bodyType);
    const pose = poseFor(state, frame);
    const stature = (ap.stature || 1) * body.height;
    const legScale = body.leg * stature * (ap.legScale || 1);
    const bodyWidth = body.width;
    const centerX = SPRITE_W / 2 + facing.x * pose.twist * .55;
    const baseline = BASELINE;
    const bob = pose.bob * stature;
    const footBaseY = baseline - bob * .15;
    const hipY = footBaseY - 28 * legScale;
    const waistY = hipY - 8.2 * stature;
    const shoulderY = hipY - 20.5 * stature * ap.posture;
    const neckY = shoulderY - 5.0 * stature;
    const headY = neckY - 7.0 * stature;
    const headRx = 5.0 * stature * (ap.faceWidthScale || 1) * (1 - Math.abs(facing.x) * .08);
    const headRy = 6.2 * stature * (ap.faceHeightScale || 1);

    const stride = 6.5 * pose.stride * ap.stride * ap.gait * stature;
    const lateral = Math.max(1.8, 3.2 * bodyWidth * (1 - Math.abs(facing.x) * .20));
    const leftHip = { x:centerX - lateral, y:hipY };
    const rightHip = { x:centerX + lateral, y:hipY };
    const leftKnee = {
      x:leftHip.x + facing.x * stride * .46 - .6,
      y:hipY + 13.8 * legScale - pose.liftL * 2.6
    };
    const rightKnee = {
      x:rightHip.x - facing.x * stride * .46 + .6,
      y:hipY + 13.8 * legScale - pose.liftR * 2.6
    };
    const leftFoot = {
      x:leftKnee.x + facing.x * stride * .42,
      y:footBaseY - pose.liftL * 3.8 + facing.y * stride * .12
    };
    const rightFoot = {
      x:rightKnee.x - facing.x * stride * .42,
      y:footBaseY - pose.liftR * 3.8 - facing.y * stride * .12
    };

    const shoulderHalf = 7.3 * bodyWidth * body.shoulder * (ap.shoulderScale || 1);
    const leftShoulder = { x:centerX - shoulderHalf, y:shoulderY };
    const rightShoulder = { x:centerX + shoulderHalf, y:shoulderY };
    const armTravel = 4.8 * pose.arm * stature * (ap.armSwing || 1);
    const leftElbow = {
      x:leftShoulder.x - facing.x * armTravel * .55 - 1.0,
      y:shoulderY + 8.8 * stature
    };
    const rightElbow = {
      x:rightShoulder.x + facing.x * armTravel * .55 + 1.0,
      y:shoulderY + 8.8 * stature
    };
    const leftWrist = {
      x:leftElbow.x - facing.x * armTravel * .38,
      y:leftElbow.y + 7.3 * stature
    };
    const rightWrist = {
      x:rightElbow.x + facing.x * armTravel * .38,
      y:rightElbow.y + 7.3 * stature
    };

    // Ground contact shadow is part of the cached sprite, so feet remain
    // visually anchored even when the walk frame changes.
    ctx.fillStyle = "rgba(17,21,20,.18)";
    ctx.beginPath();
    ctx.ellipse(centerX + 1.5, baseline + 2.4, 9.5 * bodyWidth, 2.7, 0, 0, Math.PI * 2);
    ctx.fill();

    const leftRear = facing.x > 0;
    const rearHip = leftRear ? leftHip : rightHip;
    const rearKnee = leftRear ? leftKnee : rightKnee;
    const rearFoot = leftRear ? leftFoot : rightFoot;
    const frontHip = leftRear ? rightHip : leftHip;
    const frontKnee = leftRear ? rightKnee : leftKnee;
    const frontFoot = leftRear ? rightFoot : leftFoot;
    const rearShoulder = leftRear ? leftShoulder : rightShoulder;
    const rearElbow = leftRear ? leftElbow : rightElbow;
    const rearWrist = leftRear ? leftWrist : rightWrist;
    const frontShoulder = leftRear ? rightShoulder : leftShoulder;
    const frontElbow = leftRear ? rightElbow : leftElbow;
    const frontWrist = leftRear ? rightWrist : leftWrist;

    drawLimb(ctx, rearHip, rearKnee, 5.6, 4.1, ap.bottom, .74);
    drawLimb(ctx, rearKnee, rearFoot, 4.9, 3.5, ap.bottom, .74);
    drawShoe(ctx, rearFoot, facing, ap.shoe, .76);
    drawLimb(ctx, rearShoulder, rearElbow, 5.0, 3.5, ap.top, .70);
    drawLimb(ctx, rearElbow, rearWrist, 4.0, 2.8, ap.topStyle === 0 ? ap.skin : ap.top, .70);

    drawAccessoryBehind(ctx, ap, { x:centerX, y:(shoulderY + hipY) / 2 }, facing, .92);
    drawTorso(ctx, ap, body, centerX, shoulderY, waistY, hipY, facing, pose, lod);

    drawLowerGarment(ctx, ap, centerX, hipY, (leftKnee.y + rightKnee.y) / 2, bodyWidth);

    drawLimb(ctx, frontHip, frontKnee, 5.9, 4.25, ap.bottom, 1);
    drawLimb(ctx, frontKnee, frontFoot, 5.0, 3.55, ap.bottom, 1);
    drawShoe(ctx, frontFoot, facing, ap.shoe, 1);
    drawLimb(ctx, frontShoulder, frontElbow, 5.2, 3.7, ap.top, 1);
    drawLimb(ctx, frontElbow, frontWrist, 4.1, 2.9, ap.topStyle === 0 ? ap.skin : ap.top, 1);

    const faceX = centerX + facing.x * 1.05 + (pose.glance || 0);
    drawFace(ctx, ap, faceX, headY, headRx, headRy, facing, pose, lod);
    drawHair(ctx, ap, faceX, headY, headRx, headRy, facing, lod);
    drawAccessoryFront(ctx, ap, { x:centerX, y:(shoulderY + hipY) / 2 }, frontWrist, facing);

    return canvas;
  }

  function cacheGet(key) {
    const value = cache.get(key);
    if (!value) return null;
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function cacheSet(key, value) {
    cache.set(key, value);
    while (cache.size > CACHE_LIMIT) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
  }

  function appearanceKey(ap) {
    return [
      ap.id, ap.gender, ap.ageGroup, ap.bodyType, ap.hairStyle, ap.topStyle,
      ap.bottomStyle, ap.bottomGarment, ap.accessory, ap.skin, ap.hair, ap.top,
      ap.bottom, ap.shoe, ap.glasses ? 1 : 0
    ].join("|");
  }

  function draw(ctx, options) {
    if (!ctx || !options?.appearance) return;
    const ap = options.appearance;
    const state = normalizeState(options.state);
    const dir = directionIndex(options.direction || 0);
    const lod = options.lod || "near";
    const frame = frameIndex(state, options.phase || 0, options.timeMs || 0);
    const key = appearanceKey(ap) + "|" + dir + "|" + state + "|" + frame + "|" + lod;

    let sprite = cacheGet(key);
    if (!sprite) {
      sprite = renderFrame(ap, dir, state, frame, lod);
      if (!sprite) return;
      cacheSet(key, sprite);
    }

    const scale = Number(options.scale) || 1;
    const width = SPRITE_W * scale;
    const height = SPRITE_H * scale;
    const x = options.x - width / 2;
    const y = options.y - BASELINE * scale;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, x, y, width, height);
    ctx.restore();
  }

  function clearCache() {
    cache.clear();
  }

  const api = Object.freeze({
    createAppearance,
    draw,
    clearCache,
    directionIndex,
    normalizeState,
    get cacheSize() { return cache.size; },
    constants:Object.freeze({
      directions:8,
      walkFrames:WALK.length,
      idleFrames:IDLE.length,
      waitFrames:WAIT.length
    })
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysCharacterRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
