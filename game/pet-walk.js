(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PetWalk = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_TRAIL_POINTS = 512;
  const SAMPLE_SPACING = 8;
  const FOLLOW_GAP = 44;
  const MAX_COORDINATE = 1_000_000;

  function createWalkState() {
    return {
      active:false,
      trail:[],
      distance:0,
      followerDistance:0,
      elapsedMinutes:0,
      petX:0,
      petY:0,
      facing:0
    };
  }

  function cloneState(value) {
    return {
      active:Boolean(value.active),
      trail:value.trail.map((point) => ({ x:point.x, y:point.y, distance:point.distance })),
      distance:value.distance,
      followerDistance:value.followerDistance,
      elapsedMinutes:value.elapsedMinutes,
      petX:value.petX,
      petY:value.petY,
      facing:value.facing
    };
  }

  function validPoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= 0 && point.y >= 0 && point.x <= MAX_COORDINATE && point.y <= MAX_COORDINATE;
  }

  function beginWalk(value, origin) {
    const current = value?.active === true ? cloneState(value) : createWalkState();
    if (current.active) return { ok:false, reason:'already-active', state:current };
    if (!validPoint(origin)) return { ok:false, reason:'invalid-origin', state:createWalkState() };
    return {
      ok:true,
      state:{
        ...createWalkState(),
        active:true,
        trail:[{ x:origin.x, y:origin.y, distance:0 }],
        petX:origin.x,
        petY:origin.y
      }
    };
  }

  function pointAtDistance(trail, targetDistance) {
    if (trail.length === 1 || targetDistance <= trail[0].distance) {
      const first = trail[0];
      const next = trail[1];
      return {
        x:first.x,
        y:first.y,
        facing:next ? Math.atan2(next.y - first.y, next.x - first.x) : 0
      };
    }
    for (let i = 1; i < trail.length; i += 1) {
      const next = trail[i];
      if (targetDistance > next.distance) continue;
      const previous = trail[i - 1];
      const length = next.distance - previous.distance;
      const ratio = length > 0 ? Math.max(0, Math.min(1, (targetDistance - previous.distance) / length)) : 0;
      return {
        x:previous.x + (next.x - previous.x) * ratio,
        y:previous.y + (next.y - previous.y) * ratio,
        facing:Math.atan2(next.y - previous.y, next.x - previous.x)
      };
    }
    const last = trail[trail.length - 1];
    const previous = trail[trail.length - 2];
    return {
      x:last.x,
      y:last.y,
      facing:previous ? Math.atan2(last.y - previous.y, last.x - previous.x) : 0
    };
  }

  function pruneBehindFollower(trail, followerDistance) {
    while (trail.length > 2 && trail[1].distance <= followerDistance + 1e-7) trail.shift();
  }

  function recordPlayerPosition(value, point) {
    if (!value?.active || !validPoint(point)) return value?.active ? cloneState(value) : createWalkState();
    const state = cloneState(value);
    const last = state.trail[state.trail.length - 1];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 1e-7) return state;

    const steps = Math.max(1, Math.ceil(segmentLength / SAMPLE_SPACING));
    const additions = [];
    for (let i = 1; i <= steps; i += 1) {
      const ratio = i / steps;
      additions.push({
        x:last.x + dx * ratio,
        y:last.y + dy * ratio,
        distance:last.distance + segmentLength * ratio
      });
    }
    const trail = state.trail.concat(additions);
    pruneBehindFollower(trail, state.followerDistance);
    if (trail.length > MAX_TRAIL_POINTS) return state;
    state.trail = trail;
    state.distance += segmentLength;
    return state;
  }

  function advanceFollower(value, elapsedSeconds, speed) {
    if (!value?.active) return createWalkState();
    const state = cloneState(value);
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || !Number.isFinite(speed) || speed <= 0) return state;
    const earliest = state.trail[0].distance;
    const desired = Math.max(earliest, state.distance - FOLLOW_GAP);
    const nextDistance = Math.min(desired, state.followerDistance + speed * elapsedSeconds);
    if (nextDistance <= state.followerDistance) return state;
    state.followerDistance = nextDistance;
    const point = pointAtDistance(state.trail, nextDistance);
    state.petX = point.x;
    state.petY = point.y;
    state.facing = point.facing;
    pruneBehindFollower(state.trail, state.followerDistance);
    return state;
  }

  function advanceElapsed(value, gameMinutes) {
    if (!value?.active) return createWalkState();
    const state = cloneState(value);
    if (Number.isFinite(gameMinutes) && gameMinutes > 0) {
      state.elapsedMinutes = Math.min(1_000_000, state.elapsedMinutes + gameMinutes);
    }
    return state;
  }

  function normalizeWalkState(value, options = {}) {
    const worldSize = Number.isFinite(options.worldSize) && options.worldSize > 0 ? options.worldSize : 10800;
    if (!value || typeof value !== 'object' || value.active !== true || options.hasDog !== true || options.playerCanWalk !== true) {
      return createWalkState();
    }
    if (!Array.isArray(value.trail) || value.trail.length < 1 || value.trail.length > MAX_TRAIL_POINTS ||
        !Number.isFinite(value.distance) || value.distance < 0 ||
        !Number.isFinite(value.followerDistance) || !Number.isFinite(value.elapsedMinutes) || value.elapsedMinutes < 0 ||
        !Number.isFinite(value.petX) || !Number.isFinite(value.petY) || !Number.isFinite(value.facing) ||
        value.petX < 0 || value.petY < 0 || value.petX > worldSize || value.petY > worldSize) {
      return createWalkState();
    }

    const trail = [];
    let previous = null;
    for (const raw of value.trail) {
      if (!validPoint(raw) || raw.x > worldSize || raw.y > worldSize || !Number.isFinite(raw.distance) || raw.distance < 0) {
        return createWalkState();
      }
      const point = { x:raw.x, y:raw.y, distance:raw.distance };
      if (previous) {
        const segment = Math.hypot(point.x - previous.x, point.y - previous.y);
        if (!(point.distance > previous.distance) || Math.abs(point.distance - previous.distance - segment) > .02) return createWalkState();
      }
      trail.push(point);
      previous = point;
    }

    const firstDistance = trail[0].distance;
    const lastDistance = trail[trail.length - 1].distance;
    if (value.followerDistance < firstDistance - .02 || value.followerDistance > lastDistance + .02 ||
        Math.abs(value.distance - lastDistance) > .02) return createWalkState();
    const expectedPet = pointAtDistance(trail, value.followerDistance);
    if (Math.hypot(expectedPet.x - value.petX, expectedPet.y - value.petY) > .1) return createWalkState();

    return {
      active:true,
      trail,
      distance:value.distance,
      followerDistance:value.followerDistance,
      elapsedMinutes:value.elapsedMinutes,
      petX:value.petX,
      petY:value.petY,
      facing:value.facing
    };
  }

  function clearWalkState() {
    return createWalkState();
  }

  return Object.freeze({
    MAX_TRAIL_POINTS,
    SAMPLE_SPACING,
    FOLLOW_GAP,
    createWalkState,
    beginWalk,
    recordPlayerPosition,
    advanceFollower,
    advanceElapsed,
    normalizeWalkState,
    clearWalkState
  });
});
