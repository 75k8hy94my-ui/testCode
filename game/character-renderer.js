(function initCityDaysCharacterRenderer(global) {
  "use strict";

  const SPRITE_W = 80;
  const SPRITE_H = 108;
  const BASELINE = 100;
  const CACHE_LIMIT = 420;
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
  const EYES = ["#8b5a15","#5e79ad","#719451","#9a647f","#6f62a6","#4e8587"];
  const OUTLINE = "#2d292b";
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
      rendererVersion:4,
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
      eye:special?.eye || pick(EYES, seed, 57),
      blush:hash(seed, 58) > .28,
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
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = outlineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(
      (a.x + b.x) / 2 + (b.y - a.y) * .025,
      (a.y + b.y) / 2 - (b.x - a.x) * .02,
      b.x,
      b.y
    );
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = fillWidth;
    ctx.stroke();
    ctx.restore();
  }

  function drawShoe(ctx, foot, facing, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(foot.x + facing.x * 1.8, foot.y + facing.y * .25);
    ctx.rotate(facing.x * .08);
    ctx.fillStyle = OUTLINE;
    roundedRect(ctx, -4.8, -2.1, 9.8, 4.5, 2.0);
    ctx.fill();
    ctx.fillStyle = color;
    roundedRect(ctx, -4.0, -1.55, 8.4, 3.15, 1.45);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.62)";
    roundedRect(ctx, -3.4, 1.05, 7.5, .75, .35);
    ctx.fill();
    ctx.restore();
  }

  function drawLowerGarment(ctx, ap, centerX, hipY, kneeY, bodyWidth) {
    const hipHalf = 6.3 * bodyWidth * (ap.hipScale || 1);
    if (ap.bottomGarment !== "skirt") {
      ctx.fillStyle = OUTLINE;
      roundedRect(ctx, centerX - hipHalf - .8, hipY - 2.1, hipHalf * 2 + 1.6, 7.0, 2.4);
      ctx.fill();
      ctx.fillStyle = ap.bottom;
      roundedRect(ctx, centerX - hipHalf, hipY - 1.4, hipHalf * 2, 5.8, 1.9);
      ctx.fill();

      if (ap.bottomStyle % 3 === 1) {
        ctx.strokeStyle = shade(ap.bottom, 28);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, hipY - .2);
        ctx.lineTo(centerX, hipY + 4.1);
        ctx.stroke();
      }
      return;
    }

    const hemHalf = hipHalf * 1.34;
    const hemY = Math.min(kneeY + 4.5, hipY + 15.5);
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(centerX - hipHalf - .9, hipY - 1.4);
    ctx.lineTo(centerX + hipHalf + .9, hipY - 1.4);
    ctx.lineTo(centerX + hemHalf + .8, hemY + .8);
    ctx.lineTo(centerX - hemHalf - .8, hemY + .8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ap.bottom;
    ctx.beginPath();
    ctx.moveTo(centerX - hipHalf, hipY - .7);
    ctx.lineTo(centerX + hipHalf, hipY - .7);
    ctx.lineTo(centerX + hemHalf, hemY);
    ctx.lineTo(centerX - hemHalf, hemY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = shade(ap.bottom, 30);
    ctx.lineWidth = .85;
    for (const offset of [-.38, 0, .38]) {
      ctx.beginPath();
      ctx.moveTo(centerX + hemHalf * offset * .65, hipY + 1.2);
      ctx.lineTo(centerX + hemHalf * offset, hemY - 1.1);
      ctx.stroke();
    }
  }

  function drawHairBack(ctx, ap, cx, cy, rx, ry, facing) {
    const style = ap.hairStyle % 12;
    const side = Math.sign(facing.x) || 1;
    const longHair = [6,8,10].includes(style);
    const twinTail = style === 11;

    ctx.fillStyle = OUTLINE;
    if (longHair) {
      ctx.beginPath();
      ctx.ellipse(cx - side * 1.0, cy + ry * .48, rx * 1.14 + 1.2, ry * 1.25 + 1.5, -.04 * side, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(ap.hair, -8);
      ctx.beginPath();
      ctx.ellipse(cx - side * .8, cy + ry * .48, rx * 1.07, ry * 1.18, -.04 * side, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * .10, rx * 1.08 + 1.0, ry * .96 + 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(ap.hair, -7);
      ctx.beginPath();
      ctx.ellipse(cx, cy + ry * .10, rx * 1.02, ry * .90, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (style === 8 || style === 10) {
      const px = cx - side * rx * .98;
      const py = cy + ry * .35;
      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.ellipse(px, py, rx * .34 + .8, ry * .72 + .8, -.18 * side, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ap.hair;
      ctx.beginPath();
      ctx.ellipse(px, py, rx * .30, ry * .68, -.18 * side, 0, Math.PI * 2);
      ctx.fill();
    }

    if (twinTail) {
      for (const s of [-1, 1]) {
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.ellipse(cx + s * rx * 1.02, cy + ry * .18, rx * .36 + .8, ry * .52 + .8, s * .22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ap.hair;
        ctx.beginPath();
        ctx.ellipse(cx + s * rx * 1.02, cy + ry * .18, rx * .31, ry * .47, s * .22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawHairFront(ctx, ap, cx, cy, rx, ry, facing, lod) {
    const style = ap.hairStyle % 12;
    const side = Math.sign(facing.x) || 1;
    const back = facing.y < -.36;

    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.ellipse(cx, cy - ry * .40, rx * 1.07 + 1.1, ry * .67 + 1.0, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ap.hair;
    ctx.beginPath();
    ctx.ellipse(cx, cy - ry * .40, rx * 1.02, ry * .62, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    if (!back) {
      const part = ((style % 3) - 1) * rx * .12;
      const fringeY = cy - ry * .39;
      const lockBottom = cy - ry * .01;
      const starts = [-.82,-.46,-.10,.27,.62];
      ctx.fillStyle = OUTLINE;
      for (let i = 0; i < starts.length; i++) {
        const sx = cx + starts[i] * rx + part;
        const ex = cx + (starts[i] + .25 + (i % 2 ? .05 : -.03)) * rx + part;
        ctx.beginPath();
        ctx.moveTo(sx - 1.0, fringeY - 1.0);
        ctx.quadraticCurveTo((sx + ex) / 2, cy - ry * .22, ex, lockBottom + (i % 2) * 1.4);
        ctx.quadraticCurveTo(ex - 2.2 * side, cy - ry * .12, sx + 1.2, fringeY + .2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = ap.hair;
      for (let i = 0; i < starts.length; i++) {
        const sx = cx + starts[i] * rx + part;
        const ex = cx + (starts[i] + .25 + (i % 2 ? .05 : -.03)) * rx + part;
        ctx.beginPath();
        ctx.moveTo(sx, fringeY);
        ctx.quadraticCurveTo((sx + ex) / 2, cy - ry * .22, ex, lockBottom + (i % 2) * 1.4);
        ctx.quadraticCurveTo(ex - 1.8 * side, cy - ry * .13, sx + 1.2, fringeY + .1);
        ctx.closePath();
        ctx.fill();
      }

      if ([3,6,8,10].includes(style)) {
        const lockX = cx - side * rx * .90;
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.ellipse(lockX, cy + ry * .17, rx * .23 + .7, ry * .56 + .6, -.16 * side, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ap.hair;
        ctx.beginPath();
        ctx.ellipse(lockX, cy + ry * .17, rx * .19, ry * .51, -.16 * side, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (lod === "near") {
      ctx.strokeStyle = "rgba(255,255,255,.42)";
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(cx - rx * .12, cy - ry * .54, rx * .46, Math.PI * 1.05, Math.PI * 1.50);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.20)";
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.arc(cx + rx * .18, cy - ry * .50, rx * .30, Math.PI * 1.10, Math.PI * 1.44);
      ctx.stroke();
    }
  }

  function drawHair(ctx, ap, cx, cy, rx, ry, facing, lod) {
    drawHairFront(ctx, ap, cx, cy, rx, ry, facing, lod);
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
    ctx.fillStyle = OUTLINE;
    roundedRect(ctx, torso.x - 8.2 - facing.x * 1.8, torso.y - 10.5, 16.4, 20.5, 4.8);
    ctx.fill();
    ctx.fillStyle = shade(ap.accent, -28);
    roundedRect(ctx, torso.x - 7.1 - facing.x * 1.8, torso.y - 9.3, 14.2, 18.3, 4.0);
    ctx.fill();
    ctx.fillStyle = shade(ap.accent, 18);
    roundedRect(ctx, torso.x - 5.4 - facing.x * 1.8, torso.y + 2.0, 10.8, 5.1, 2.0);
    ctx.fill();
    ctx.restore();
  }

  function drawAccessoryFront(ctx, ap, torso, wrist, facing) {
    if (ap.accessory === "tote") {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.moveTo(wrist.x, wrist.y - 1.5);
      ctx.quadraticCurveTo(wrist.x + facing.x * 5.0, wrist.y + 5.0, wrist.x + facing.x * 2.2, wrist.y + 9.4);
      ctx.stroke();
      ctx.strokeStyle = shade(ap.accent, 18);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = OUTLINE;
      roundedRect(ctx, wrist.x - 5.4 + facing.x * 2.1, wrist.y + 5.6, 11.0, 10.5, 2.6);
      ctx.fill();
      ctx.fillStyle = shade(ap.accent, -4);
      roundedRect(ctx, wrist.x - 4.4 + facing.x * 2.1, wrist.y + 6.5, 9.0, 8.5, 2.0);
      ctx.fill();
    } else if (ap.accessory === "shoulder") {
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(torso.x - 5.7, torso.y - 9.4);
      ctx.lineTo(torso.x + 6.0, torso.y + 9.2);
      ctx.stroke();
      ctx.strokeStyle = "#786b5e";
      ctx.lineWidth = 1.15;
      ctx.stroke();

      ctx.fillStyle = OUTLINE;
      roundedRect(ctx, torso.x + 2.2, torso.y + 6.0, 10.4, 8.6, 2.5);
      ctx.fill();
      ctx.fillStyle = "#62564c";
      roundedRect(ctx, torso.x + 3.1, torso.y + 6.8, 8.6, 6.9, 1.9);
      ctx.fill();
    } else if (ap.accessory === "briefcase") {
      ctx.fillStyle = OUTLINE;
      roundedRect(ctx, wrist.x - 5.6, wrist.y + 2.0, 12.0, 9.2, 2.0);
      ctx.fill();
      ctx.fillStyle = "#54493f";
      roundedRect(ctx, wrist.x - 4.7, wrist.y + 2.8, 10.2, 7.5, 1.45);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.1;
      ctx.strokeRect(wrist.x - 1.7, wrist.y - .1, 5.2, 3.4);
    }
  }

  function drawTorso(ctx, ap, body, centerX, shoulderY, waistY, hipY, facing, pose, lod) {
    const profile = Math.abs(facing.x);
    const shoulder = 8.6 * body.width * body.shoulder * (ap.shoulderScale || 1) * (1 - profile * .10);
    const waist = 6.2 * body.width * (ap.waistScale || 1) * (1 - profile * .12);
    const hip = 6.7 * body.width * (ap.hipScale || 1) * (1 - profile * .08);
    const twist = pose.twist * facing.x * .34;

    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(centerX - shoulder - 1.0, shoulderY - .8);
    ctx.quadraticCurveTo(centerX - shoulder - 1.7, waistY - 2.0, centerX - hip - .8, hipY + 1.0);
    ctx.lineTo(centerX + hip + .8, hipY + 1.0);
    ctx.quadraticCurveTo(centerX + shoulder + 1.7, waistY - 2.0, centerX + shoulder + 1.0, shoulderY - .8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ap.top;
    ctx.beginPath();
    ctx.moveTo(centerX - shoulder + twist, shoulderY);
    ctx.quadraticCurveTo(centerX - shoulder * .92, waistY - 2.3, centerX - waist, waistY);
    ctx.lineTo(centerX - hip, hipY);
    ctx.lineTo(centerX + hip, hipY);
    ctx.lineTo(centerX + waist, waistY);
    ctx.quadraticCurveTo(centerX + shoulder * .92, waistY - 2.3, centerX + shoulder + twist, shoulderY);
    ctx.closePath();
    ctx.fill();

    const style = ap.topStyle % 10;
    if (lod === "far") return;

    if ([3,5,6].includes(style)) {
      ctx.fillStyle = "rgba(248,247,241,.88)";
      ctx.beginPath();
      ctx.moveTo(centerX - 4.1, shoulderY + .5);
      ctx.lineTo(centerX, shoulderY + 6.0);
      ctx.lineTo(centerX + 4.1, shoulderY + .5);
      ctx.lineTo(centerX + 2.4, shoulderY + 7.1);
      ctx.lineTo(centerX - 2.4, shoulderY + 7.1);
      ctx.closePath();
      ctx.fill();
    }

    if (style === 2 || style === 7) {
      ctx.strokeStyle = shade(ap.accent, 28);
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      ctx.arc(centerX, shoulderY + 3.0, shoulder * .56, Math.PI * .12, Math.PI * .88);
      ctx.stroke();
      ctx.fillStyle = shade(ap.accent, 18);
      ctx.beginPath();
      ctx.arc(centerX - 2.1, shoulderY + 7.2, .8, 0, Math.PI * 2);
      ctx.arc(centerX + 2.1, shoulderY + 7.2, .8, 0, Math.PI * 2);
      ctx.fill();
    }

    if (style === 1 || style === 5 || style === 9) {
      ctx.strokeStyle = shade(ap.top, 34);
      ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(centerX, shoulderY + 3.2);
      ctx.lineTo(centerX, hipY - 1.1);
      ctx.stroke();
      for (const yy of [shoulderY + 7.0, shoulderY + 11.2]) {
        ctx.fillStyle = "rgba(250,247,236,.70)";
        ctx.beginPath();
        ctx.arc(centerX + .8, yy, .65, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (style === 4 || style === 8) {
      ctx.fillStyle = shade(ap.accent, 10);
      roundedRect(ctx, centerX - shoulder * .72, waistY - 1.5, shoulder * 1.44, 3.1, 1.3);
      ctx.fill();
    }

    if (lod === "near") {
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.moveTo(centerX - shoulder * .68, shoulderY + 2.5);
      ctx.quadraticCurveTo(centerX - shoulder * .80, waistY - 1.0, centerX - hip * .74, hipY - 1.0);
      ctx.stroke();
    }
  }

  function drawFace(ctx, ap, cx, cy, rx, ry, facing, pose, lod) {
    const back = facing.y < -.36;
    const jaw = rx * (ap.jawScale || .76);

    const facePath = (ox = 0, oy = 0, expand = 0) => {
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy - ry - expand + oy);
      ctx.bezierCurveTo(
        cx + rx + expand + ox, cy - ry * .76 + oy,
        cx + rx * 1.04 + expand + ox, cy + ry * .28 + oy,
        cx + jaw + expand * .65 + ox, cy + ry * .67 + oy
      );
      ctx.quadraticCurveTo(cx + ox, cy + ry + expand + oy, cx - jaw - expand * .65 + ox, cy + ry * .67 + oy);
      ctx.bezierCurveTo(
        cx - rx * 1.04 - expand + ox, cy + ry * .28 + oy,
        cx - rx - expand + ox, cy - ry * .76 + oy,
        cx + ox, cy - ry - expand + oy
      );
      ctx.closePath();
    };

    ctx.fillStyle = OUTLINE;
    facePath(0, .3, 1.25);
    ctx.fill();

    ctx.fillStyle = ap.skin;
    facePath();
    ctx.fill();

    if (back) return;

    const turn = Math.max(-1, Math.min(1, facing.x));
    const absTurn = Math.abs(turn);
    const glance = pose.glance || 0;
    const eyeY = cy + ry * .06;
    const eyeColor = ap.eye || "#8b5a15";

    function drawAnimeEye(ex, scaleX, alpha = 1) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(ex, eyeY);
      ctx.scale(scaleX, 1);

      ctx.fillStyle = OUTLINE;
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.45, 5.25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fffdf8";
      ctx.beginPath();
      ctx.ellipse(0, .18, 3.55, 4.34, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = shade(eyeColor, -14);
      ctx.beginPath();
      ctx.ellipse(.18, .65, 2.75, 3.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(.18, 1.42, 2.28, 2.35, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#2a2221";
      ctx.beginPath();
      ctx.ellipse(.15, .45, 1.15, 1.72, 0, 0, Math.PI * 2);
      ctx.fill();

      if (lod === "near") {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(-.78, -1.25, 1.18, 0, Math.PI * 2);
        ctx.arc(.98, .25, .58, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.0;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-3.7, -3.15);
        ctx.quadraticCurveTo(0, -4.72, 3.8, -2.9);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (absTurn < .78) {
      const shift = turn * 1.25 + glance * .35;
      drawAnimeEye(cx - 5.0 + shift, 1 - absTurn * .17, 1 - absTurn * .12);
      drawAnimeEye(cx + 5.0 + shift, 1 - absTurn * .05, 1);
    } else {
      const eyeX = cx + turn * 2.35 + glance * .35;
      drawAnimeEye(eyeX, .78, 1);
    }

    if (lod === "near") {
      if (ap.blush !== false && facing.y > -.05) {
        ctx.fillStyle = "rgba(235,125,132,.20)";
        ctx.beginPath();
        ctx.ellipse(cx - 8.4 + turn * .7, cy + 5.3, 3.1, 1.55, -.08, 0, Math.PI * 2);
        ctx.ellipse(cx + 8.4 + turn * .7, cy + 5.3, 3.1, 1.55, .08, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#8d4c55";
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx - 1.8 + turn * .6, cy + 7.0);
      ctx.quadraticCurveTo(cx + turn * .6, cy + 8.4, cx + 1.8 + turn * .6, cy + 7.0);
      ctx.stroke();

      if (ap.glasses) {
        ctx.strokeStyle = "rgba(48,49,50,.82)";
        ctx.lineWidth = .85;
        ctx.beginPath();
        ctx.ellipse(cx - 5.0 + turn * .7, eyeY, 4.5, 5.0, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + 5.0 + turn * .7, eyeY, 4.5, 5.0, 0, 0, Math.PI * 2);
        ctx.moveTo(cx - .6, eyeY - .5);
        ctx.lineTo(cx + .6, eyeY - .5);
        ctx.stroke();
      }

      if (ap.ageGroup === "senior") {
        ctx.strokeStyle = "rgba(119,80,69,.20)";
        ctx.lineWidth = .55;
        ctx.beginPath();
        ctx.moveTo(cx - 3.4, cy - 5.0);
        ctx.quadraticCurveTo(cx - 1.7, cy - 5.7, cx - .2, cy - 5.1);
        ctx.moveTo(cx + .2, cy - 5.1);
        ctx.quadraticCurveTo(cx + 1.8, cy - 5.7, cx + 3.4, cy - 5.0);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "#8d4c55";
      ctx.lineWidth = .9;
      ctx.beginPath();
      ctx.moveTo(cx - 1.2, cy + 6.8);
      ctx.lineTo(cx + 1.2, cy + 6.8);
      ctx.stroke();
    }
  }

  function renderFrame(ap, dirIndex, state, frame, lod) {
    const pixelRatio = lod === "near" ? 2 : lod === "mid" ? 1.35 : 1;
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
    const centerX = SPRITE_W / 2 + facing.x * pose.twist * .42;
    const baseline = BASELINE;
    const bob = pose.bob * .75 * stature;
    const footBaseY = baseline - bob * .18;
    const hipY = footBaseY - 25.5 * legScale;
    const waistY = hipY - 8.6 * stature;
    const shoulderY = hipY - 20.8 * stature * ap.posture;
    const neckY = shoulderY - 4.5 * stature;
    const headY = neckY - 12.7 * stature + bob * .16;
    const headRx = 13.6 * stature * (ap.faceWidthScale || 1) * (1 - Math.abs(facing.x) * .05);
    const headRy = 13.8 * stature * (ap.faceHeightScale || 1);

    const stride = 5.0 * pose.stride * ap.stride * ap.gait * stature;
    const lateral = Math.max(2.2, 3.6 * bodyWidth * (1 - Math.abs(facing.x) * .14));
    const leftHip = { x:centerX - lateral, y:hipY };
    const rightHip = { x:centerX + lateral, y:hipY };
    const leftKnee = {
      x:leftHip.x + facing.x * stride * .44 - .55,
      y:hipY + 12.3 * legScale - pose.liftL * 2.2
    };
    const rightKnee = {
      x:rightHip.x - facing.x * stride * .44 + .55,
      y:hipY + 12.3 * legScale - pose.liftR * 2.2
    };
    const leftFoot = {
      x:leftKnee.x + facing.x * stride * .43,
      y:footBaseY - pose.liftL * 3.4 + facing.y * stride * .10
    };
    const rightFoot = {
      x:rightKnee.x - facing.x * stride * .43,
      y:footBaseY - pose.liftR * 3.4 - facing.y * stride * .10
    };

    const shoulderHalf = 8.1 * bodyWidth * body.shoulder * (ap.shoulderScale || 1);
    const leftShoulder = { x:centerX - shoulderHalf, y:shoulderY + .7 };
    const rightShoulder = { x:centerX + shoulderHalf, y:shoulderY + .7 };
    const armTravel = 4.3 * pose.arm * stature * (ap.armSwing || 1);
    const leftElbow = {
      x:leftShoulder.x - facing.x * armTravel * .55 - .9,
      y:shoulderY + 8.2 * stature
    };
    const rightElbow = {
      x:rightShoulder.x + facing.x * armTravel * .55 + .9,
      y:shoulderY + 8.2 * stature
    };
    const leftWrist = {
      x:leftElbow.x - facing.x * armTravel * .34,
      y:leftElbow.y + 7.0 * stature
    };
    const rightWrist = {
      x:rightElbow.x + facing.x * armTravel * .34,
      y:rightElbow.y + 7.0 * stature
    };

    ctx.fillStyle = "rgba(17,21,20,.18)";
    ctx.beginPath();
    ctx.ellipse(centerX + 1.2, baseline + 2.5, 11.6 * bodyWidth, 3.0, 0, 0, Math.PI * 2);
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
    const sleeveShort = [0,2,8].includes(ap.topStyle % 10);

    drawHairBack(ctx, ap, centerX + facing.x * .8, headY, headRx, headRy, facing);
    drawAccessoryBehind(ctx, ap, { x:centerX, y:(shoulderY + hipY) / 2 }, facing, .94);

    drawLimb(ctx, rearHip, rearKnee, 6.7, 4.9, ap.bottom, .75);
    drawLimb(ctx, rearKnee, rearFoot, 5.8, 4.1, ap.bottom, .75);
    drawShoe(ctx, rearFoot, facing, ap.shoe, .78);

    drawLimb(ctx, rearShoulder, rearElbow, 6.3, 4.6, ap.top, .72);
    drawLimb(ctx, rearElbow, rearWrist, 5.1, 3.5, sleeveShort ? ap.skin : ap.top, .72);

    drawTorso(ctx, ap, body, centerX, shoulderY, waistY, hipY, facing, pose, lod);
    drawLowerGarment(ctx, ap, centerX, hipY, (leftKnee.y + rightKnee.y) / 2, bodyWidth);

    drawLimb(ctx, frontHip, frontKnee, 6.9, 5.0, ap.bottom, 1);
    drawLimb(ctx, frontKnee, frontFoot, 5.9, 4.15, ap.bottom, 1);
    drawShoe(ctx, frontFoot, facing, ap.shoe, 1);

    drawLimb(ctx, frontShoulder, frontElbow, 6.5, 4.75, ap.top, 1);
    drawLimb(ctx, frontElbow, frontWrist, 5.2, 3.6, sleeveShort ? ap.skin : ap.top, 1);

    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(frontWrist.x, frontWrist.y + .3, 2.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ap.skin;
    ctx.beginPath();
    ctx.arc(frontWrist.x, frontWrist.y + .3, 1.85, 0, Math.PI * 2);
    ctx.fill();

    const faceX = centerX + facing.x * 1.0 + (pose.glance || 0) * .5;
    drawFace(ctx, ap, faceX, headY, headRx, headRy, facing, pose, lod);
    drawHairFront(ctx, ap, faceX, headY, headRx, headRy, facing, lod);
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
      ap.bottomStyle, ap.bottomGarment, ap.accessory, ap.skin, ap.hair, ap.eye, ap.top,
      ap.bottom, ap.shoe, ap.blush ? 1 : 0, ap.glasses ? 1 : 0
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
