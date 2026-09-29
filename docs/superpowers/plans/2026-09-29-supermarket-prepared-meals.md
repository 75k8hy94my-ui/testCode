# スーパーの惣菜・弁当 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** スーパーで惣菜を買い、持ち歩き、鮮度内に食べられる日常ループを実装する。

**Architecture:** 純粋な惣菜モデルが価格・日次在庫・購入結果を管理し、既存packed-mealsが保持上限と賞味期限を管理する。ゲームUIは両モデルの結果を適用し、保存データに日次在庫のみを加える。

**Tech Stack:** 静的JavaScript、Node built-in test、headless Chromium。

**Spec:** `docs/superpowers/specs/2026-09-29-supermarket-prepared-meals-design.md`

## Global Constraints

- 静的HTML/CSS/JavaScriptを維持し、本番依存を追加しない。
- 既存の自炊食事保存形式と上限を後方互換に保つ。
- `game/character-showcase.html` はローカルテスト専用。編集、ステージ、コミット、Pushをしない。
- `npm test` と `npm run verify:static` を実行する。

## Review Focus

- 二重購入や売り切れ時に現金・在庫・食事が不整合にならない。
- 日番号の切り替え、古い／不正な在庫保存でも補充結果が安全。
- 食事上限、鮮度境界、絶対時刻の不正値が既存食事に影響しない。
- UIを再描画またはセーブ復元しても同日購入数が復活しない。
- 小さい画面で惣菜メニューと詳細・状態が操作可能。

---

### Task 1: 惣菜モデルと既存packed-meals接続

**Files:**
- Create: `game/store-prepared-food.js`
- Modify: `game/packed-meals.js`
- Create: `tests/arcade-prepared-food.test.mjs`
- Modify: `tests/packed-meals.test.mjs`

**Interfaces:**
- Produces `CityDaysArcadePreparedFood` with `MENU`, `createInventory()`, `normalizeInventory(value, day)`, `listMenu(inventory, day)`, `purchase(inventory, day, cash, mealInventory, itemId, now, packedMeals)`, `getItem(itemId)`.
- `purchase` returns `ok`, price/duration/cash remainder, next inventory, packed-meals inventory and meal ID on success; failures preserve both states.
- `packed-meals` adds recognized prepared-food metadata while keeping old `{recipeId, preparedAt, portions}` batches readable.

- [x] Add tests for catalog values, fresh daily stock, same-day decrement, next-day replenishment and malformed inventory normalization.
- [x] Add tests for successful purchase, invalid item/time, insufficient cash, sold out and six-portion capacity without state mutation on failure.
- [x] Run `node --test tests/store-prepared-food.test.mjs tests/packed-meals.test.mjs` and observe expected missing-model failures.
- [x] Implement model and packed-meal recognition/expiry/eat behavior.
- [x] Rerun the two test files; all pass.
- [x] Commit as `feat: model daily prepared food stock`.

### Task 2: Supermarket, consumption, and persistence integration

**Files:**
- Modify: `game/index.html`
- Modify: `game/game.js`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:** consume Task 1 model methods and prepared meal metadata.

- [x] Add a runtime test asserting supermarket catalog, current stock and prepared-food inventory state are observable.
- [x] Run focused test and observe it fail before UI integration.
- [x] Load the model and initialize/persist/restore day inventory with backward-compatible defaults.
- [x] Render purchase choices with price, stock, funds and capacity; apply model results exactly once.
- [x] Show prepared foods in the existing carry-meal list and apply their effect/time/freshness when eaten.
- [x] Run `node --test tests/game-runtime.test.mjs tests/store-prepared-food.test.mjs tests/packed-meals.test.mjs`; all pass.
- [x] Commit as `feat: sell and consume supermarket prepared meals`.

### Task 3: Headless gameplay verification

**Files:**
- Create: `scripts/verify-prepared-meals-headless.mjs`

**Interfaces:** consumes the game runtime’s existing localhost-only test hook, matching the arcade headless verification pattern.

- [x] Add a deterministic browser flow checking buying twice, exact cash/inventory changes, eating, sold-out or funds/capacity behavior, day refill, and game-snapshot restoration.
- [x] Capture desktop and mobile screenshots and collect console error/warning, pageerror, failed request and bad response diagnostics.
- [x] Run verifier; all checks pass and diagnostics are empty.
- [x] Commit as `test: verify supermarket prepared meal loop headlessly`.

**Final verification:** run `npm test`, `npm run verify:static`, the prepared-food headless verifier, `git diff --check`, and confirm `git diff --name-only` excludes `game/character-showcase.html`.
