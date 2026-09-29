(function initCityDaysPedestrianNavigation(global) {
  "use strict";

  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function edgeLength(edge) {
    let total = 0;
    for (let index = 1; index < edge.points.length; index += 1) total += distance(edge.points[index - 1], edge.points[index]);
    return total;
  }

  function pointSegmentDistance(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-9) return distance(point, a);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  }

  function pointEdgeDistance(point, edge) {
    let best = Infinity;
    for (let index = 1; index < edge.points.length; index += 1) {
      best = Math.min(best, pointSegmentDistance(point, edge.points[index - 1], edge.points[index]));
    }
    return best;
  }

  function pointInsideVehicleRoad(point, mapModel, ignoredEdgeIds = null, margin = 2) {
    for (const edge of mapModel.edges || []) {
      if (!edge.vehicle || ignoredEdgeIds?.has(edge.id)) continue;
      if (pointEdgeDistance(point, edge) < edge.width / 2 + margin) return edge;
    }
    return null;
  }

  function sampledPolyline(points, step = 7) {
    const samples = [];
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1];
      const b = points[index];
      const length = distance(a, b);
      const divisions = Math.max(1, Math.ceil(length / step));
      for (let sample = index === 1 ? 0 : 1; sample <= divisions; sample += 1) {
        const t = sample / divisions;
        samples.push({ x:a.x + (b.x - a.x) * t, y:a.y + (b.y - a.y) * t });
      }
    }
    return samples;
  }

  function polylineClearOfVehicleRoads(points, mapModel, ignoredEdgeIds = null, margin = 2) {
    return sampledPolyline(points).every((point) => !pointInsideVehicleRoad(point, mapModel, ignoredEdgeIds, margin));
  }

  function quadraticPath(a, control, b, divisions = 8) {
    const points = [];
    for (let index = 0; index <= divisions; index += 1) {
      const t = index / divisions;
      const mt = 1 - t;
      points.push({
        x:mt * mt * a.x + 2 * mt * t * control.x + t * t * b.x,
        y:mt * mt * a.y + 2 * mt * t * control.y + t * t * b.y
      });
    }
    return points;
  }

  function safeCornerPath(center, a, b, mapModel) {
    if (polylineClearOfVehicleRoads([a, b], mapModel, null, 2)) return [a, b];

    const av = { x:a.x - center.x, y:a.y - center.y };
    const bv = { x:b.x - center.x, y:b.y - center.y };
    const ar = Math.hypot(av.x, av.y);
    const br = Math.hypot(bv.x, bv.y);
    let outward = {
      x:(ar > 1e-6 ? av.x / ar : 0) + (br > 1e-6 ? bv.x / br : 0),
      y:(ar > 1e-6 ? av.y / ar : 0) + (br > 1e-6 ? bv.y / br : 0)
    };
    let magnitude = Math.hypot(outward.x, outward.y);
    if (magnitude < .05) {
      const midpoint = { x:(a.x + b.x) / 2 - center.x, y:(a.y + b.y) / 2 - center.y };
      magnitude = Math.hypot(midpoint.x, midpoint.y);
      outward = magnitude > .05
        ? { x:midpoint.x / magnitude, y:midpoint.y / magnitude }
        : { x:-av.y / Math.max(1, ar), y:av.x / Math.max(1, ar) };
    } else {
      outward.x /= magnitude;
      outward.y /= magnitude;
    }

    const baseRadius = Math.max(ar, br);
    for (const extra of [18, 36, 60, 90, 130, 180]) {
      const control = {
        x:center.x + outward.x * (baseRadius + extra),
        y:center.y + outward.y * (baseRadius + extra)
      };
      const path = quadraticPath(a, control, b, 10);
      if (polylineClearOfVehicleRoads(path, mapModel, null, 2)) return path;
    }
    return null;
  }

  function pedestrianPose(mapModel, edge, along, lateralOffset) {
    return mapModel.pedestrianOffsetPose?.(edge, along, 1, lateralOffset) || null;
  }

  function crosswalkClearOfOtherRoads(mapModel, edge, along, offset) {
    const first = pedestrianPose(mapModel, edge, along, -offset);
    const second = pedestrianPose(mapModel, edge, along, offset);
    if (!first || !second) return false;
    return polylineClearOfVehicleRoads([first, second], mapModel, new Set([edge.id]), 4);
  }

  function resolveJunctionCrossingAlong(mapModel, edge, length, crossing, offset) {
    if (!crossing.nodeId) return crossing.along;
    const outwardSign = edge.from === crossing.nodeId ? 1 : -1;
    let along = crossing.along;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      if (along > 30 && along < length - 30 && crosswalkClearOfOtherRoads(mapModel, edge, along, offset)) return along;
      along += outwardSign * 10;
      if (along <= 30 || along >= length - 30) break;
    }
    return null;
  }

  function resolveSidewalkBoundaryAlong(mapModel, edge, length, nodeId, side, offset) {
    const outwardSign = edge.from === nodeId ? 1 : -1;
    let along = edge.from === nodeId ? 0 : length;
    const ignored = new Set([edge.id]);
    for (let attempt = 0; attempt < 34; attempt += 1) {
      const pose = pedestrianPose(mapModel, edge, along, side * offset);
      if (pose && !pointInsideVehicleRoad(pose, mapModel, ignored, 3)) return along;
      along += outwardSign * 8;
      if (along < 0 || along > length) break;
    }
    return Math.max(0, Math.min(length, along));
  }

  function accessPathToSegment(point, segment, mapModel) {
    let best = null;
    let accumulated = 0;
    for (let index = 1; index < segment.points.length; index += 1) {
      const a = segment.points[index - 1];
      const b = segment.points[index];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared <= 1e-9
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      const projection = { x:a.x + dx * t, y:a.y + dy * t };
      const d = distance(point, projection);
      if (!best || d < best.distance) {
        best = { distance:d, projection, segmentIndex:index - 1, t, along:accumulated + distance(a, projection) };
      }
      accumulated += distance(a, b);
    }
    if (!best) return null;

    const prefix = segment.points.slice(0, best.segmentIndex + 1).reverse();
    const suffix = segment.points.slice(best.segmentIndex + 1);
    const toFrom = [point, best.projection, ...prefix];
    const toTo = [point, best.projection, ...suffix];
    const candidates = [
      { nodeId:segment.from, points:toFrom, length:edgeLength({ points:toFrom }) },
      { nodeId:segment.to, points:toTo, length:edgeLength({ points:toTo }) }
    ].sort((a, b) => a.length - b.length || String(a.nodeId).localeCompare(String(b.nodeId)));

    for (const candidate of candidates) {
      if (polylineClearOfVehicleRoads(candidate.points, mapModel, null, 2)) {
        return { ...candidate, distanceToSegment:best.distance };
      }
    }
    return null;
  }

  function chooseSafeAccessPath(point, candidateSegments, mapModel, maxDistance = 1100) {
    const candidates = [];
    for (const segment of candidateSegments) {
      const access = accessPathToSegment(point, segment, mapModel);
      if (!access || access.distanceToSegment > maxDistance) continue;
      candidates.push({ ...access, score:access.distanceToSegment * 4 + access.length });
    }
    candidates.sort((a, b) => a.score - b.score || a.length - b.length || String(a.nodeId).localeCompare(String(b.nodeId)));
    return candidates[0] || null;
  }

  function buildGraph(mapModel) {
    if (!mapModel || !Array.isArray(mapModel.edges)) throw new TypeError("pedestrian graph requires map edges");
    const segments = [];
    const crosswalks = [];
    const adjacency = new Map();
    const nodePositions = new Map();
    const endpointGroups = new Map();
    const externalNodeAliases = new Map();

    const addSegment = (segment) => {
      if (!(segment.length > 0) || segment.points.length < 2) return;
      const frozenPoints = Object.freeze(segment.points.map((point) => Object.freeze({ ...point })));
      segments.push(Object.freeze({ ...segment, points:frozenPoints }));
      if (!nodePositions.has(segment.from)) nodePositions.set(segment.from, Object.freeze({ ...frozenPoints[0] }));
      if (!nodePositions.has(segment.to)) nodePositions.set(segment.to, Object.freeze({ ...frozenPoints.at(-1) }));
    };

    const addEndpoint = (junctionId, nodeId, point, sourceId, sourceEdgeId) => {
      const list = endpointGroups.get(junctionId) || [];
      if (!list.some((value) => value.nodeId === nodeId && value.sourceEdgeId === sourceEdgeId)) {
        list.push({ nodeId, point, sourceId, sourceEdgeId });
      }
      endpointGroups.set(junctionId, list);
    };

    const corridors = [];
    for (const edge of mapModel.edges) {
      if (!edge.pedestrian) continue;
      const length = edgeLength(edge);
      if (length < 1) continue;
      if (!edge.vehicle) continue;

      const corridor = mapModel.pedestrianCorridor?.(edge);
      const offset = corridor?.centerOffset || edge.width / 2 + 22;
      const crossings = [];
      const incident = (nodeId) => mapModel.neighbors?.(nodeId, { mode:"vehicle" }) || [];
      for (const nodeId of [edge.from, edge.to]) {
        const incidentLinks = incident(nodeId);
        const incidentEdges = incidentLinks.map((link) => link.edge).filter(Boolean);
        if (incidentLinks.length < 3) continue;
        const geometry = mapModel.junctionGeometry?.(nodeId, edge.id);
        const from = nodeId === edge.from;
        const rawAlong = from ? geometry?.crossingOffset : length - (geometry?.crossingOffset || 0);
        if (!Number.isFinite(rawAlong) || rawAlong <= 0 || rawAlong >= length) continue;
        const along = resolveJunctionCrossingAlong(mapModel, edge, length, { along:rawAlong, nodeId }, offset);
        if (Number.isFinite(along)) {
          crossings.push({
            along,
            nodeId,
            signalized:incidentEdges.some((incidentEdge) => Boolean(incidentEdge.signalized))
          });
        }
      }

      if (length >= 1150) {
        const along = Math.round(length / 2);
        if (crossings.every((crossing) => Math.abs(crossing.along - along) >= 250)) {
          crossings.push({ along, nodeId:null, signalized:false });
        }
      }

      crossings.sort((a, b) => a.along - b.along || String(a.nodeId).localeCompare(String(b.nodeId)));
      const uniqueCrossings = crossings.filter((crossing, index) => !index || crossing.along - crossings[index - 1].along > 1);
      const edgeCrossings = uniqueCrossings.map((crossing, index) => {
        const roadPose = pedestrianPose(mapModel, edge, crossing.along, 0);
        const first = pedestrianPose(mapModel, edge, crossing.along, -offset);
        const second = pedestrianPose(mapModel, edge, crossing.along, offset);
        if (!roadPose || !first || !second) return null;

        const from = mapModel.getNode?.(crossing.nodeId) || null;
        const to = from
          ? (edge.from === crossing.nodeId ? mapModel.getNode(edge.to) : mapModel.getNode(edge.from))
          : null;
        const heading = Math.atan2(
          (to?.y ?? edge.points.at(-1).y) - (from?.y ?? edge.points[0].y),
          (to?.x ?? edge.points.at(-1).x) - (from?.x ?? edge.points[0].x)
        );
        const vector = { x:-Math.sin(heading), y:Math.cos(heading) };
        const tangent = { x:Math.cos(heading), y:Math.sin(heading) };
        const curbA = pedestrianPose(mapModel, edge, crossing.along, -edge.width / 2) || first;
        const curbB = pedestrianPose(mapModel, edge, crossing.along, edge.width / 2) || second;
        const stopOffset = 38;
        const stopLines = [-1, 1].map((directionSign) => Object.freeze({
          x:roadPose.x - tangent.x * directionSign * stopOffset,
          y:roadPose.y - tangent.y * directionSign * stopOffset,
          directionSign,
          a:Object.freeze({
            x:roadPose.x - tangent.x * directionSign * stopOffset + vector.x * (edge.width / 2 - 10),
            y:roadPose.y - tangent.y * directionSign * stopOffset + vector.y * (edge.width / 2 - 10)
          }),
          b:Object.freeze({
            x:roadPose.x - tangent.x * directionSign * stopOffset - vector.x * (edge.width / 2 - 10),
            y:roadPose.y - tangent.y * directionSign * stopOffset - vector.y * (edge.width / 2 - 10)
          })
        }));
        const crosswalkId = "crosswalk:" + edge.id + ":" + Math.round(crossing.along);
        const endpointNodeIds = [crosswalkId + ":a", crosswalkId + ":b"];
        const crosswalkLength = distance(first, second);
        const record = Object.freeze({
          id:crosswalkId,
          x:roadPose.x,
          y:roadPose.y,
          vector:Object.freeze(vector),
          roadEdgeId:edge.id,
          along:crossing.along,
          length:crosswalkLength,
          endpoints:Object.freeze([Object.freeze({ x:first.x, y:first.y }), Object.freeze({ x:second.x, y:second.y })]),
          curbEndpoints:Object.freeze([Object.freeze({ x:curbA.x, y:curbA.y }), Object.freeze({ x:curbB.x, y:curbB.y })]),
          endpointNodeIds:Object.freeze(endpointNodeIds),
          stopLine:Object.freeze({ x:stopLines[0].x, y:stopLines[0].y, offset:stopOffset }),
          stopLines:Object.freeze(stopLines),
          signalized:crossing.signalized,
          ...(crossing.nodeId ? { nodeId:crossing.nodeId } : {})
        });
        crosswalks.push(record);
        addSegment({
          id:crosswalkId,
          type:"crosswalk",
          from:endpointNodeIds[0],
          to:endpointNodeIds[1],
          points:record.endpoints,
          length:record.length,
          roadEdgeId:edge.id,
          crosswalkId
        });
        return { ...crossing, record, index };
      }).filter(Boolean);
      corridors.push({ edge, length, offset, crossings:edgeCrossings });
    }

    // Vehicle-road sidewalks stop at a safe curb boundary. At real junctions,
    // the boundary is the explicit crosswalk endpoint, never the road-node center.
    for (const { edge, length, offset, crossings } of corridors) {
      const fromCrossing = crossings.find((crossing) => crossing.nodeId === edge.from) || null;
      const toCrossing = crossings.find((crossing) => crossing.nodeId === edge.to) || null;
      const middleCrossings = crossings.filter((crossing) => !crossing.nodeId);

      for (const side of [-1, 1]) {
        const endpointIndex = side < 0 ? 0 : 1;
        const fromAlong = fromCrossing
          ? fromCrossing.along
          : resolveSidewalkBoundaryAlong(mapModel, edge, length, edge.from, side, offset);
        const toAlong = toCrossing
          ? toCrossing.along
          : resolveSidewalkBoundaryAlong(mapModel, edge, length, edge.to, side, offset);

        if (!(toAlong > fromAlong + 1)) continue;

        const fromPoint = fromCrossing
          ? fromCrossing.record.endpoints[endpointIndex]
          : pedestrianPose(mapModel, edge, fromAlong, side * offset);
        const toPoint = toCrossing
          ? toCrossing.record.endpoints[endpointIndex]
          : pedestrianPose(mapModel, edge, toAlong, side * offset);
        if (!fromPoint || !toPoint) continue;

        const fromNodeId = fromCrossing
          ? fromCrossing.record.endpointNodeIds[endpointIndex]
          : edge.id + ":side:" + side + ":from";
        const toNodeId = toCrossing
          ? toCrossing.record.endpointNodeIds[endpointIndex]
          : edge.id + ":side:" + side + ":to";

        addEndpoint(edge.from, fromNodeId, fromPoint, "boundary:" + edge.id + ":from:" + side, edge.id);
        addEndpoint(edge.to, toNodeId, toPoint, "boundary:" + edge.id + ":to:" + side, edge.id);

        const marks = [
          { along:fromAlong, nodeId:fromNodeId },
          ...middleCrossings
            .filter((crossing) => crossing.along > fromAlong + 1 && crossing.along < toAlong - 1)
            .map((crossing) => ({
              along:crossing.along,
              nodeId:crossing.record.endpointNodeIds[endpointIndex]
            })),
          { along:toAlong, nodeId:toNodeId }
        ].sort((a, b) => a.along - b.along);

        for (let index = 0; index < marks.length - 1; index += 1) {
          const from = marks[index];
          const to = marks[index + 1];
          const points = [];
          const steps = Math.max(2, Math.ceil((to.along - from.along) / 70));
          for (let step = 0; step <= steps; step += 1) {
            const along = from.along + (to.along - from.along) * step / steps;
            const pose = pedestrianPose(mapModel, edge, along, side * offset);
            if (pose) points.push({ x:pose.x, y:pose.y });
          }
          if (points.length < 2) continue;
          const segmentId = "sidewalk:" + edge.id + ":" + side + ":" + index;
          addSegment({
            id:segmentId,
            type:"sidewalk",
            from:from.nodeId,
            to:to.nodeId,
            points,
            length:edgeLength({ points }),
            sourceEdgeId:edge.id,
            side
          });
        }
      }
    }

    // Pair the closest curb endpoints belonging to different approaches and
    // route each corner outward until no part of the corner path occupies a
    // vehicle carriageway.
    for (const [nodeId, rawEndpoints] of endpointGroups) {
      if (rawEndpoints.length < 2) continue;
      const center = mapModel.getNode?.(nodeId);
      if (!center) continue;
      const endpoints = rawEndpoints.slice();
      const candidates = [];
      for (let a = 0; a < endpoints.length; a += 1) {
        for (let b = a + 1; b < endpoints.length; b += 1) {
          if (endpoints[a].sourceEdgeId === endpoints[b].sourceEdgeId) continue;
          candidates.push({ a, b, span:distance(endpoints[a].point, endpoints[b].point) });
        }
      }
      candidates.sort((a, b) => a.span - b.span || a.a - b.a || a.b - b.b);
      const used = new Set();
      let cornerIndex = 0;
      for (const candidate of candidates) {
        if (used.has(candidate.a) || used.has(candidate.b)) continue;
        const a = endpoints[candidate.a];
        const b = endpoints[candidate.b];
        const points = safeCornerPath(center, a.point, b.point, mapModel);
        if (!points) continue;
        used.add(candidate.a);
        used.add(candidate.b);
        addSegment({
          id:"sidewalk-corner:" + nodeId + ":" + cornerIndex++,
          type:"sidewalk",
          from:a.nodeId,
          to:b.nodeId,
          points,
          length:edgeLength({ points }),
          junctionId:nodeId
        });
      }
    }

    // Do not reuse freehand legacy pedestrian paths as navigation edges. Several
    // of them visibly cross vehicle roads without a crosswalk. The road sidewalk
    // network above is the authoritative walking network; facilities and stations
    // attach to it with generated road-safe links below.
    const primarySegments = segments.filter((segment) => segment.type === "sidewalk");

    for (const place of mapModel.places || []) {
      const accessPoint = { x:place.x, y:place.y };
      const accessNodeId = "place-access:" + place.id;
      const target = chooseSafeAccessPath(accessPoint, primarySegments, mapModel, 1100);
      if (!target) continue;
      if (target.length <= 1) {
        externalNodeAliases.set(place.entranceNodeId, target.nodeId);
        continue;
      }
      addSegment({
        id:"facility-access:auto:" + place.id,
        type:"facility-access",
        from:accessNodeId,
        to:target.nodeId,
        points:target.points,
        length:target.length,
        sourceEdgeId:null
      });
      externalNodeAliases.set(place.entranceNodeId, accessNodeId);
    }

    // Stations expose roadNodeId to older callers, but their physical pedestrian
    // target is the generated safe access coordinate, never the road center.
    for (const station of mapModel.stations || []) {
      const accessPoint = { x:station.accessX, y:station.accessY };
      const accessNodeId = "station-access:" + station.id;
      const target = chooseSafeAccessPath(accessPoint, primarySegments, mapModel, 1100);
      if (!target) continue;
      const legacyStationEntryId = station.id + "-station-entry";
      if (target.length <= 1) {
        externalNodeAliases.set(station.roadNodeId, target.nodeId);
        if (mapModel.getNode?.(legacyStationEntryId)) externalNodeAliases.set(legacyStationEntryId, target.nodeId);
        continue;
      }
      addSegment({
        id:"facility-access:station:" + station.id,
        type:"facility-access",
        from:accessNodeId,
        to:target.nodeId,
        points:target.points,
        length:target.length,
        sourceEdgeId:null
      });
      externalNodeAliases.set(station.roadNodeId, accessNodeId);
      if (mapModel.getNode?.(legacyStationEntryId)) externalNodeAliases.set(legacyStationEntryId, accessNodeId);
    }

    for (const segment of segments) {
      for (const [from, to] of [[segment.from, segment.to], [segment.to, segment.from]]) {
        const links = adjacency.get(from) || [];
        links.push({ segmentId:segment.id, nodeId:to, segment });
        adjacency.set(from, links);
      }
    }

    const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
    const safetyViolations = [];
    for (const segment of segments) {
      const ignored = segment.type === "crosswalk" && segment.roadEdgeId
        ? new Set([segment.roadEdgeId])
        : null;
      for (const point of sampledPolyline(segment.points, 6)) {
        const edge = pointInsideVehicleRoad(point, mapModel, ignored, segment.type === "crosswalk" ? 3 : 1);
        if (!edge) continue;
        safetyViolations.push(Object.freeze({
          segmentId:segment.id,
          segmentType:segment.type,
          roadEdgeId:edge.id,
          x:point.x,
          y:point.y
        }));
        break;
      }
    }

    return Object.freeze({
      nodes:Object.freeze([...new Set(segments.flatMap((segment) => [segment.from, segment.to]))]),
      segments:Object.freeze(segments),
      segmentsById,
      adjacency,
      nodePositions,
      externalNodeAliases,
      crosswalks:Object.freeze(crosswalks),
      safetyViolations:Object.freeze(safetyViolations)
    });
  }

  function resolveAlias(graph, nodeId) {
    let cursor = nodeId;
    const visited = new Set();
    while (graph?.externalNodeAliases?.has(cursor) && !visited.has(cursor)) {
      visited.add(cursor);
      cursor = graph.externalNodeAliases.get(cursor);
    }
    return cursor;
  }

  function findRoute(graph, startNodeId, endNodeId) {
    startNodeId = resolveAlias(graph, startNodeId);
    endNodeId = resolveAlias(graph, endNodeId);
    if (!graph?.adjacency?.has(startNodeId) || !graph.adjacency.has(endNodeId)) return null;
    if (startNodeId === endNodeId) return { nodeIds:[startNodeId], segmentIds:[], distance:0 };
    const frontier = [{ nodeId:startNodeId, cost:0 }];
    const best = new Map([[startNodeId, 0]]);
    const previous = new Map();
    while (frontier.length) {
      frontier.sort((a, b) => a.cost - b.cost || a.nodeId.localeCompare(b.nodeId));
      const current = frontier.shift();
      if (current.nodeId === endNodeId) break;
      for (const link of graph.adjacency.get(current.nodeId) || []) {
        const cost = current.cost + link.segment.length;
        if (best.has(link.nodeId) && best.get(link.nodeId) <= cost) continue;
        best.set(link.nodeId, cost);
        previous.set(link.nodeId, { nodeId:current.nodeId, segmentId:link.segmentId });
        frontier.push({ nodeId:link.nodeId, cost });
      }
    }
    if (!best.has(endNodeId)) return null;
    const nodeIds = [];
    const segmentIds = [];
    for (let cursor = endNodeId; cursor !== startNodeId;) {
      nodeIds.push(cursor);
      const step = previous.get(cursor);
      if (!step) return null;
      segmentIds.push(step.segmentId);
      cursor = step.nodeId;
    }
    nodeIds.push(startNodeId);
    nodeIds.reverse();
    segmentIds.reverse();
    return { nodeIds, segmentIds, distance:best.get(endNodeId) };
  }

  function nearestNode(graph, x, y, options = {}) {
    if (!graph?.nodePositions || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const maxDistance = Number.isFinite(options.maxDistance) ? Math.max(0, options.maxDistance) : Infinity;
    let best = null;
    for (const [nodeId, point] of graph.nodePositions) {
      const candidateDistance = Math.hypot(point.x - x, point.y - y);
      if (candidateDistance > maxDistance) continue;
      if (!best || candidateDistance < best.distance || candidateDistance === best.distance && String(nodeId).localeCompare(String(best.nodeId)) < 0) {
        best = { nodeId, point, distance:candidateDistance };
      }
    }
    return best;
  }

  const api = Object.freeze({ buildGraph, findRoute, nearestNode });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysPedestrianNavigation = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
