# コインランドリー機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 服ごとに清潔度が変化し、街のコインランドリーで着用中の服を洗える生活機能を追加する。

**Architecture:** `wardrobe.js` に所有衣装ごとの清潔度と純粋な経過・洗濯モデルを置く。`game.js` はゲーム時間、購入・着替え・スナップショット、施設UIを接続し、`map-model.js` は施設と歩行入口を追加する。静的ページの既存描画・アクションシートに従い、製品依存は追加しない。

**Tech Stack:** 静的 HTML/CSS/JavaScript、Node.js `node:test`、既存 CLI Playwright/Chromium。

**Spec:** `docs/superpowers/specs/2026-09-29-laundromat.md`

## Global Constraints

- アプリはビルド工程・本番依存のない静的 HTML/CSS/JavaScript。
- 所有している各衣装は個別の清潔度を持つ。新規衣装は清潔度100で開始する。
- 時間経過では、現在着用中の衣装だけが汚れる。非着用衣装の清潔度は変化しない。
- 汚れ：着用中のゲーム内1分につき清潔度0.08減少（約20時間で0になる）。
- 洗濯：1回300円、ゲーム内30分、営業時間06:00〜23:00。
- 洗う対象：現在着用中の衣装1着。
- `game/character-showcase.html` は他セッションのローカルテスト用であり、変更・ステージ・コミット・pushしない。
- `npm test`、`npm run verify:static`、`git diff --check` を実行する。
- localhostの画面確認はブラウザツールを使わず、CLIからPlaywright/Chromiumをheadless実行する。

## Review Focus

- 旧 wardrobe がない、あるいは不正な清潔度値を含むセーブ: 既定衣装を清潔度100として安全に復元するテストをTask 1/2に追加。
- 購入/着替えの時間経過と汚れ対象: 経過時間の前後で正しい衣装だけが減るテストをTask 2に追加。
- 洗濯の閉店またぎ・所持金不足・清潔済み: 状態、所持金、時刻が一切変わらないテストをTask 3に追加。
- 施設が歩行グラフ上は孤立、または建物と入口が不整合: `mapModel.validate()` と `findRoute(..., { mode:"pedestrian" })` を使うテストをTask 3に追加。
- 超長時間経過や非有限値: 清潔度を有限の0〜100に保つモデルテストをTask 1に追加。

---

### Task 1: 衣装ごとの清潔度モデル

**Files:**
- Modify: `game/wardrobe.js`
- Test: `tests/wardrobe.test.mjs`

**Interfaces:**
- Produces: `createWardrobe()` は `{ ownedOutfitIds, equippedOutfitId, cleanlinessByOutfitId }` を返す。`normalizeWardrobe(value)` は同じ形式を返す。既存の `buyOutfit` と `equipOutfit` は清潔度を保持して結果を返す。
- Produces: `advanceWear(wardrobe, minutes)` は着用衣装のみ `minutes * 0.08` 減らした新 wardrobe を返す。
- Produces: `launder(wardrobe, cash, minute)` は成功時 `{ ok:true, wardrobe, cashRemaining, duration:30, cost:300 }`、失敗時 `{ ok:false, reason, wardrobe }` を返す。失敗理由は `not-open`、`closing-time`、`insufficient-funds`、`already-clean`。
- Consumes: なし。

- [x] **Step 1: 失敗するモデルテストを書く** — 初期/購入衣装が100、汚れ時間が正確、非着用衣装不変、0境界、着替え後に状態保持、launderの成功・営業時間境界・閉店またぎ・残高不足・清潔済み・破損入力を検証する。
- [x] **Step 2: `node --test tests/wardrobe.test.mjs` で失敗を確認する** — 新しいAPI/期待状態がないことによる失敗を確認する。
- [x] **Step 3: `game/wardrobe.js` に純粋関数と正規化を実装する** — 汚れ速度0.08/分、料金300、所要30分、06:00以上かつ終了が23:00以下のときだけ洗濯可能とする。各関数は入力オブジェクトを変更しない。
- [x] **Step 4: `node --test tests/wardrobe.test.mjs` を再実行する** — 全テストPASS。
- [x] **Step 5: このタスクのファイルだけをコミットする** — `feat: track outfit cleanliness`。

### Task 2: ゲーム時間・衣装購入・着替え・セーブへの接続

**Files:**
- Modify: `game/game.js`
- Test: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 1の `advanceWear(wardrobe, minutes)` と正規化済み wardrobe 形式。
- Produces: 通常の `advanceTime` で着用中衣装の汚れが進み、購入・着替え・`buildGameSnapshot`・`applyGameSnapshot`・デバッグ取得で衣装状態を維持する。

- [x] **Step 1: ランタイム回帰テストを追加する** — 経過時間が `advanceWear` に接続され、旧セーブ復元・購入・着替え・snapshot round trip が状態を保ち、デバッグ出力がコピー/正規化されることを検証する。
- [x] **Step 2: `node --test tests/game-runtime.test.mjs` で失敗を確認する**。
- [x] **Step 3: `game/game.js` の既存状態遷移に接続する** — needsの減衰とは独立して衣装を進め、購入成功時は衣装状態100を初期化し、着替えでは既存記録を維持する。スナップショット旧形式は `normalizeWardrobe` で移行する。
- [x] **Step 4: `node --test tests/game-runtime.test.mjs` を再実行する** — 全テストPASS。
- [x] **Step 5: このタスクのファイルだけをコミットする** — `feat: connect outfit wear to game time`。

### Task 3: マップ施設と洗濯アクション

**Files:**
- Modify: `game/map-model.js`
- Modify: `game/game.js`
- Modify: `game/index.html`
- Test: `tests/map-model.test.mjs`
- Test: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes: Task 1の `launder(wardrobe, cash, minute)` とTask 2の状態連携。
- Produces: `laundromat` IDの施設「若葉コインランドリー」、歩行接続、表示可能なランドマーク、開店中の洗濯アクション。

- [x] **Step 1: 失敗テストを追加する** — 施設識別子/名称、徒歩ルートの存在、マップ検証成功、ゲーム本体がモデルAPIを読み込むこと、洗濯UIの成功・各失敗が状態を正しく更新/維持することを確認する。
- [x] **Step 2: `node --test tests/map-model.test.mjs tests/game-runtime.test.mjs` で失敗を確認する**。
- [x] **Step 3: `game/map-model.js` に施設・入口ノード・歩道エッジを追加する** — 若葉湯・住宅地周辺の空き区画を選び、既存建物/道路と重ねず、歩行ルートを `validate()` と `findRoute()` で確認する。
- [x] **Step 4: `game/game.js` と `game/index.html` で施設とアクションを接続する** — アクション前にモデル結果を検査し、成功時だけwardrobe/現金を更新して30分進める。営業時間外、閉店またぎ、残高不足、清潔済みは理由を提示し状態を変更しない。施設描画は既存タイプの描画処理に「洗濯機」記号/配色を追加する。
- [x] **Step 5: 対象テストを再実行する** — 全テストPASS、徒歩ルートが到達可能。
- [x] **Step 6: このタスクのファイルだけをコミットする** — `feat: add city laundromat`。

### Task 4: クローゼット表示と全体回帰・画面検証

**Files:**
- Modify: `game/game.js`
- Modify: `game/game.css`（既存UIで清潔度表示を表現できない場合のみ）
- Test: `tests/game-runtime.test.mjs`
- Test: `tests/wardrobe.test.mjs`

**Interfaces:**
- Consumes: Task 1〜3の衣装状態、時間進行、施設モデル。
- Produces: クローゼット内で所有衣装それぞれの清潔度・清潔状態・着用中が判別できるUI。

- [x] **Step 1: クローゼット表示のテストを追加する** — 所有する各衣装に清潔度と状態ラベルが表示され、現在着用中が分かり、着替え後も値が保持されることを検証する。
- [x] **Step 2: 対象テストを実行して表示テストの失敗を確認する**。
- [x] **Step 3: クローゼットUIを更新する** — 整数表示、清潔/少し汚れ/洗濯推奨の段階表示を行う。色のみで意味を伝えず、日本語テキストを併記する。
- [x] **Step 4: 全自動検証を実行する** — `npm test`、`npm run verify:static`、`git diff --check` がすべて成功する。
- [x] **Step 5: CLI Playwright/ChromiumでPC・モバイル実画面を検証する** — 洗濯前後/クローゼットのスクリーンショット、console error/warning、pageerror、failed request、HTTPエラーを記録し、問題があれば原因修正後に再撮影する。localhostのブラウザツールは使わない。
- [x] **Step 6: このタスクの対象ファイルだけをコミットする** — `feat: show outfit cleanliness in closet`。

## 仕様カバレッジ確認

- 衣装単位の初期化・汚れ・境界・着替え・購入: Task 1/2。
- 身体衛生との独立、時間の接続、スナップショット/旧形式互換性: Task 2。
- 施設の位置・外観・徒歩導線・表示: Task 3。
- 料金/時間/営業時間/失敗時の不変条件: Task 1/3。
- クローゼット表示・PC/モバイル・console/network確認・全テスト: Task 4。
- NPC/家庭用洗濯機/非同期ジョブ等は仕様どおり対象外。

### Task 5: 現行ゲーム説明書

**Files:**
- Create: `docs/game-manual.md`

- [x] 実装済みの操作・施設・生活機能だけをコードとゲーム内ヘルプに照らして記述する。
- [x] 服の清潔度/ランドリー、モバイル操作、保存されない制約を説明する。
- [x] 仕様案と実機能を混同していないことを読み返して確認する。
