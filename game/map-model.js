(function initCityDaysMapModel(global) {
  "use strict";

  const MAP_VERSION = "japan-v1";
  const WORLD_SIZE = 10800;
  const COAST = 160;

  const node = (id, x, y, district) => ({ id, x, y, district });
  const point = (x, y) => ({ x, y });

  const BLUEPRINT_NODES = [
    node("west-station-road", 1900, 4700, "west-residential"),
    node("west-junction", 2900, 4500, "west-residential"),
    node("north-west", 3000, 3200, "library-quarter"),
    node("library-road", 3700, 3600, "library-quarter"),
    node("park-west", 4700, 3000, "park-shrine"),
    node("park-road", 5400, 3000, "park-shrine"),
    node("park-east", 6600, 3000, "park-shrine"),
    node("gym-road", 7000, 3500, "park-shrine"),
    node("central-west", 4100, 4600, "station-commercial"),
    node("central", 5200, 4700, "station-commercial"),
    node("east-junction", 7600, 4550, "east-commercial"),
    node("east-station-road", 8600, 4700, "east-commercial"),
    node("cafe-road", 4200, 5200, "station-commercial"),
    node("home-road", 5000, 6000, "south-residential"),
    node("store-road", 6500, 5300, "east-commercial"),
    node("south-west", 2900, 6100, "south-residential"),
    node("south-east", 7800, 6200, "south-residential"),
    node("residential-west", 3500, 5600, "south-residential"),
    node("residential-east", 7000, 6100, "south-residential"),
    node("home-entrance", 5000, 6250, "south-residential"),
    node("cafe-entrance", 4050, 5350, "station-commercial"),
    node("store-entrance", 6750, 5350, "east-commercial"),
    node("park-entrance", 5400, 2800, "park-shrine"),
    node("gym-entrance", 7150, 3650, "park-shrine"),
    node("library-entrance", 3650, 3800, "library-quarter")
  ];

  const BLUEPRINT_EDGES = [
    ["arterial-west", "west-station-road", "west-junction", [[1900,4700],[2250,4550],[2600,4475],[2900,4500]], "arterial", 216, 60, true, true, true],
    ["arterial-central-west", "west-junction", "central-west", [[2900,4500],[3300,4520],[3700,4580],[4100,4600]], "arterial", 216, 60, true, true, false],
    ["arterial-central", "central-west", "central", [[4100,4600],[4500,4650],[4850,4740],[5200,4700]], "arterial", 216, 60, true, true, true],
    ["arterial-east", "central", "east-junction", [[5200,4700],[5700,4620],[6300,4510],[7000,4520],[7600,4550]], "arterial", 216, 60, true, true, true],
    ["arterial-east-station", "east-junction", "east-station-road", [[7600,4550],[7950,4580],[8250,4660],[8600,4700]], "arterial", 216, 60, true, true, true],
    ["collector-north-west", "west-junction", "north-west", [[2900,4500],[2820,4100],[2880,3650],[3000,3200]], "collector", 148, 40, true, true, false],
    ["collector-library", "north-west", "library-road", [[3000,3200],[3250,3320],[3500,3500],[3700,3600]], "collector", 132, 40, true, true, false],
    ["collector-library-central", "library-road", "central-west", [[3700,3600],[3850,3950],[3980,4300],[4100,4600]], "collector", 132, 40, true, true, false],
    ["collector-park-west", "library-road", "park-west", [[3700,3600],[4050,3350],[4400,3100],[4700,3000]], "collector", 126, 30, true, true, false],
    ["park-spine", "park-west", "park-road", [[4700,3000],[5050,2880],[5400,3000]], "park", 112, 20, true, true, true],
    ["park-spine-east", "park-road", "park-east", [[5400,3000],[5850,2860],[6250,2920],[6600,3000]], "park", 112, 20, true, true, false],
    ["collector-gym", "park-east", "gym-road", [[6600,3000],[6760,3230],[6880,3450],[7000,3500]], "collector", 126, 30, true, true, false],
    ["collector-gym-east", "gym-road", "east-junction", [[7000,3500],[7200,3820],[7420,4200],[7600,4550]], "collector", 132, 40, true, true, false],
    ["local-cafe", "central", "cafe-road", [[5200,4700],[4900,4850],[4550,5050],[4200,5200]], "shopping", 104, 20, true, true, false],
    ["local-cafe-home", "cafe-road", "home-road", [[4200,5200],[4380,5480],[4680,5750],[5000,6000]], "residential", 92, 20, true, true, false],
    ["local-home-east", "home-road", "south-east", [[5000,6000],[5600,6050],[6400,6150],[7000,6100],[7800,6200]], "residential", 92, 20, true, true, false],
    ["local-store", "central", "store-road", [[5200,4700],[5600,4860],[6050,5100],[6500,5300]], "shopping", 108, 20, true, true, false],
    ["local-store-south", "store-road", "south-east", [[6500,5300],[6820,5550],[7300,5850],[7800,6200]], "residential", 92, 20, true, true, false],
    ["local-west-south", "west-junction", "south-west", [[2900,4500],[2780,4950],[2820,5500],[2900,6100]], "residential", 92, 20, true, true, false],
    ["local-south-west", "south-west", "residential-west", [[2900,6100],[3150,5850],[3500,5600]], "alley", 72, 15, true, true, false],
    ["local-residential", "residential-west", "home-road", [[3500,5600],[3920,5750],[4450,5900],[5000,6000]], "alley", 72, 15, true, true, false],
    ["local-residential-east", "south-east", "residential-east", [[7800,6200],[7480,6120],[7200,6100],[7000,6100]], "alley", 72, 15, true, true, false],
    ["ped-park-loop", "park-entrance", "park-road", [[5400,2800],[5480,2880],[5400,3000]], "greenway", 54, 5, false, true, false],
    ["ped-gym-entry", "gym-entrance", "gym-road", [[7150,3650],[7080,3600],[7000,3500]], "sidewalk", 42, 5, false, true, false],
    ["ped-library-entry", "library-entrance", "library-road", [[3650,3800],[3650,3700],[3700,3600]], "sidewalk", 42, 5, false, true, false],
    ["ped-home-entry", "home-entrance", "home-road", [[5000,6250],[5000,6120],[5000,6000]], "sidewalk", 42, 5, false, true, false],
    ["ped-cafe-entry", "cafe-entrance", "cafe-road", [[4050,5350],[4120,5280],[4200,5200]], "sidewalk", 42, 5, false, true, false],
    ["ped-store-entry", "store-entrance", "store-road", [[6750,5350],[6680,5350],[6500,5300]], "sidewalk", 42, 5, false, true, false]
  ];

  const PLACE_DEFINITIONS = [
    { id: "home", name: "自宅", x: 5000, y: 6250, entranceNodeId: "home-entrance", roadNodeId: "home-road", color: "#d9b98b", symbol: "H" },
    { id: "cafe", name: "カフェ LUNE", x: 4050, y: 5350, entranceNodeId: "cafe-entrance", roadNodeId: "cafe-road", color: "#c88f72", symbol: "C" },
    { id: "store", name: "スーパー MARCHÉ", x: 6750, y: 5350, entranceNodeId: "store-entrance", roadNodeId: "store-road", color: "#74a88a", symbol: "S" },
    { id: "park", name: "中央公園", x: 5400, y: 2800, entranceNodeId: "park-entrance", roadNodeId: "park-road", color: "#72a66d", symbol: "P" },
    { id: "gym", name: "CITY GYM", x: 7150, y: 3650, entranceNodeId: "gym-entrance", roadNodeId: "gym-road", color: "#7898bd", symbol: "G" },
    { id: "library", name: "市立図書館", x: 3650, y: 3800, entranceNodeId: "library-entrance", roadNodeId: "library-road", color: "#9a8db9", symbol: "L" }
  ];

  const STATION_DEFINITIONS = [
    { id: "west", name: "西若葉駅", x: 1900, y: 4700, accessX: 1900, accessY: 4820, roadNodeId: "west-station-road" },
    { id: "central", name: "若葉駅", x: 5200, y: 4700, accessX: 5200, accessY: 4820, roadNodeId: "central" },
    { id: "east", name: "東若葉駅", x: 8600, y: 4700, accessX: 8600, accessY: 4820, roadNodeId: "east-station-road" }
  ];

  const DISTRICTS = [
    { id: "station-commercial", name: "駅前商業街", bounds: { x: 3300, y: 4200, w: 3600, h: 1500 } },
    { id: "west-residential", name: "西住宅地", bounds: { x: 1400, y: 3900, w: 2100, h: 3000 } },
    { id: "south-residential", name: "南住宅地", bounds: { x: 2600, y: 5400, w: 3300, h: 1800 } },
    { id: "park-shrine", name: "公園・神社地区", bounds: { x: 3900, y: 2300, w: 3600, h: 2100 } },
    { id: "library-quarter", name: "文教地区", bounds: { x: 2600, y: 2800, w: 1800, h: 1900 } },
    { id: "east-commercial", name: "東商業地区", bounds: { x: 6500, y: 4000, w: 2500, h: 2200 } }
  ];

  const PARCELS = [
    { id: "parcel-west-1", district: "west-residential", x: 1550, y: 5350, w: 700, h: 600, use: "residential", walkable: false },
    { id: "parcel-south-1", district: "south-residential", x: 3150, y: 6250, w: 500, h: 400, use: "residential", walkable: false },
    { id: "parcel-east-1", district: "east-commercial", x: 7350, y: 5000, w: 550, h: 430, use: "commercial", walkable: false },
    { id: "parcel-park-1", district: "park-shrine", x: 4550, y: 2350, w: 850, h: 350, use: "shrine", walkable: false }
  ];

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointSegmentProjection(target, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 < 0.001 ? 0 : Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / length2));
    const projected = point(a.x + dx * t, a.y + dy * t);
    return { t, point: projected, distance: distance(target, projected) };
  }

  function edgeFromDefinition(definition, nodeMap) {
    const [id, from, to, rawPoints, type, width, speedLimit, vehicle, pedestrian, signalized] = definition;
    const points = rawPoints.map(([x, y]) => point(x, y));
    const first = nodeMap.get(from);
    const last = nodeMap.get(to);
    points[0] = point(first.x, first.y);
    points[points.length - 1] = point(last.x, last.y);
    return { id, from, to, points, type, width, speedLimit, vehicle, pedestrian, signalized };
  }

  function createMapModel() {
    const nodes = BLUEPRINT_NODES.map((value) => ({ ...value }));
    const nodeMap = new Map(nodes.map((value) => [value.id, value]));
    const edges = BLUEPRINT_EDGES.map((value) => edgeFromDefinition(value, nodeMap));
    const places = PLACE_DEFINITIONS.map((value) => ({ ...value }));
    const stations = STATION_DEFINITIONS.map((value) => ({ ...value }));
    const districts = DISTRICTS.map((value) => ({ ...value, bounds: { ...value.bounds } }));
    const parcels = PARCELS.map((value) => ({ ...value }));
    const adjacency = new Map(nodes.map((value) => [value.id, []]));

    for (const edge of edges) {
      adjacency.get(edge.from).push({ edge, nodeId: edge.to });
      adjacency.get(edge.to).push({ edge, nodeId: edge.from });
    }

    function getNode(id) {
      return nodeMap.get(id) || null;
    }

    function getEdge(id) {
      return edges.find((edge) => edge.id === id) || null;
    }

    function neighbors(nodeId, options = {}) {
      const mode = options.mode || "pedestrian";
      return (adjacency.get(nodeId) || []).filter(({ edge }) => mode === "vehicle" ? edge.vehicle : edge.pedestrian);
    }

    function edgeLength(edge) {
      let length = 0;
      for (let i = 1; i < edge.points.length; i += 1) length += distance(edge.points[i - 1], edge.points[i]);
      return length;
    }

    function findRoute(startNodeId, endNodeId, options = {}) {
      if (!getNode(startNodeId) || !getNode(endNodeId)) return null;
      if (startNodeId === endNodeId) return { nodeIds: [startNodeId], edgeIds: [], distance: 0 };
      const frontier = [{ nodeId: startNodeId, cost: 0 }];
      const best = new Map([[startNodeId, 0]]);
      const previous = new Map();
      while (frontier.length) {
        frontier.sort((a, b) => a.cost - b.cost);
        const current = frontier.shift();
        if (current.nodeId === endNodeId) break;
        for (const { edge, nodeId } of neighbors(current.nodeId, options)) {
          const cost = current.cost + edgeLength(edge);
          if (best.has(nodeId) && best.get(nodeId) <= cost) continue;
          best.set(nodeId, cost);
          previous.set(nodeId, { nodeId: current.nodeId, edgeId: edge.id });
          frontier.push({ nodeId, cost });
        }
      }
      if (!best.has(endNodeId)) return null;
      const nodeIds = [];
      const edgeIds = [];
      let cursor = endNodeId;
      while (cursor !== startNodeId) {
        nodeIds.push(cursor);
        const step = previous.get(cursor);
        edgeIds.push(step.edgeId);
        cursor = step.nodeId;
      }
      nodeIds.push(startNodeId);
      nodeIds.reverse();
      edgeIds.reverse();
      return { nodeIds, edgeIds, distance: best.get(endNodeId) };
    }

    function nearestRoad(x, y, options = {}) {
      const target = point(x, y);
      const vehicleOnly = Boolean(options.vehicleOnly);
      let best = null;
      for (const edge of edges) {
        if (vehicleOnly && !edge.vehicle) continue;
        if (!vehicleOnly && !edge.pedestrian) continue;
        for (let i = 1; i < edge.points.length; i += 1) {
          const hit = pointSegmentProjection(target, edge.points[i - 1], edge.points[i]);
          if (!best || hit.distance < best.distance) {
            best = { edgeId: edge.id, distance: hit.distance, point: hit.point, segmentIndex: i - 1, t: hit.t, edge };
          }
        }
      }
      return best;
    }

    function contains(bounds, x, y) {
      return x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h;
    }

    function isRoad(x, y, options = {}) {
      const hit = nearestRoad(x, y, options);
      return Boolean(hit && hit.distance <= hit.edge.width / 2);
    }

    function isWalkable(x, y, radius = 0) {
      if (parcels.some((parcel) => !parcel.walkable && contains(parcel, x, y))) return false;
      const hit = nearestRoad(x, y);
      return Boolean(hit && hit.distance <= hit.edge.width / 2 + radius);
    }

    function districtAt(x, y) {
      return districts.find((district) => contains(district.bounds, x, y)) || null;
    }

    function validate() {
      const errors = [];
      const ids = new Set();
      for (const value of nodes) {
        if (ids.has(value.id)) errors.push(`duplicate node: ${value.id}`);
        ids.add(value.id);
      }
      const edgeIds = new Set();
      for (const edge of edges) {
        if (edgeIds.has(edge.id)) errors.push(`duplicate edge: ${edge.id}`);
        edgeIds.add(edge.id);
        if (!getNode(edge.from) || !getNode(edge.to)) errors.push(`edge endpoint missing: ${edge.id}`);
        if (edge.points.length < 2) errors.push(`edge has too few points: ${edge.id}`);
        if (edge.width <= 0) errors.push(`edge width invalid: ${edge.id}`);
        if (edge.points[0].x !== getNode(edge.from)?.x || edge.points[0].y !== getNode(edge.from)?.y) errors.push(`edge start mismatch: ${edge.id}`);
        const end = edge.points.at(-1);
        if (end.x !== getNode(edge.to)?.x || end.y !== getNode(edge.to)?.y) errors.push(`edge end mismatch: ${edge.id}`);
      }
      for (const place of places) {
        const entranceNode = getNode(place.entranceNodeId);
        const roadNode = getNode(place.roadNodeId);
        if (!entranceNode || !roadNode) {
          errors.push(`place node missing: ${place.id}`);
          continue;
        }
        if (!findRoute(place.entranceNodeId, place.roadNodeId, { mode: "pedestrian" })) errors.push(`place unreachable: ${place.id}`);
        if (!neighbors(place.roadNodeId, { mode: "vehicle" }).length) errors.push(`place road unreachable: ${place.id}`);
      }
      for (const station of stations) {
        if (!getNode(station.roadNodeId)) errors.push(`station road node missing: ${station.id}`);
      }
      return errors;
    }

    return Object.freeze({
      version: MAP_VERSION,
      worldSize: WORLD_SIZE,
      coast: COAST,
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      districts: Object.freeze(districts),
      parcels: Object.freeze(parcels),
      places: Object.freeze(places),
      stations: Object.freeze(stations),
      getNode,
      getEdge,
      neighbors,
      nearestRoad,
      isRoad,
      isWalkable,
      districtAt,
      findRoute,
      validate
    });
  }

  const api = Object.freeze({ createMapModel });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.CityDaysMapModel = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
