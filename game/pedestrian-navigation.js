(function initCityDaysPedestrianNavigation(global) {
  "use strict";

  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  function edgeLength(edge) {
    let total = 0;
    for (let index = 1; index < edge.points.length; index += 1) total += distance(edge.points[index - 1], edge.points[index]);
    return total;
  }

  function buildGraph(mapModel) {
    if (!mapModel || !Array.isArray(mapModel.edges)) throw new TypeError("pedestrian graph requires map edges");
    const segments = [];
    const crosswalks = [];
    const adjacency = new Map();
    const nodePositions = new Map();
    const endpointGroups = new Map();
    const publicPathEndpoints = [];
    const placeNodes = new Set([
      ...(mapModel.places || []).map((place) => place.entranceNodeId),
      ...(mapModel.stations || []).map((station) => station.roadNodeId)
    ]);
    const addSegment = (segment) => {
      if (!(segment.length > 0) || segment.points.length < 2) return;
      const frozenPoints = Object.freeze(segment.points.map((point) => Object.freeze({ ...point })));
      segments.push(Object.freeze({ ...segment, points:frozenPoints }));
      if (!nodePositions.has(segment.from)) nodePositions.set(segment.from, Object.freeze({ ...frozenPoints[0] }));
      if (!nodePositions.has(segment.to)) nodePositions.set(segment.to, Object.freeze({ ...frozenPoints.at(-1) }));
    };
    const addEndpoint = (junctionId, nodeId, point, sourceId) => {
      const list = endpointGroups.get(junctionId) || [];
      list.push({ nodeId, point, sourceId });
      endpointGroups.set(junctionId, list);
    };
    const corridors = [];

    for (const edge of mapModel.edges) {
      if (!edge.pedestrian) continue;
      const length = edgeLength(edge);
      if (length < 1) continue;
      if (!edge.vehicle) {
        const facility = placeNodes.has(edge.from) || placeNodes.has(edge.to);
        publicPathEndpoints.push({ nodeId:edge.from, point:edge.points[0], sourceEdgeId:edge.id });
        publicPathEndpoints.push({ nodeId:edge.to, point:edge.points.at(-1), sourceEdgeId:edge.id });
        addSegment({
          id:(facility ? "facility-access:" : "sidewalk:") + edge.id,
          type:facility ? "facility-access" : "sidewalk",
          from:edge.from,
          to:edge.to,
          points:edge.points,
          length,
          sourceEdgeId:edge.id
        });
        continue;
      }

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
        const along = from ? geometry?.crossingOffset : length - (geometry?.crossingOffset || 0);
        if (Number.isFinite(along) && along > 0 && along < length) {
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
        const center = mapModel.pedestrianOffsetPose
          ? mapModel.pedestrianOffsetPose(edge, crossing.along, 1, 0)
          : { x:edge.points[0].x + (edge.points.at(-1).x - edge.points[0].x) * crossing.along / length, y:edge.points[0].y };
        const roadPose = mapModel.pedestrianOffsetPose?.(edge, crossing.along, 1, 0) || center;
        const first = mapModel.pedestrianOffsetPose?.(edge, crossing.along, 1, -offset) || { x:roadPose.x, y:roadPose.y - offset };
        const second = mapModel.pedestrianOffsetPose?.(edge, crossing.along, 1, offset) || { x:roadPose.x, y:roadPose.y + offset };
        const from = mapModel.getNode?.(crossing.nodeId) || null;
        const to = from
          ? (edge.from === crossing.nodeId ? mapModel.getNode(edge.to) : mapModel.getNode(edge.from))
          : null;
        const heading = Math.atan2((to?.y ?? edge.points.at(-1).y) - (from?.y ?? edge.points[0].y), (to?.x ?? edge.points.at(-1).x) - (from?.x ?? edge.points[0].x));
        const vector = { x:-Math.sin(heading), y:Math.cos(heading) };
        const tangent = { x:Math.cos(heading), y:Math.sin(heading) };
        const curbA = mapModel.pedestrianOffsetPose?.(edge, crossing.along, 1, -edge.width / 2) || first;
        const curbB = mapModel.pedestrianOffsetPose?.(edge, crossing.along, 1, edge.width / 2) || second;
        const stopLines = [-1, 1].map((directionSign) => Object.freeze({
          x:roadPose.x - tangent.x * directionSign * 34,
          y:roadPose.y - tangent.y * directionSign * 34,
          directionSign,
          a:Object.freeze({
            x:roadPose.x - tangent.x * directionSign * 34 + vector.x * (edge.width / 2 - 10),
            y:roadPose.y - tangent.y * directionSign * 34 + vector.y * (edge.width / 2 - 10)
          }),
          b:Object.freeze({
            x:roadPose.x - tangent.x * directionSign * 34 - vector.x * (edge.width / 2 - 10),
            y:roadPose.y - tangent.y * directionSign * 34 - vector.y * (edge.width / 2 - 10)
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
          stopLine:Object.freeze({ x:stopLines[0].x, y:stopLines[0].y, offset:34 }),
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
      });
      corridors.push({ edge, length, offset, crossings:edgeCrossings });
    }

    for (const { edge, length, offset, crossings } of corridors) {
      const marks = [
        { along:0, nodeId:edge.from, crossing:null },
        ...crossings.map((crossing) => ({ along:crossing.along, nodeId:null, crossing })),
        { along:length, nodeId:edge.to, crossing:null }
      ];
      for (const side of [-1, 1]) {
        const nodeAt = (mark, boundaryIndex) => mark.crossing
          ? mark.crossing.record.endpointNodeIds[side < 0 ? 0 : 1]
          : edge.id + ":side:" + side + ":" + (boundaryIndex === 0 ? "from" : "to");
        for (let index = 0; index < marks.length - 1; index += 1) {
          const from = marks[index];
          const to = marks[index + 1];
          const points = [];
          const steps = Math.max(2, Math.ceil((to.along - from.along) / 85));
          for (let step = 0; step <= steps; step += 1) {
            const along = from.along + (to.along - from.along) * step / steps;
            const pose = mapModel.pedestrianOffsetPose?.(edge, along, 1, side * offset);
            if (pose) points.push({ x:pose.x, y:pose.y });
          }
          if (points.length < 2) continue;
          const startId = nodeAt(from, 0);
          const endId = nodeAt(to, 1);
          const segmentId = "sidewalk:" + edge.id + ":" + side + ":" + index;
          addSegment({ id:segmentId, type:"sidewalk", from:startId, to:endId, points, length:to.along - from.along, sourceEdgeId:edge.id, side });
          if (index === 0) addEndpoint(edge.from, startId, points[0], segmentId);
          if (index === marks.length - 2) addEndpoint(edge.to, endId, points.at(-1), segmentId);
        }
      }
    }

    // Connect adjacent sidewalk corners around each junction perimeter. A
    // carriageway never becomes a generic pedestrian edge; crossing it still
    // requires one of the explicit crosswalk segments above.
    for (const [nodeId, endpoints] of endpointGroups) {
      if (endpoints.length < 2) continue;
      const center = mapModel.getNode?.(nodeId);
      if (!center) continue;
      endpoints.sort((a, b) => Math.atan2(a.point.y - center.y, a.point.x - center.x) - Math.atan2(b.point.y - center.y, b.point.x - center.x));
      for (let index = 0; index < endpoints.length; index += 1) {
        const a = endpoints[index];
        const b = endpoints[(index + 1) % endpoints.length];
        const span = distance(a.point, b.point);
        if (span < 1 || span > 340) continue;
        const id = "sidewalk-corner:" + nodeId + ":" + index;
        addSegment({ id, type:"sidewalk", from:a.nodeId, to:b.nodeId, points:[a.point, b.point], length:span, junctionId:nodeId });
      }
    }

    // Facility paths meet a road node at the mapped access point. Tie that
    // point to its nearest curb endpoint, keeping the final short connection
    // explicitly typed as facility access rather than silently reusing the
    // vehicle edge as a pedestrian route.
    for (const access of publicPathEndpoints) {
      const curbEndpoints = endpointGroups.get(access.nodeId) || [];
      if (!curbEndpoints.length) continue;
      const curb = curbEndpoints.reduce((best, candidate) =>
        !best || distance(access.point, candidate.point) < distance(access.point, best.point) ? candidate : best, null);
      const length = distance(access.point, curb.point);
      if (length < 1) continue;
      addSegment({
        id:"facility-access:curb:" + access.sourceEdgeId + ":" + access.nodeId + ":" + curb.sourceId,
        type:"facility-access",
        from:access.nodeId,
        to:curb.nodeId,
        points:[access.point, curb.point],
        length,
        sourceEdgeId:access.sourceEdgeId
      });
    }

    for (const segment of segments) {
      for (const [from, to] of [[segment.from, segment.to], [segment.to, segment.from]]) {
        const links = adjacency.get(from) || [];
        links.push({ segmentId:segment.id, nodeId:to, segment });
        adjacency.set(from, links);
      }
    }
    const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
    return Object.freeze({
      nodes:Object.freeze([...new Set(segments.flatMap((segment) => [segment.from, segment.to]))]),
      segments:Object.freeze(segments),
      segmentsById,
      adjacency,
      nodePositions,
      crosswalks:Object.freeze(crosswalks)
    });
  }

  function findRoute(graph, startNodeId, endNodeId) {
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
