# 駅前クレーンゲーム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 若葉駅前に新施設と、操作可能で保存されるクレーンゲーム・景品コレクションを追加する。

**Architecture:** ルールと記録を純粋なUMDモデルへ分離し、マップ定義・既存Canvasゲーム・DOMミニゲームUIから利用する。UIは結果をモデルへ委ね、開始費用と結果適用を一度だけ行う。

**Tech Stack:** 静的HTML/CSS/JavaScript、既存Nodeテスト、headless Chromium/CDP。製品依存追加なし。

**Spec:** `docs/superpowers/specs/2026-09-29-arcade-claw-gameplay-design.md`

## Global Constraints

- `game/character-showcase.html`を変更・コミット・pushしない。
- 製品は静的HTML/CSS/JavaScriptのまま、ビルドステップ・製品依存を追加しない。
- 料金は1プレイ¥300、プレイ1回あたりゲーム内5分、景品は6種類。
- 旧セーブは空のコレクションとして復元できる。
- ローカル画面検証はCLI/headless Chromiumで行い、PC/モバイルの修正後スクリーンショットを含める。

## Review Focus

- 不正な座標・乱数値をモデルが拒否する — `arcade-games.test.mjs`に不正入力テスト。
- 連打・二重イベントで二重徴収/二重報酬しない — 統合テストで単一プレイ一回適用を検証。
- 空資金・旧形式・破損コレクションでも安全 — 正規化・復元テスト。
- 狭い画面でも操作ボタンが画面外に出ない — モバイルheadlessのDOM寸法検査。
- ミニゲーム離脱後にキー入力が通常操作と競合しない — headlessで開始/終了後の入力確認。

---

### Task 1: ルールモデルとテスト

**Files:**
- Create: `game/arcade-games.js`
- Create: `tests/arcade-games.test.mjs`
- Modify: `package.json`（既存テスト収集方式に沿って追加）

**Interfaces:**
- Produce `CityDaysArcadeGames`: `PRIZE_CATALOG`, `PLAY_COST`, `PLAY_DURATION`, `createProgress()`, `normalizeProgress(value)`, `startPlay(progress, cash)`, `resolvePlay(progress, stopPosition, randomValue)`, `listCollection(progress)`。
- 失敗結果は `{ok:false, reason}`、成功は更新済みprogressと差額/結果を返す。不正値は状態を変更しない。

- [ ] **Step 1:** 開始費用・残高不足・正常化・不正値・操作位置依存・獲得/重複記録を網羅する失敗テストを書く。
- [ ] **Step 2:** `node --test tests/arcade-games.test.mjs`で未実装による失敗を確認。
- [ ] **Step 3:** 純粋モデルと6種類の景品カタログを実装する。乱数値を引数に受けてテストを決定的にする。
- [ ] **Step 4:** 同テストを通す。
- [ ] **Step 5:** モデルとテストをコミットする。

### Task 2: マップ施設・経路

**Files:**
- Modify: `game/map-model.js`
- Modify: `tests/map-model.test.mjs`

**Interfaces:**
- 施設ID `arcade`、入口ノード `arcade-entrance`、歩道接続ノード `arcade-walk`。入口は若葉駅北東の商店街に配置し、既存の歩道網へ接続する。
- 施設表示名は「若葉ゲームコーナー」、記号は「遊」。

- [ ] **Step 1:** 施設の存在、入口ルート、歩行者接続性、道路/建物との妥当性を検査する失敗テストを追加。
- [ ] **Step 2:** 該当map-modelテストを実行し失敗を確認。
- [ ] **Step 3:** ノード、歩道エッジ、施設定義を追加し、必要ならMAP_VERSIONを更新。
- [ ] **Step 4:** 全マップモデルテストを通す。
- [ ] **Step 5:** マップ変更をコミットする。

### Task 3: セーブ統合・施設メニュー

**Files:**
- Modify: `game/index.html`
- Modify: `game/game.js`
- Modify: `game/game.css`
- Modify: `tests/game-runtime.test.mjs`（既存のランタイム/スナップショット検査）

**Interfaces:**
- HTMLは`arcade-games.js`を`game.js`より前に読み込む。
- `state.arcade`はモデル正規化済みの進行状態。
- 施設メニューにプレイ開始とコレクション確認を置く。開始時に`startPlay`が成功した場合のみ所持金更新と5分経過を行う。

- [ ] **Step 1:** 初期化、旧スナップショット復元、進行状態の保存/復元、料金不足・正常購入を検査するテストを書く。
- [ ] **Step 2:** 該当テストを実行し失敗を確認。
- [ ] **Step 3:** state/snapshot統合、script include、施設メニューと開始・閲覧を実装する。
- [ ] **Step 4:** 関連するユニット・統合テストを通す。
- [ ] **Step 5:** 保存・メニュー統合をコミットする。

### Task 4: 操作型クレーンゲームUI

**Files:**
- Modify: `game/index.html`
- Modify: `game/game.css`
- Modify: `game/game.js`

**Interfaces:**
- オーバーレイ状態は `idle | aiming | result`。`aiming`で左右入力、確定は一回だけ。確定後はモデルの`resolvePlay`を一度実行する。
- DOMボタンは左・右・つかむ・終了。キーボードはA/Dまたは左右、Enter/Spaceで確定、Escapeで終了。
- ミニゲーム内の決定的な景品配置と停止位置をモデルへ渡し、Canvasオーバーレイ上に結果・取得景品を描く。

- [ ] **Step 1:** UI状態とモデル結果のDOM/ゲーム統合テストを追加（1プレイ1回解決、終了後入力解除）。
- [ ] **Step 2:** テストを実行して失敗を確認。
- [ ] **Step 3:** DOMオーバーレイ内の専用Canvas遊技面、位置に連動する狙い、成功/失敗演出、再プレイ/コレクション/終了UI、タッチ操作を追加。
- [ ] **Step 4:** キー連打・タッチ連打・終了動作のテストを通す。
- [ ] **Step 5:** ゲームUIをコミットする。

### Task 5: ブラウザ検証・仕上げ

**Files:**
- Create: `scripts/verify-arcade-claw-headless.mjs`
- Modify: 必要な場合のみ上記ゲームファイルと関連テスト

- [ ] **Step 1:** ローカルHTTP配信を開き、施設訪問、プレイ開始、成功/失敗、景品コレクション、スナップショット復元を自動検証するCLI/CDPシナリオを書く。
- [ ] **Step 2:** headless Chromiumでシナリオを実行し、console warning/error、pageerror、failed request、HTTP bad responseを収集し、デスクトップ/モバイル全画面スクリーンショットを取得。
- [ ] **Step 3:** 見つかった問題をテスト先行で修正する。
- [ ] **Step 4:** 修正後に両画面を再撮影・確認し、`npm test`、`npm run verify:static`、`git diff --check`を実行。
- [ ] **Step 5:** 成果物一覧を検査して`character-showcase.html`と共有側の未コミット成果物が含まれないことを確認し、変更をコミットする。
