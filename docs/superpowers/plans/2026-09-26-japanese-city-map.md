# 日本風都市マップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 格子状の道路生成を固定ブループリント型の日本風都市マップへ置き換え、描画・衝突判定・施設・経路探索・交通・保存データを同じMapModelで動作させる。

**Architecture:** `game/map-model.js` が道路ノード、ポリラインエッジ、歩道、区画、施設入口、駅入口を保持し、ブラウザでは `window.CityDaysMapModel`、NodeテストではCommonJS互換APIとして提供する。`game/game.js` はMapModelを利用するアダプタ層に移行し、既存のゲームルールやUIは維持する。マップ形状は固定ブループリント、装飾のみ決定的な乱数とする。

**Tech Stack:** 静的HTML、Canvas 2D、Vanilla JavaScript、Node.js built-in test runner、既存の `npm test` / `npm run verify:static`。

**Spec:** `docs/superpowers/specs/2026-09-26-japanese-city-map-design.md`

## Global Constraints

- 対象は架空都市であり、特定の実在都市や道路形状をそのまま再現しない。
- マップの形状は固定ブループリントとして定義し、道路接続性や施設座標を装飾乱数で変えない。
- 既存の施設ID (`home`、`cafe`、`store`、`park`、`gym`、`library`) と `testCodeLifeSimSave:v1` の読み込み互換性を維持する。
- マップデータは外部ファイルやネットワークに依存しない。
- ゲームルール、通貨、ニーズ、施設アクション、車両モデル、キャラクター描画は変更しない。
- `npm test` と `npm run verify:static` を実装中および完了時に実行する。

## Review Focus

- 旧セーブのプレイヤー・車両座標が新しい道路・建物に重なった場合も安全な地点へ移行されること（Task 6）。
- 袋小路、T字路、歩道専用路、車両通行禁止路が徒歩・車の経路探索で正しく区別されること（Task 1、Task 4）。
- ポリラインの端点が共有され、描画・最近傍判定・経路探索で道路の切れ目が生じないこと（Task 1、Task 5）。
- 鉄道、施設入口、ミニマップが新しい座標モデルと一致すること（Task 2、Task 5）。
- Canvas初期化・地図検証・経路失敗時に黒画面や未処理例外を出さないこと（Task 4、Task 7）。

---

### Task 1: MapModel APIと固定ブループリントの基盤

**Files:**
- Create: `game/map-model.js`
- Create: `tests/map-model.test.mjs`

**Interfaces:**
- Produces `createMapModel()` returning `{ version, worldSize, coast, nodes, edges, districts, parcels, places, stations, getNode(id), getEdge(id), neighbors(nodeId, options), nearestRoad(x, y, options), isRoad(x, y, options), isWalkable(x, y, radius), findRoute(startNodeId, endNodeId, options), validate() }`.
- `edges` contain `{ id, from, to, points, width, type, speedLimit, vehicle, pedestrian, signalized }`.
- `places` contain existing IDs and `{ id, x, y, entranceNodeId, roadNodeId }`; `stations` contain existing station IDs and access coordinates.

- [ ] **Step 1: Write failing model tests**

  Add tests for `validate()` returning no errors, valid node references, non-empty typed edges, all existing places/stations being present, walking reachability to every place, vehicle route reachability between car destinations, and nearest-road results on both a straight and curved edge.

- [ ] **Step 2: Run model tests to verify they fail**

  Run: `node --test tests/map-model.test.mjs`

  Expected: FAIL because `game/map-model.js` and `createMapModel()` do not exist.

- [ ] **Step 3: Implement `createMapModel()`**

  Define a fixed 10800×10800 blueprint with a station/commercial center, irregular residential streets, a park/shrine district, a small number of arterial roads, T-junctions, dead ends, pedestrian-only paths, and existing rail stations. Normalize all edge endpoints through shared node IDs. Implement polyline distance projection, graph traversal using edge length, vehicle/pedestrian filtering, and `validate()` checks.

- [ ] **Step 4: Run model tests to verify they pass**

  Run: `node --test tests/map-model.test.mjs`

  Expected: all model tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add game/map-model.js tests/map-model.test.mjs
  git commit -m "feat(game): add Japanese city map model"
  ```

### Task 2: Browser loading and game constants/施設/駅の移行

**Files:**
- Modify: `game/index.html`
- Modify: `game/game.js` around world constants, `HOME`/`PLACES`, `TRAIN_STATIONS`, and initialization
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes `window.CityDaysMapModel.createMapModel()` from Task 1.
- Produces a single `const mapModel` in `game.js`; all later map adapters use it.

- [ ] **Step 1: Write failing integration tests**

  Assert that `index.html` loads `map-model.js` before `game.js`, `game.js` creates the model, the six existing place IDs remain present, and map validation is called before the first frame.

- [ ] **Step 2: Run integration tests to verify they fail**

  Run: `node --test tests/game-runtime.test.mjs`

  Expected: FAIL because the new script is not loaded and `mapModel` is not initialized.

- [ ] **Step 3: Load and initialize MapModel**

  Add a versioned `map-model.js` script before `game.js`, create `mapModel` once after Canvas checks, show the existing runtime error surface if validation fails, and derive `PLACES` / `TRAIN_STATIONS` from the model while preserving their existing IDs and UI-facing fields.

- [ ] **Step 4: Run integration tests**

  Run: `node --test tests/game-runtime.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add game/index.html game/game.js tests/game-runtime.test.mjs
  git commit -m "refactor(game): initialize shared map model"
  ```

### Task 3: Collision, parcels, buildings, and district lookup

**Files:**
- Modify: `game/game.js` functions `roadEdgeExists`, `roadNeighbors`, `roadSegmentStyle`, `nearestRoadSegmentInfo`, `isRoad`, `canStand`, `generateBuildings`, and district lookup
- Modify: `tests/map-model.test.mjs`

**Interfaces:**
- Consumes `mapModel.nearestRoad`, `mapModel.isRoad`, `mapModel.isWalkable`, `mapModel.parcels`, and `mapModel.districts`.
- Produces game-local adapters with existing call sites preserved where practical, so rendering and movement can migrate incrementally.

- [ ] **Step 1: Add failing collision and parcel tests**

  Test that a point on a vehicle road is road, a point on a pedestrian-only path is walkable but not vehicle road, a building parcel is not walkable, a dead-end remains bounded, and district lookup returns the blueprint district rather than a world-percentage label.

- [ ] **Step 2: Run focused tests**

  Run: `node --test tests/map-model.test.mjs`

  Expected: FAIL for the new collision/district assertions.

- [ ] **Step 3: Replace grid adapters and building generation**

  Route collision and nearest-road queries through MapModel. Generate ordinary buildings from map parcels with district-specific density and orientation; keep special facility rendering and IDs intact. Replace the percentage-based district name lookup with the containing district from MapModel.

- [ ] **Step 4: Run focused and full tests**

  Run: `node --test tests/map-model.test.mjs tests/game-runtime.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add game/game.js tests/map-model.test.mjs
  git commit -m "refactor(game): use map model for collision and parcels"
  ```

### Task 4: Walking and vehicle routing/traffic migration

**Files:**
- Modify: `game/game.js` route helpers, `buildLanePath`, signal lookup, traffic generation/update, saved-car road migration
- Modify: `tests/map-model.test.mjs`

**Interfaces:**
- Consumes `mapModel.findRoute()`, edge polylines, edge widths, speed limits, signalized nodes, and `nearestRoad()`.
- Produces existing route arrays and traffic state fields so driving UI, scoring, and destination selection remain unchanged.

- [ ] **Step 1: Add failing route and signal tests**

  Test that every existing facility pair has a vehicle route, pedestrian-only edges are excluded from vehicle routes but usable for walking, routes traverse a T-junction and dead end correctly, saved cars project onto a valid vehicle edge, and signal states are defined only at signalized nodes.

- [ ] **Step 2: Run focused tests**

  Run: `node --test tests/map-model.test.mjs`

  Expected: FAIL for route and signal integration assertions.

- [ ] **Step 3: Migrate route and traffic code**

  Replace grid-coordinate route construction with node/edge graph routes and polyline lane paths. Derive speed limits, signal orientation/state, stop offsets, and traffic spawn positions from edge metadata. Preserve current destination UI, vehicle controls, scoring, and collision behavior.

- [ ] **Step 4: Run tests and syntax checks**

  Run: `node --test tests/map-model.test.mjs tests/game-runtime.test.mjs` and `node --check game/game.js`.

  Expected: all tests pass and syntax check exits 0.

- [ ] **Step 5: Commit**

  ```bash
  git add game/game.js tests/map-model.test.mjs
  git commit -m "refactor(game): route traffic through city map graph"
  ```

### Task 5: Road, district, facility, and minimap rendering

**Files:**
- Modify: `game/game.js` drawing functions `drawSparseRoadNetwork`, `drawNeighborhoodGround`, `drawStreetProps`, `drawCityLandmarks`, `drawMinimap`, `drawTrafficLights`
- Modify: `game/game.css` only if new visual classes are required
- Modify: `tests/map-model.test.mjs`

**Interfaces:**
- Consumes MapModel visible-edge, parcel, district, place, station, and pedestrian-path data.
- Produces the same Canvas drawing lifecycle and HUD elements with no new external assets.

- [ ] **Step 1: Add failing rendering data tests**

  Assert that visible map rendering iterates MapModel edges rather than `ROAD_GAP` rows/columns, the minimap draws the same edge and facility IDs as MapModel, and signal rendering uses signalized nodes only.

- [ ] **Step 2: Run focused tests**

  Run: `node --test tests/map-model.test.mjs tests/game-runtime.test.mjs`

  Expected: FAIL against the current grid-based rendering signatures.

- [ ] **Step 3: Implement MapModel rendering adapters**

  Draw edge polylines with road-type widths and district palettes, add sidewalks and pedestrian paths, render parcels/landmarks without recreating grid blocks, and project the same geometry to the minimap. Keep the existing camera, world tilt, weather, day/night, and Canvas lifecycle.

- [ ] **Step 4: Run tests and static verification**

  Run: `node --test tests/map-model.test.mjs tests/game-runtime.test.mjs` and `npm run verify:static`.

  Expected: all tests pass and static verification passes.

- [ ] **Step 5: Commit**

  ```bash
  git add game/game.js game/game.css tests/map-model.test.mjs
  git commit -m "feat(game): render Japanese city districts and roads"
  ```

### Task 6: Save migration and regression coverage

**Files:**
- Modify: `game/game.js` state normalization, `loadGame`, `saveGame`, and car migration
- Modify: `tests/map-model.test.mjs`

**Interfaces:**
- Consumes existing `testCodeLifeSimSave:v1` payloads and MapModel migration helpers.
- Produces the same save key and fields plus `mapVersion` without breaking legacy reads.

- [ ] **Step 1: Add failing save migration tests**

  Test legacy player coordinates inside a new building, legacy player coordinates on a walkable road/path, saved car coordinates away from all roads, and unknown `mapVersion` values. Assert safe player/car fallback and cleared invalid route/destination state.

- [ ] **Step 2: Run focused tests**

  Run: `node --test tests/map-model.test.mjs`

  Expected: FAIL until load/save migration is map-aware.

- [ ] **Step 3: Implement migration**

  Preserve valid legacy positions, project invalid cars to the nearest vehicle edge, place unrecoverable entities at the home entrance, reset transient driving state, and write the current map version while retaining all existing gameplay fields.

- [ ] **Step 4: Run full tests**

  Run: `npm test` and `npm run verify:static`.

  Expected: all tests pass and static verification passes.

- [ ] **Step 5: Commit**

  ```bash
  git add game/game.js tests/map-model.test.mjs
  git commit -m "fix(game): migrate saved state to Japanese city map"
  ```

### Task 7: Local browser verification and final integration

**Files:**
- Modify: any implementation files only if browser verification exposes a defect
- Test: `tests/map-model.test.mjs`, `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes the complete MapModel integration from Tasks 1–6.
- Produces verified behavior at `http://localhost:5173/game/`.

- [ ] **Step 1: Run the full automated suite**

  Run: `npm test`, `npm run verify:static`, `node --check game/game.js`, and `git diff --check`.

  Expected: zero test failures, static verification success, syntax success, and no diff whitespace errors.

- [ ] **Step 2: Exercise the browser**

  Open `http://localhost:5173/game/` using `@Browser`. Inspect the initial Canvas, Console logs, script loading, Canvas dimensions, and runtime-error surface. Walk through the central, residential, park/shrine, and station areas; open/close controls; use a facility; enter driving mode; choose a destination; observe signals; save; reload; and verify the map remains stable.

- [ ] **Step 3: Fix and re-run browser checks**

  For each observed issue, add or update a regression test before changing production code, verify the test fails, implement the minimal fix, then repeat the browser scenario.

- [ ] **Step 4: Review final diff and commit**

  Run: `git status --short` and `git diff --stat`.

  Expected: only the intended map model, game integration, tests, and versioned script/spec changes are present.

- [ ] **Step 5: Commit**

  ```bash
  git add game tests docs/superpowers/plans/2026-09-26-japanese-city-map.md
  git commit -m "feat(game): replace grid map with Japanese city layout"
  ```

