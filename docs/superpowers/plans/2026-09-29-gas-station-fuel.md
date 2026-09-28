# 若葉石油と車両燃料 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 若葉石油を追加し、給油・燃料切れ回復を備えた車両燃料ループを出荷する。

**Architecture:** `car-fuel.js` に純粋な燃料計算を隔離し、既存の地図グラフ、ゲーム状態/セーブ、施設操作、運転HUDへ統合する。ブラウザ確認はCLI headless Chromiumのみ。

**Tech Stack:** 静的JavaScript、Node.js `node:test`、既存Chromium CDP/headless QA。依存追加なし。

**Spec:** `docs/superpowers/specs/2026-09-29-gas-station-fuel-design.md`

## Global Constraints

- 既存の静的HTML/CSS/JavaScript構成を保ち、本番依存やビルド手順を追加しない。
- 車タンク40 L、燃費1 L/1,000ワールド単位、価格150円/L、初期燃料12 L。
- 携行缶5 L・1,200円・所持上限1本。
- 旧セーブの燃料欠損は12 L・携行缶なしへ移行する。
- localhostはブラウザツールを使わずCLI headless Chromiumで確認する。

## Review Focus

- 壊れた/負の/容量超過の保存燃料 — Task 1の正規化テスト。
- 満タンや所持金不足での給油 — Task 1の不成立時不変テスト。
- 給油所の歩行/車ルートと建物・道路の重なり — Task 2の地図モデル検証。
- 衝突補正で移動が取り消されたフレーム — Task 3で消費距離ゼロを検証。
- 旧セーブ、燃料切れ、携行缶消費後の継続 — Task 3/4のランタイム・headlessテスト。

## ファイル構成

- 新規 `game/car-fuel.js`: 燃料計算の純粋モデル。
- 変更 `game/map-model.js`: 施設と経路。
- 変更 `game/game.js`: セーブ、車両、給油操作、描画。
- 変更 `game/index.html`, `game/game.css`: HUD。
- 変更 `tests/map-model.test.mjs`, `tests/game-runtime.test.mjs`; 新規 `tests/car-fuel.test.mjs`。
- 変更 `.superpowers/sdd/2026-09-29-gas-station-fuel/`: 作業台帳とheadless QA素材。

### Task 1: 燃料モデル

**Files:** Create `game/car-fuel.js`, `tests/car-fuel.test.mjs`.

**Interfaces:** `CityDaysCarFuel` exports `CAPACITY_LITERS`, `PRICE_PER_LITER`, `INITIAL_FUEL_LITERS`, `CAN_CAPACITY_LITERS`, `CAN_PRICE`, `normalizeFuel(value)`, `consumeFuel(fuel, distance)`, `refuel(fuel, amount, cash)`, `buyCan(count, cash)`, `useCan(fuel, count)`. Result operations return `{ok, reason, fuel, ...}` without mutating arguments.

- [ ] テストを先に書き、正常/異常保存値、距離消費、給油量の上限と費用、購入上限/所持金不足、携行缶使用を確認する。
- [ ] `node --test tests/car-fuel.test.mjs` が未実装APIで失敗することを確認。
- [ ] UMD/CommonJS互換の純粋モジュールを最小実装する。
- [ ] 同コマンドで全テストが通ることを確認。
- [ ] コミット `feat(game): add vehicle fuel economy model`。

### Task 2: 地図の給油所

**Files:** Modify `game/map-model.js`, `tests/map-model.test.mjs`.

**Interfaces:** `createMapModel().places` に `id:"fuel-station"`, `name:"若葉石油"`, `type:"fuel-station"` と有効な徒歩入口/車道入口/建物を含め、通常の `findRoute` で双方から到達可能にする。

- [ ] テストで施設ID、車ルート、徒歩入口ルート、全体 `validate()` を要求する。
- [ ] `node --test tests/map-model.test.mjs` が失敗することを確認。
- [ ] 既存ノード/辺を変更せず、衝突しない給油所接続を追加する。
- [ ] 同テストを通し、全地図検査結果が空であることを確認。
- [ ] コミット `feat(game): add wakaba fuel station to map`。

### Task 3: 車両燃料・保存・枯渇

**Files:** Modify `game/game.js`, `tests/game-runtime.test.mjs`.

**Interfaces:** セーブ `car.fuelLiters` と `car.portableCanCount` を読み書きする。既存 `updateCar(dt)` が衝突補正後の移動距離を `consumeFuel` に渡す。燃料0で加速不可、減速後安全停止時に既存の `exitCar()` 相当で降車し、車位置・データを保持する。

- [ ] テストで初期値、欠損旧セーブ移行、新値復元/保存、枯渇処理のコード経路を固定する。
- [ ] `node --test tests/game-runtime.test.mjs` が新要件で失敗することを確認。
- [ ] モデルを読み込み、状態と保存・移動処理へ統合する。
- [ ] 同テストと `npm test` を実行。
- [ ] コミット `feat(game): persist and consume vehicle fuel`。

### Task 4: 給油所UI・携行缶・HUD・視覚QA

**Files:** Modify `game/game.js`, `game/index.html`, `game/game.css`, `tests/game-runtime.test.mjs`; update ignored QA bridge/smoke in `.superpowers/sdd/2026-09-29-gas-station-fuel/`.

**Interfaces:** 給油所では10 L/満タン給油と携行缶購入。給油は徒歩中に停車した自車が給油機近くにある時のみ許可。携行缶使用は自車近くで給油不足かつ車両停止中のみ許可。運転HUDは残量Lとバーを表示する。

- [ ] DOM/処理テストと描画テストを先に追加し、欠落UI/操作が検出されることを確認。
- [ ] 給油所の外観、メニュー判定、携行缶消費、給油費用、HUDを実装。
- [ ] `npm test` と `npm run verify:static` を実行。
- [ ] CLI headless Chromiumで全画面撮影。console error/warning、pageerror、failed request、重要DOM/computed styleを記録し、給油所・満タン表示・携行缶・燃料切れをシナリオ確認する。
- [ ] 画面上の問題を直し、再撮影して視覚比較。
- [ ] コミット `feat(game): add refueling interaction and fuel HUD`。

### Task 5: 全体レビュー・同期

**Files:** 変更全体。

- [ ] 再度 `npm test` と `npm run verify:static` を実行。
- [ ] 差分と無視対象の作業台帳/デバッグ物を区別し、ユーザーの未追跡ファイルはステージしない。
- [ ] 現在ブランチの変更をコードレビューし、重大な問題はTDDで修正。
- [ ] `git status`, upstream、コミット履歴を確認してすべての作業コミットをPush。
- [ ] Push後のローカル/remote同期を確認。
