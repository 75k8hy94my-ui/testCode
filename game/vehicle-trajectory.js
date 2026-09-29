(function initCityDaysVehicleTrajectory(global) {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
  const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const cubicPoint = (curve, t) => {
    const u = 1 - t;
    return {
      x:u*u*u*curve.p0.x + 3*u*u*t*curve.p1.x + 3*u*t*t*curve.p2.x + t*t*t*curve.p3.x,
      y:u*u*u*curve.p0.y + 3*u*u*t*curve.p1.y + 3*u*t*t*curve.p2.y + t*t*t*curve.p3.y
    };
  };

  function createJunctionCurve(from, to, window = 76, controlLength = 42, samples = 80) {
    const p0 = from.point;
    const p3 = to.point;
    const p1 = { x:p0.x + from.tangent.x * controlLength, y:p0.y + from.tangent.y * controlLength };
    const p2 = { x:p3.x - to.tangent.x * controlLength, y:p3.y - to.tangent.y * controlLength };
    const curve = { p0:{ ...p0 }, p1, p2, p3:{ ...p3 }, window };
    const table = [{ t:0, distance:0, point:cubicPoint(curve, 0) }];
    let total = 0;
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      const point = cubicPoint(curve, t);
      total += length(table[i - 1].point, point);
      table.push({ t, distance:total, point });
    }
    curve.table = table;
    curve.length = total;
    return curve;
  }

  function poseAt(curve, progress) {
    const target = clamp(progress, 0, 1) * curve.length;
    let index = 1;
    while (index < curve.table.length - 1 && curve.table[index].distance < target) index += 1;
    const a = curve.table[index - 1];
    const b = curve.table[index];
    const span = b.distance - a.distance;
    const t = span > 1e-6 ? lerp(a.t, b.t, (target - a.distance) / span) : b.t;
    const point = cubicPoint(curve, t);
    const dx = 3*(1-t)*(1-t)*(curve.p1.x-curve.p0.x) + 6*(1-t)*t*(curve.p2.x-curve.p1.x) + 3*t*t*(curve.p3.x-curve.p2.x);
    const dy = 3*(1-t)*(1-t)*(curve.p1.y-curve.p0.y) + 6*(1-t)*t*(curve.p2.y-curve.p1.y) + 3*t*t*(curve.p3.y-curve.p2.y);
    return { ...point, tangent:{ x:dx/(Math.hypot(dx,dy)||1), y:dy/(Math.hypot(dx,dy)||1) }, t };
  }

  function withLateralVelocity(pose, speed, lateralVelocity = 0) {
    const tangent = pose?.tangent || { x:1,y:0 };
    const normal = { x:tangent.y,y:-tangent.x };
    const velocity = {
      x:tangent.x * (Number(speed) || 0) + normal.x * (Number(lateralVelocity) || 0),
      y:tangent.y * (Number(speed) || 0) + normal.y * (Number(lateralVelocity) || 0)
    };
    const magnitude = Math.hypot(velocity.x, velocity.y);
    const direction = magnitude > 1e-6 ? velocity : tangent;
    return { ...pose, velocity, tangent:{ x:direction.x / (Math.hypot(direction.x,direction.y)||1), y:direction.y / (Math.hypot(direction.x,direction.y)||1) } };
  }

  const api = Object.freeze({ clamp, smoothstep, createJunctionCurve, poseAt, withLateralVelocity });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysVehicleTrajectory = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
