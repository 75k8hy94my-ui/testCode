(function initCityDaysHomeFixtures(global) {
  "use strict";

  const freezeVisual = (visual) => Object.freeze({ ...visual });
  const freezeCollision = (collision) => Object.freeze({ ...collision, ...(collision.from ? { from:Object.freeze({ ...collision.from }) } : {}), ...(collision.to ? { to:Object.freeze({ ...collision.to }) } : {}) });

  const FIXTURES = Object.freeze([
    { id:"bed", label:"ベッド", x:62, y:60, w:190, h:112, interactX:260, interactY:125, range:72, visuals:[
      { kind:"rect", role:"base", x:62, y:60, w:190, h:112, radius:12, fill:"#d8ddd7", solid:true },
      { kind:"rect", role:"pillow", x:70, y:68, w:174, h:38, radius:8, fill:"#f0eee7", solid:true },
      { kind:"rect", role:"blanket", x:70, y:110, w:174, h:58, radius:7, fill:"#7891a2", solid:true }
    ], collisions:[{ kind:"rect", x:62, y:60, w:190, h:112 }] },
    { id:"shower", label:"シャワー", x:70, y:318, w:118, h:118, interactX:208, interactY:372, range:68, visuals:[
      { kind:"rect", role:"base", x:70, y:318, w:118, h:118, radius:10, fill:"#d9e1df", solid:true },
      { kind:"rect", role:"pan", x:84, y:332, w:90, h:90, radius:8, fill:"#9fbfc5", solid:true },
      { kind:"circle", role:"drain", x:129, y:377, radius:18, fill:"transparent", stroke:"rgba(255,255,255,.55)", thickness:2, solid:true }
    ], collisions:[{ kind:"rect", x:70, y:318, w:118, h:118 }] },
    { id:"kitchen", label:"キッチン", x:510, y:55, w:205, h:82, interactX:505, interactY:153, range:78, visuals:[
      { kind:"rect", role:"base", x:510, y:55, w:205, h:82, radius:8, fill:"#9b8b74", solid:true },
      { kind:"rect", role:"sink", x:525, y:67, w:58, h:42, radius:5, fill:"#d6d8d2", solid:true },
      { kind:"circle", role:"burner-a", x:629, y:87, radius:11, fill:"#333837", solid:true },
      { kind:"circle", role:"burner-b", x:668, y:87, radius:11, fill:"#333837", solid:true }
    ], collisions:[{ kind:"rect", x:510, y:55, w:205, h:82 }] },
    { id:"dining-table", label:"食卓", x:326, y:88, w:128, h:78, interactX:390, interactY:178, range:68, visuals:[
      { kind:"rect", role:"base", x:326, y:88, w:128, h:78, radius:10, fill:"#9b7657", solid:true },
      { kind:"ellipse", role:"place-setting", x:390, y:127, rx:13, ry:13, fill:"rgba(255,245,224,.72)", solid:true }
    ], collisions:[{ kind:"rect", x:326, y:88, w:128, h:78 }] },
    { id:"worktable", label:"作業机", x:176, y:194, w:104, h:62, interactX:228, interactY:268, range:70, visuals:[
      { kind:"rect", role:"base", x:176, y:194, w:104, h:62, radius:7, fill:"#8d6749", solid:true },
      { kind:"rect", role:"machine-body", x:191, y:207, w:46, h:29, radius:4, fill:"#d7ddd7", solid:true },
      { kind:"line", role:"machine-needle", from:{ x:217, y:211 }, to:{ x:217, y:233 }, thickness:3, stroke:"#5a655f", solid:true },
      { kind:"line", role:"machine-foot", from:{ x:209, y:232 }, to:{ x:237, y:232 }, thickness:3, stroke:"#5a655f", solid:true },
      { kind:"rect", role:"cloth", x:249, y:217, w:25, h:17, radius:0, fill:"transparent", stroke:"#eee4cd", thickness:2, solid:true },
      { kind:"line", role:"stitch", from:{ x:251, y:231 }, to:{ x:271, y:219 }, thickness:2, stroke:"#a64d62", solid:true }
    ], collisions:[{ kind:"rect", x:176, y:194, w:104, h:62 }] },
    { id:"closet", label:"クローゼット", x:42, y:182, w:112, h:78, interactX:140, interactY:278, range:58, visuals:[
      { kind:"rect", role:"base", x:42, y:182, w:112, h:78, radius:6, fill:"#806044", solid:true },
      { kind:"rect", role:"door-left", x:51, y:190, w:46, h:61, radius:4, fill:"#a88764", stroke:"rgba(238,218,185,.6)", thickness:1.5, solid:true },
      { kind:"rect", role:"door-right", x:101, y:190, w:46, h:61, radius:4, fill:"#72543c", stroke:"rgba(238,218,185,.6)", thickness:1.5, solid:true },
      { kind:"circle", role:"knob-left", x:90, y:222, radius:2, fill:"#dfc99d", solid:true },
      { kind:"circle", role:"knob-right", x:112, y:222, radius:2, fill:"#dfc99d", solid:true }
    ], collisions:[{ kind:"rect", x:42, y:182, w:112, h:78 }] },
    { id:"low-table", label:"ローテーブル", x:294, y:276, w:168, h:82, interactX:378, interactY:368, range:64, visuals:[
      { kind:"rect", role:"base", x:294, y:276, w:168, h:82, radius:12, fill:"#8f6c50", solid:true }
    ], collisions:[{ kind:"rect", x:294, y:276, w:168, h:82 }] },
    { id:"pet", label:"ペット", x:530, y:188, w:132, h:74, interactX:474, interactY:232, range:72, visuals:[
      { kind:"rect", role:"base", x:530, y:188, w:132, h:74, radius:14, fill:"#b39a78", solid:true },
      { kind:"ellipse", role:"cushion", x:596, y:225, rx:52, ry:25, fill:"#8a7258", solid:true }
    ], collisions:[{ kind:"rect", x:530, y:188, w:132, h:74 }] },
    { id:"sofa", label:"ソファ", x:486, y:330, w:205, h:74, interactX:472, interactY:365, range:74, visuals:[
      { kind:"rect", role:"base", x:486, y:330, w:205, h:74, radius:16, fill:"#657f75", solid:true },
      { kind:"rect", role:"back-cushion", x:500, y:340, w:177, h:21, radius:8, fill:"#78968a", solid:true }
    ], collisions:[{ kind:"rect", x:486, y:330, w:205, h:74 }] },
    { id:"tv", label:"テレビ", x:520, y:392, w:155, h:70, interactX:475, interactY:425, range:72, visuals:[
      { kind:"rect", role:"screen-frame", x:542, y:397, w:111, h:44, radius:5, fill:"#263335", solid:true },
      { kind:"rect", role:"screen", x:546, y:401, w:103, h:36, radius:3, fill:"#334546", solid:true },
      { kind:"rect", role:"media-cabinet", x:520, y:438, w:155, h:24, radius:4, fill:"#4d504d", solid:true }
    ], collisions:[{ kind:"rect", x:542, y:397, w:111, h:44 }, { kind:"rect", x:520, y:438, w:155, h:24 }] },
    { id:"entry", label:"玄関", x:338, y:442, w:104, h:43, interactX:390, interactY:438, range:62, interaction:null, visuals:[
      { kind:"rect", role:"floor", x:338, y:442, w:104, h:43, radius:5, fill:"#aaa69a", solid:false },
      { kind:"rect", role:"sill", x:355, y:473, w:70, h:5, radius:0, fill:"#5c625e", solid:false }
    ], collisions:[] },
    { id:"exit", label:"玄関", x:356, y:455, w:68, h:25, interactX:390, interactY:438, range:62, visuals:[], collisions:[] },
    { id:"divider-west", label:"壁", visuals:[
      { kind:"line", role:"divider", from:{ x:294, y:30 }, to:{ x:294, y:205 }, thickness:10, stroke:"#eee7da", solid:true }
    ], collisions:[{ kind:"segment", from:{ x:294, y:30 }, to:{ x:294, y:205 }, thickness:10 }] },
    { id:"divider-south", label:"壁", visuals:[
      { kind:"line", role:"divider", from:{ x:250, y:268 }, to:{ x:250, y:445 }, thickness:10, stroke:"#eee7da", solid:true }
    ], collisions:[{ kind:"segment", from:{ x:250, y:268 }, to:{ x:250, y:445 }, thickness:10 }] }
  ].map((fixture) => {
    const interaction = fixture.interaction === null ? null : {
      x:fixture.interactX,
      y:fixture.interactY,
      range:fixture.range
    };
    return Object.freeze({
      ...fixture,
      visuals:Object.freeze(fixture.visuals.map(freezeVisual)),
      collisions:Object.freeze(fixture.collisions.map(freezeCollision)),
      interaction:interaction ? Object.freeze(interaction) : null
    });
  }));

  const ROOM = Object.freeze({ width:780, height:500, wallInset:9, wallThickness:18, playerMargin:28 });

  const ALL_COLLIDERS = Object.freeze(FIXTURES.flatMap((fixture) => fixture.collisions));

  function visualBounds(visual) {
    if (visual.kind === "rect") return { x:visual.x, y:visual.y, w:visual.w, h:visual.h };
    if (visual.kind === "circle") return { x:visual.x - visual.radius, y:visual.y - visual.radius, w:visual.radius * 2, h:visual.radius * 2 };
    if (visual.kind === "ellipse") return { x:visual.x - visual.rx, y:visual.y - visual.ry, w:visual.rx * 2, h:visual.ry * 2 };
    if (visual.kind === "line") {
      const pad = visual.thickness / 2;
      return { x:Math.min(visual.from.x, visual.to.x) - pad, y:Math.min(visual.from.y, visual.to.y) - pad, w:Math.abs(visual.to.x - visual.from.x) + pad * 2, h:Math.abs(visual.to.y - visual.from.y) + pad * 2 };
    }
    return null;
  }

  function collisionBounds(collision) {
    if (collision.kind === "rect") return { x:collision.x, y:collision.y, w:collision.w, h:collision.h };
    if (collision.kind === "segment") {
      const pad = collision.thickness / 2;
      return { x:Math.min(collision.from.x, collision.to.x) - pad, y:Math.min(collision.from.y, collision.to.y) - pad, w:Math.abs(collision.to.x - collision.from.x) + pad * 2, h:Math.abs(collision.to.y - collision.from.y) + pad * 2 };
    }
    return null;
  }

  function containsVisual(collision, visual) {
    if (!visual?.solid) return true;
    const outer = collisionBounds(collision);
    const inner = visualBounds(visual);
    return Boolean(outer && inner && inner.x >= outer.x - .01 && inner.y >= outer.y - .01 &&
      inner.x + inner.w <= outer.x + outer.w + .01 && inner.y + inner.h <= outer.y + outer.h + .01);
  }

  function collidesCircle(x, y, radius, colliders = ALL_COLLIDERS) {
    for (const collider of colliders) {
      if (collider.kind === "rect") {
        const closestX = Math.max(collider.x, Math.min(x, collider.x + collider.w));
        const closestY = Math.max(collider.y, Math.min(y, collider.y + collider.h));
        if (Math.hypot(x - closestX, y - closestY) < radius) return true;
      } else if (collider.kind === "segment") {
        const dx = collider.to.x - collider.from.x;
        const dy = collider.to.y - collider.from.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared ? Math.max(0, Math.min(1, ((x - collider.from.x) * dx + (y - collider.from.y) * dy) / lengthSquared)) : 0;
        const px = collider.from.x + dx * t;
        const py = collider.from.y + dy * t;
        if (Math.hypot(x - px, y - py) < radius + collider.thickness / 2) return true;
      }
    }
    return false;
  }

  const api = Object.freeze({ ROOM, FIXTURES, ALL_COLLIDERS, visualBounds, collisionBounds, containsVisual, collidesCircle });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysHomeFixtures = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
