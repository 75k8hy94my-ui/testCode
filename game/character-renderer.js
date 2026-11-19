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
    player:{ gender:"male", bodyType:"balanced", hairStyle:8, topStyle:3, bottomStyle:0, bottomGarment:"pants", accessory:"none", top:"#303942", bottom:"#313b42", hair:"#c8cbd9", hairAccent:"#d1b95e", accent:"#1fc7ef", skin:"#edbea0", shoe:"#272d2f" },
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
      rendererVersion:5,
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
      hairAccent:special?.hairAccent || null,
      hairGray:useGrayHair,
      top:chosenTop,
      bottom:special?.bottom || pick(BOTTOMS, seed, 53),
      shoe:special?.shoe || pick(SHOES, seed, 59),
      eye:special?.eye || pick(EYES, seed, 57),
      blush:hash(seed, 58) > .28,
      accent:special?.accent || shade(chosenTop, hash(seed, 61) > .5 ? 22 : -22),
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
      (a.x + b.x) / 2 + (b.y - a.y) * .018,
      (a.y + b.y) / 2 - (b.x - a.x) * .018,
      b.x,
      b.y
    );
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = fillWidth;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = Math.max(.7, fillWidth * .14);
    ctx.beginPath();
    ctx.moveTo(a.x - .7, a.y - .3);
    ctx.lineTo(b.x - .7, b.y - .3);
    ctx.stroke();
    ctx.restore();
  }

  function drawShoe(ctx, foot, facing, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(foot.x + facing.x * 1.4, foot.y + facing.y * .15);
    ctx.rotate(facing.x * .06);

    ctx.fillStyle = OUTLINE;
    roundedRect(ctx, -5.1, -2.4, 10.5, 4.9, 2.0);
    ctx.fill();

    ctx.fillStyle = color;
    roundedRect(ctx, -4.25, -1.75, 8.9, 3.45, 1.45);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,.82)";
    roundedRect(ctx, -3.8, 1.08, 8.0, .72, .34);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,.58)";
    ctx.lineWidth = .65;
    ctx.beginPath();
    ctx.moveTo(-2.1, -.9);
    ctx.lineTo(.7, -.9);
    ctx.moveTo(-1.8, -.25);
    ctx.lineTo(.9, -.25);
    ctx.stroke();
    ctx.restore();
  }

  function drawLowerGarment(ctx, ap, centerX, hipY, kneeY, bodyWidth) {
    const hipHalf = 7.2 * bodyWidth * (ap.hipScale || 1);

    if (ap.bottomGarment !== "skirt") {
      ctx.fillStyle = OUTLINE;
      roundedRect(ctx, centerX - hipHalf - .9, hipY - 2.1, hipHalf * 2 + 1.8, 7.5, 2.7);
      ctx.fill();

      ctx.fillStyle = ap.bottom;
      roundedRect(ctx, centerX - hipHalf, hipY - 1.25, hipHalf * 2, 5.9, 2.0);
      ctx.fill();

      ctx.strokeStyle = shade(ap.bottom, 31);
      ctx.lineWidth = .9;
      ctx.beginPath();
      ctx.moveTo(centerX, hipY + .2);
      ctx.lineTo(centerX, hipY + 4.2);
      ctx.stroke();

      if (ap.bottomStyle % 2 === 1) {
        ctx.fillStyle = "rgba(255,255,255,.18)";
        roundedRect(ctx, centerX - hipHalf * .78, hipY + .45, hipHalf * .46, 1.05, .45);
        roundedRect(ctx, centerX + hipHalf * .32, hipY + .45, hipHalf * .46, 1.05, .45);
        ctx.fill();
      }
      return;
    }

    const hemHalf = hipHalf * 1.38;
    const hemY = Math.min(kneeY + 4.0, hipY + 14.0);

    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.moveTo(centerX - hipHalf - .9, hipY - 1.6);
    ctx.lineTo(centerX + hipHalf + .9, hipY - 1.6);
    ctx.lineTo(centerX + hemHalf + .8, hemY + .8);
    ctx.lineTo(centerX - hemHalf - .8, hemY + .8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ap.bottom;
    ctx.beginPath();
    ctx.moveTo(centerX - hipHalf, hipY - .8);
    ctx.lineTo(centerX + hipHalf, hipY - .8);
    ctx.lineTo(centerX + hemHalf, hemY);
    ctx.lineTo(centerX - hemHalf, hemY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = shade(ap.bottom, 30);
    ctx.lineWidth = .85;
    for (const offset of [-.42,-.14,.14,.42]) {
      ctx.beginPath();
      ctx.moveTo(centerX + hipHalf * offset * .7, hipY + .6);
      ctx.lineTo(centerX + hemHalf * offset, hemY - .8);
      ctx.stroke();
    }
  }

  function drawHairBack(ctx, ap, cx, cy, rx, ry, facing) {
    const style = ap.hairStyle % 12;
    const longHair = [6,8,10].includes(style);
    const bob = [1,3,4,7].includes(style);
    const side = Math.sign(facing.x) || 1;
    const lower = longHair ? cy + ry * 1.52 : bob ? cy + ry * .92 : cy + ry * .66;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = shade(ap.hair, -5);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.7;

    ctx.beginPath();
    ctx.moveTo(cx - rx * .94, cy - ry * .22);
    ctx.bezierCurveTo(cx - rx * 1.02, cy - ry * .62, cx - rx * .72, cy - ry * .98, cx - rx * .34, cy - ry * .95);
    ctx.bezierCurveTo(cx - rx * .08, cy - ry * 1.10, cx + rx * .20, cy - ry * 1.06, cx + rx * .37, cy - ry * .94);
    ctx.bezierCurveTo(cx + rx * .70, cy - ry * 1.02, cx + rx * 1.00, cy - ry * .67, cx + rx * .95, cy - ry * .20);
    ctx.bezierCurveTo(cx + rx * 1.04, cy + ry * .15, cx + rx * .94, lower - ry * .18, cx + rx * .64, lower);
    if (longHair) {
      ctx.quadraticCurveTo(cx + rx * .32, lower + ry * .18, cx + rx * .12, lower - ry * .02);
      ctx.quadraticCurveTo(cx, lower + ry * .14, cx - rx * .16, lower - ry * .03);
      ctx.quadraticCurveTo(cx - rx * .42, lower + ry * .16, cx - rx * .68, lower - ry * .02);
    } else {
      ctx.quadraticCurveTo(cx, lower + ry * .12, cx - rx * .66, lower);
    }
    ctx.bezierCurveTo(cx - rx * .95, lower - ry * .17, cx - rx * 1.04, cy + ry * .14, cx - rx * .94, cy - ry * .22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (facing.y < -.36) {
      ctx.strokeStyle = shade(ap.hair, -29);
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(cx - rx * .42, cy - ry * .67);
      ctx.bezierCurveTo(cx - rx * .64, cy - ry * .28, cx - rx * .48, cy + ry * .26, cx - rx * .56, lower - ry * .14);
      ctx.moveTo(cx + rx * .32, cy - ry * .70);
      ctx.bezierCurveTo(cx + rx * .54, cy - ry * .18, cx + rx * .30, cy + ry * .32, cx + rx * .50, lower - ry * .17);
      ctx.stroke();
    }

    if (style === 8 || style === 10) {
      const px = cx - side * rx * .95;
      const py = cy + ry * .42;
      ctx.fillStyle = ap.hair;
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py - ry * .28);
      ctx.bezierCurveTo(px - side * rx * .25, py + ry * .02, px - side * rx * .23, py + ry * .62, px - side * rx * .02, py + ry * .78);
      ctx.bezierCurveTo(px + side * rx * .16, py + ry * .61, px + side * rx * .18, py + ry * .06, px, py - ry * .28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (style === 11) {
      for (const s of [-1, 1]) {
        const px = cx + s * rx * 1.02;
        const py = cy + ry * .24;
        ctx.fillStyle = ap.hair;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, py - ry * .24);
        ctx.bezierCurveTo(px + s * rx * .38, py - ry * .05, px + s * rx * .34, py + ry * .50, px, py + ry * .66);
        ctx.bezierCurveTo(px - s * rx * .17, py + ry * .42, px - s * rx * .18, py - ry * .04, px, py - ry * .24);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    if (ap.hairAccent) {
      ctx.strokeStyle = ap.hairAccent;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + rx * .12, cy - ry * .88);
      ctx.bezierCurveTo(cx + rx * .08, cy - ry * .50, cx + rx * .22, cy - ry * .18, cx + rx * .42, cy + ry * .08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHairFront(ctx, ap, cx, cy, rx, ry, facing, lod) {
    const style = ap.hairStyle % 12;
    const side = Math.sign(facing.x) || 1;
    const back = facing.y < -.36;
    if (back) return;

    const part = ((style % 3) - 1) * rx * .10;
    const fringeY = cy - ry * (style % 4 === 0 ? .25 : .32);

    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.fillStyle = ap.hair;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.00, cy - ry * .34);
    ctx.bezierCurveTo(cx - rx * 1.12, cy - ry * .87, cx - rx * .56, cy - ry * 1.13, cx - rx * .14, cy - ry * 1.00);
    ctx.bezierCurveTo(cx + rx * .39, cy - ry * 1.17, cx + rx * 1.08, cy - ry * .81, cx + rx * 1.00, cy - ry * .31);
    ctx.quadraticCurveTo(cx + rx * .97, cy - ry * .17, cx + rx * .78, fringeY + ry * .06);
    ctx.quadraticCurveTo(cx + rx * .69, fringeY + ry * .11, cx + rx * .52, fringeY - ry * .12);
    ctx.quadraticCurveTo(cx + rx * .36 + part, fringeY - ry * .28, cx + rx * .13 + part, fringeY + ry * .07);
    ctx.quadraticCurveTo(cx - rx * .05 + part, fringeY + ry * .13, cx - rx * .23 + part, fringeY - ry * .12);
    ctx.quadraticCurveTo(cx - rx * .40 + part, fringeY - ry * .27, cx - rx * .59, fringeY + ry * .05);
    ctx.quadraticCurveTo(cx - rx * .76, fringeY + ry * .13, cx - rx * 1.00, cy - ry * .34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // The long locks frame the cheeks without crossing the eyes.
    if ([3,6,8,10].includes(style)) {
      const lx = cx - side * rx * .91;
      ctx.fillStyle = shade(ap.hair, -4);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(lx, cy - ry * .22);
      ctx.bezierCurveTo(lx - side * rx * .20, cy + ry * .10, lx - side * rx * .18, cy + ry * .58, lx - side * rx * .05, cy + ry * .85);
      ctx.quadraticCurveTo(lx + side * rx * .19, cy + ry * .73, lx + side * rx * .18, cy + ry * .24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (ap.hairAccent) {
      ctx.fillStyle = ap.hairAccent;
      ctx.beginPath();
      ctx.moveTo(cx + rx * .10, cy - ry * .94);
      ctx.quadraticCurveTo(cx + rx * .14, cy - ry * .58, cx + rx * .47, fringeY - ry * .13);
      ctx.quadraticCurveTo(cx + rx * .29, cy - ry * .45, cx + rx * .25, cy - ry * .96);
      ctx.closePath();
      ctx.fill();
    }

    if (lod === "near") {
      ctx.strokeStyle = "rgba(255,255,255,.50)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(cx - rx * .62, cy - ry * .78);
      ctx.quadraticCurveTo(cx - rx * .39, cy - ry * .94, cx - rx * .15, cy - ry * .87);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,.25)";
      ctx.lineWidth = .75;
      ctx.beginPath();
      ctx.moveTo(cx + rx * .50, cy - ry * .81);
      ctx.quadraticCurveTo(cx + rx * .66, cy - ry * .84, cx + rx * .78, cy - ry * .70);
      ctx.stroke();
    }

    ctx.restore();
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
    const shoulder = 10.1 * body.width * body.shoulder * (ap.shoulderScale || 1) * (1 - profile * .09);
    const waist = 7.8 * body.width * (ap.waistScale || 1) * (1 - profile * .10);
    const hip = 8.2 * body.width * (ap.hipScale || 1) * (1 - profile * .07);
    const twist = pose.twist * facing.x * .26;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.fillStyle = ap.top;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(centerX - shoulder + twist, shoulderY);
    ctx.quadraticCurveTo(centerX - shoulder * 1.02, shoulderY + 5.8, centerX - waist, waistY);
    ctx.quadraticCurveTo(centerX - hip * .98, hipY - 3.5, centerX - hip, hipY);
    ctx.lineTo(centerX + hip, hipY);
    ctx.quadraticCurveTo(centerX + hip * .98, hipY - 3.5, centerX + waist, waistY);
    ctx.quadraticCurveTo(centerX + shoulder * 1.02, shoulderY + 5.8, centerX + shoulder + twist, shoulderY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const style = ap.topStyle % 10;
    if (lod !== "far") {
      if ([3,5,6].includes(style)) {
        ctx.fillStyle = "rgba(250,248,241,.92)";
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = .75;
        ctx.beginPath();
        ctx.moveTo(centerX - 4.5, shoulderY + .5);
        ctx.lineTo(centerX, shoulderY + 5.9);
        ctx.lineTo(centerX + 4.5, shoulderY + .5);
        ctx.lineTo(centerX + 2.2, shoulderY + 7.3);
        ctx.lineTo(centerX - 2.2, shoulderY + 7.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      if (style === 1 || style === 5 || style === 9) {
        ctx.strokeStyle = shade(ap.top, 35);
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(centerX, shoulderY + 2.8);
        ctx.lineTo(centerX, hipY - 1.2);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.70)";
        for (const yy of [shoulderY + 7.2, shoulderY + 11.0]) {
          ctx.beginPath();
          ctx.arc(centerX + .9, yy, .63, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (style === 2 || style === 7) {
        ctx.strokeStyle = shade(ap.accent, 34);
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(centerX, shoulderY + 2.4, shoulder * .55, Math.PI * .13, Math.PI * .87);
        ctx.stroke();
        ctx.fillStyle = ap.accent;
        ctx.beginPath();
        ctx.arc(centerX - 2.1, shoulderY + 6.9, .72, 0, Math.PI * 2);
        ctx.arc(centerX + 2.1, shoulderY + 6.9, .72, 0, Math.PI * 2);
        ctx.fill();
      }

      if (style === 4 || style === 8) {
        ctx.fillStyle = ap.accent;
        roundedRect(ctx, centerX - shoulder * .72, waistY - 1.35, shoulder * 1.44, 2.7, 1.15);
        ctx.fill();
      }

      if (lod === "near") {
        ctx.strokeStyle = "rgba(255,255,255,.22)";
        ctx.lineWidth = .75;
        ctx.beginPath();
        ctx.moveTo(centerX - shoulder * .67, shoulderY + 2.8);
        ctx.quadraticCurveTo(centerX - shoulder * .78, waistY - .8, centerX - hip * .70, hipY - 1.0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFace(ctx, ap, cx, cy, rx, ry, facing, pose, lod) {
    const back = facing.y < -.36;
    if (back) return;

    ctx.save();
    ctx.lineJoin = "round";
    ctx.fillStyle = ap.skin;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.55;

    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * .86);
    ctx.bezierCurveTo(cx + rx * .69, cy - ry * .91, cx + rx * .96, cy - ry * .54, cx + rx * .92, cy + ry * .08);
    ctx.bezierCurveTo(cx + rx * 1.06, cy + ry * .42, cx + rx * .89, cy + ry * .60, cx + rx * .62, cy + ry * .72);
    ctx.bezierCurveTo(cx + rx * .42, cy + ry * .89, cx + rx * .21, cy + ry * .95, cx, cy + ry * .96);
    ctx.bezierCurveTo(cx - rx * .21, cy + ry * .95, cx - rx * .42, cy + ry * .89, cx - rx * .62, cy + ry * .72);
    ctx.bezierCurveTo(cx - rx * .89, cy + ry * .60, cx - rx * 1.06, cy + ry * .42, cx - rx * .92, cy + ry * .08);
    ctx.bezierCurveTo(cx - rx * .96, cy - ry * .54, cx - rx * .69, cy - ry * .91, cx, cy - ry * .86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const turn = Math.max(-1, Math.min(1, facing.x));
    const absTurn = Math.abs(turn);
    const glance = pose.glance || 0;
    const eyeColor = ap.eye || "#8b5a15";
    const eyeY = cy + ry * .02;

    function drawAnimeEye(ex, sx, alpha, outer) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(ex, eyeY);
      ctx.scale(sx, 1);

      ctx.fillStyle = "#fffdf9";
      ctx.beginPath();
      ctx.moveTo(-3.35, -1.35);
      ctx.bezierCurveTo(-2.85, -3.95, 1.35, -4.15, 3.55, -1.45);
      ctx.bezierCurveTo(3.20, 1.45, 2.15, 3.35, .15, 3.75);
      ctx.bezierCurveTo(-1.75, 3.70, -3.20, 1.85, -3.35, -1.35);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = "rgba(61,44,46,.14)";
      ctx.beginPath();
      ctx.ellipse(0, -1.7, 3.4, 2.15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(.15, .65, 2.25, 2.95, 0, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = shade(eyeColor, -20);
      ctx.beginPath();
      ctx.ellipse(.15, .65, 2.25, 2.95, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.ellipse(.15, 1.45, 2.04, 2.10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#2c2322";
      ctx.beginPath();
      ctx.ellipse(.15, .10, .90, 1.54, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-.75, -1.12, .93, 0, Math.PI * 2);
      ctx.arc(.93, .84, .42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.90;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-3.45, -1.42);
      ctx.bezierCurveTo(-2.62, -4.30, 1.12, -4.35, 3.62, -1.48);
      ctx.stroke();

      ctx.strokeStyle = "rgba(105,71,67,.50)";
      ctx.lineWidth = .62;
      ctx.beginPath();
      ctx.moveTo(-2.75, 1.65);
      ctx.quadraticCurveTo(-.18, 4.58, 2.66, 1.60);
      ctx.stroke();

      if (ap.gender === "female" || outer) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(3.10, -2.05);
        ctx.lineTo(4.00, -2.72);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (absTurn < .78) {
      const shift = turn * 1.05 + glance * .28;
      drawAnimeEye(cx - 4.75 + shift, 1 - absTurn * .15, 1 - absTurn * .10, false);
      drawAnimeEye(cx + 4.75 + shift, 1 - absTurn * .03, 1, true);
    } else {
      drawAnimeEye(cx + turn * 2.25 + glance * .28, .80, 1, turn > 0);
    }

    if (lod === "near") {
      ctx.strokeStyle = "rgba(71,54,50,.65)";
      ctx.lineWidth = .82;
      ctx.lineCap = "round";
      if (absTurn < .78) {
        ctx.beginPath();
        ctx.moveTo(cx - 6.5 + turn * .7, cy - ry * .38);
        ctx.quadraticCurveTo(cx - 4.6 + turn * .7, cy - ry * .50, cx - 3.2 + turn * .7, cy - ry * .40);
        ctx.moveTo(cx + 3.2 + turn * .7, cy - ry * .40);
        ctx.quadraticCurveTo(cx + 4.6 + turn * .7, cy - ry * .50, cx + 6.5 + turn * .7, cy - ry * .38);
        ctx.stroke();
      }

      if (ap.blush !== false && facing.y > -.04) {
        ctx.fillStyle = "rgba(238,134,142,.30)";
        ctx.beginPath();
        ctx.ellipse(cx - 8.2 + turn * .5, cy + ry * .39, 3.05, 1.45, -.05, 0, Math.PI * 2);
        ctx.ellipse(cx + 8.2 + turn * .5, cy + ry * .39, 3.05, 1.45, .05, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#914d57";
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(cx - 1.45 + turn * .55, cy + ry * .56);
      ctx.quadraticCurveTo(cx + turn * .55, cy + ry * .68, cx + 1.45 + turn * .55, cy + ry * .56);
      ctx.stroke();

      if (ap.glasses && absTurn < .84) {
        ctx.strokeStyle = "rgba(45,45,47,.72)";
        ctx.lineWidth = .72;
        for (const ex of [cx - 4.75 + turn * .6, cx + 4.75 + turn * .6]) {
          ctx.beginPath();
          ctx.roundRect ? ctx.roundRect(ex - 4.15, eyeY - 4.55, 8.3, 8.8, 2.6) : roundedRect(ctx, ex - 4.15, eyeY - 4.55, 8.3, 8.8, 2.6);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(cx - .8 + turn * .6, eyeY - .8);
        ctx.lineTo(cx + .8 + turn * .6, eyeY - .8);
        ctx.stroke();
      }

      if (ap.ageGroup === "senior") {
        ctx.strokeStyle = "rgba(112,78,69,.16)";
        ctx.lineWidth = .5;
        ctx.beginPath();
        ctx.moveTo(cx - 2.6, cy - ry * .58);
        ctx.lineTo(cx - .7, cy - ry * .62);
        ctx.moveTo(cx + .7, cy - ry * .62);
        ctx.lineTo(cx + 2.6, cy - ry * .58);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "#914d57";
      ctx.lineWidth = .9;
      ctx.beginPath();
      ctx.moveTo(cx - 1.1, cy + ry * .56);
      ctx.lineTo(cx + 1.1, cy + ry * .56);
      ctx.stroke();
    }
    ctx.restore();
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
    const centerX = SPRITE_W / 2 + facing.x * pose.twist * .34;
    const baseline = BASELINE;
    const bob = pose.bob * .64 * stature;
    const footBaseY = baseline - bob * .16;

    // Chibi proportions: roughly 2.5 heads tall, with a short torso and short legs.
    const hipY = footBaseY - 20.8 * legScale;
    const waistY = hipY - 7.2 * stature;
    const shoulderY = hipY - 17.2 * stature * ap.posture;
    const headY = shoulderY - 11.3 * stature + bob * .12;
    const headRx = 14.5 * stature * (ap.faceWidthScale || 1) * (1 - Math.abs(facing.x) * .045);
    const headRy = 14.4 * stature * (ap.faceHeightScale || 1);

    const stride = 4.2 * pose.stride * ap.stride * ap.gait * stature;
    const lateral = Math.max(2.8, 4.1 * bodyWidth * (1 - Math.abs(facing.x) * .10));
    const leftHip = { x:centerX - lateral, y:hipY };
    const rightHip = { x:centerX + lateral, y:hipY };
    const leftKnee = {
      x:leftHip.x + facing.x * stride * .40 - .45,
      y:hipY + 9.7 * legScale - pose.liftL * 1.8
    };
    const rightKnee = {
      x:rightHip.x - facing.x * stride * .40 + .45,
      y:hipY + 9.7 * legScale - pose.liftR * 1.8
    };
    const leftFoot = {
      x:leftKnee.x + facing.x * stride * .40,
      y:footBaseY - pose.liftL * 2.9 + facing.y * stride * .08
    };
    const rightFoot = {
      x:rightKnee.x - facing.x * stride * .40,
      y:footBaseY - pose.liftR * 2.9 - facing.y * stride * .08
    };

    const shoulderHalf = 9.7 * bodyWidth * body.shoulder * (ap.shoulderScale || 1);
    const leftShoulder = { x:centerX - shoulderHalf, y:shoulderY + 1.0 };
    const rightShoulder = { x:centerX + shoulderHalf, y:shoulderY + 1.0 };
    const armTravel = 3.7 * pose.arm * stature * (ap.armSwing || 1);
    const leftElbow = {
      x:leftShoulder.x - facing.x * armTravel * .50 - .75,
      y:shoulderY + 6.9 * stature
    };
    const rightElbow = {
      x:rightShoulder.x + facing.x * armTravel * .50 + .75,
      y:shoulderY + 6.9 * stature
    };
    const leftWrist = {
      x:leftElbow.x - facing.x * armTravel * .30,
      y:leftElbow.y + 5.9 * stature
    };
    const rightWrist = {
      x:rightElbow.x + facing.x * armTravel * .30,
      y:rightElbow.y + 5.9 * stature
    };

    ctx.fillStyle = "rgba(17,21,20,.18)";
    ctx.beginPath();
    ctx.ellipse(centerX + 1.0, baseline + 2.3, 12.2 * bodyWidth, 3.0, 0, 0, Math.PI * 2);
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

    drawHairBack(ctx, ap, centerX + facing.x * .65, headY, headRx, headRy, facing);
    drawAccessoryBehind(ctx, ap, { x:centerX, y:(shoulderY + hipY) / 2 }, facing, .94);

    drawLimb(ctx, rearHip, rearKnee, 7.5, 5.5, ap.bottom, .75);
    drawLimb(ctx, rearKnee, rearFoot, 6.6, 4.7, ap.bottom, .75);
    drawShoe(ctx, rearFoot, facing, ap.shoe, .78);

    drawLimb(ctx, rearShoulder, rearElbow, 7.3, 5.3, ap.top, .72);
    drawLimb(ctx, rearElbow, rearWrist, 6.0, 4.2, sleeveShort ? ap.skin : ap.top, .72);

    drawTorso(ctx, ap, body, centerX, shoulderY, waistY, hipY, facing, pose, lod);
    drawLowerGarment(ctx, ap, centerX, hipY, (leftKnee.y + rightKnee.y) / 2, bodyWidth);

    drawLimb(ctx, frontHip, frontKnee, 7.8, 5.7, ap.bottom, 1);
    drawLimb(ctx, frontKnee, frontFoot, 6.7, 4.8, ap.bottom, 1);
    drawShoe(ctx, frontFoot, facing, ap.shoe, 1);

    drawLimb(ctx, frontShoulder, frontElbow, 7.5, 5.5, ap.top, 1);
    drawLimb(ctx, frontElbow, frontWrist, 6.1, 4.3, sleeveShort ? ap.skin : ap.top, 1);

    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(frontWrist.x, frontWrist.y + .25, 2.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ap.skin;
    ctx.beginPath();
    ctx.arc(frontWrist.x, frontWrist.y + .25, 2.0, 0, Math.PI * 2);
    ctx.fill();

    const faceX = centerX + facing.x * .85 + (pose.glance || 0) * .40;
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
      ap.bottomStyle, ap.bottomGarment, ap.accessory, ap.skin, ap.hair, ap.hairAccent, ap.eye, ap.top,
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
