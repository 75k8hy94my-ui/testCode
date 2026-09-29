(function initCityDaysBuildingFrontage(global) {
  "use strict";
  function resolve(site, roadPoint, roadEdgeId = null, roadTangent = null) {
    if (!site || !Number.isFinite(site.x) || !Number.isFinite(site.y) || !Number.isFinite(site.w) || !Number.isFinite(site.h) || !roadPoint) return null;
    const center = { x:site.x + site.w / 2, y:site.y + site.h / 2 };
    const rawX = roadTangent?.x ?? 1;
    const rawY = roadTangent?.y ?? 0;
    const tangentLength = Math.hypot(rawX, rawY) || 1;
    const tangent = { x:rawX / tangentLength, y:rawY / tangentLength };
    let normal = { x:-tangent.y,y:tangent.x };
    const dx = roadPoint.x - center.x;
    const dy = roadPoint.y - center.y;
    if (normal.x * dx + normal.y * dy < 0) normal = { x:-normal.x,y:-normal.y };
    const frontSideSign = normal.x * -tangent.y + normal.y * tangent.x >= 0 ? 1 : -1;
    const side = Math.abs(normal.x) > Math.abs(normal.y) ? (normal.x > 0 ? "east" : "west") : (normal.y > 0 ? "south" : "north");
    const angle = Math.atan2(tangent.y, tangent.x);
    const halfW = site.w / 2;
    const halfH = site.h / 2;
    const polygon = [
      { x:center.x - tangent.x*halfW - normal.x*halfH, y:center.y - tangent.y*halfW - normal.y*halfH },
      { x:center.x + tangent.x*halfW - normal.x*halfH, y:center.y + tangent.y*halfW - normal.y*halfH },
      { x:center.x + tangent.x*halfW + normal.x*halfH, y:center.y + tangent.y*halfW + normal.y*halfH },
      { x:center.x - tangent.x*halfW + normal.x*halfH, y:center.y - tangent.y*halfW + normal.y*halfH }
    ];
    const bounds = {
      x:Math.min(...polygon.map((value) => value.x)),
      y:Math.min(...polygon.map((value) => value.y)),
      w:Math.max(...polygon.map((value) => value.x)) - Math.min(...polygon.map((value) => value.x)),
      h:Math.max(...polygon.map((value) => value.y)) - Math.min(...polygon.map((value) => value.y))
    };
    const entrance = { x:center.x + normal.x * halfH, y:center.y + normal.y * halfH };
    return Object.freeze({
      side,
      angle,
      frontSideSign,
      entranceLocal:Object.freeze({ x:halfW, y:frontSideSign * halfH + halfH }),
      tangent:Object.freeze(tangent),
      normal:Object.freeze(normal),
      entrance:Object.freeze(entrance),
      roadAnchor:Object.freeze({ x:roadPoint.x,y:roadPoint.y }),
      roadEdgeId,
      footprint:Object.freeze({ x:site.x,y:site.y,w:site.w,h:site.h }),
      polygon:Object.freeze(polygon.map((value) => Object.freeze(value))),
      bounds:Object.freeze(bounds)
    });
  }
  const api = Object.freeze({ resolve });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysBuildingFrontage = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
