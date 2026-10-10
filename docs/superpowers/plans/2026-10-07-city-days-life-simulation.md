# 若葉の街・生活シミュレーション再設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 暮らし・住民・仕事・家・地域・徒歩/電車/車がつながり、失敗から立て直せる自由な生活シミュレーションを実装する。

**Architecture:** 既存の静的HTML/JavaScriptモデルを活かし、車所有と初日導線に小さな状態モデルを導入する。ゲームスナップショットにバージョン付き移行を加え、経済・関係・活動の結び付きは既存モデルの責務内で拡張する。Vault同期境界は維持する。

**Tech Stack:** 静的HTML/CSS/JavaScript、Node.js `node:test`、既存ブラウザー検証スクリプト。

**Spec:** `docs/superpowers/specs/2026-10-07-city-days-life-simulation-design.md`

## Global Constraints

- 日ごとの必須タスクや単一のクリア条件を設けない。
- 時間、予定、営業時間、天候、家計、体調、移動時間は意味のある判断材料として保つ。
- 不利益は報酬減、一時的不便、機会の先送り等の回復可能な範囲に限定する。
- 車は主要機能とし、車獲得前も仕事、交流、家、地域活動の主要ループを成立させる。
- 既存Vault同期・revision/conflict境界を変更せず、秘密情報や復号済み保護データをゲーム保存へ追加しない。
- 既存進行データは移行し、ユーザーデータや現在の未コミット変更を破壊しない。
- 静的構成を維持し、新たな依存パッケージを追加しない。

## Review Focus

- 古い/欠損スナップショット — 旧セーブは車所有済みとして復元し、新規セーブのみ未所有にする（Task 2）。
- 車未所有時の車接触/操作 — 運転・給油・経路/降車操作を実行できない（Task 2）。
- 家賃支払後のマイナス資金 — 住居や行動を失わず、明示された収入導線で回復できる（Task 3）。
- 予定外の交流・活動順序 — メインルートを強制せず、複数活動を任意の順で行える（Task 4）。
- Vaultロック/オフライン/競合 — ローカル案内が同期失敗を隠さず、既存のrevision保護を保つ（Task 1/5）。

---

### Task 1: 保存仕様と初日導線を現行実装に揃える

**Files:**
- Modify: `game/index.html`
- Modify: `docs/game-guide.md`
- Modify: `docs/game-manual.md`
- Modify: `game/game.js` (初日HUD/今日の選択肢)
- Test: `tests/game-runtime.test.mjs`
- Test: `tests/game-cloud-save.test.mjs`

**Interfaces:**
- Consumes: `CityDaysCloudSave.initialize({capture, restore})`, existing status DOM nodes.
- Produces: 初日の候補が目標命令ではなく、仕事・交流・地域/趣味・移動から任意に選べるHUD案内。説明書の保存内容はVault利用条件と一致。

- [x] **Step 1: 旧説明の不一致を固定するテストを追加** — 手動/端末保存なしとする記述がなく、Vaultロック・同期成功・失敗の案内が存在することを静的テストで確認。
- [x] **Step 2: テスト失敗を確認** — 変更前にHUDとガイドの2テストが失敗。
- [x] **Step 3: UIと文書を更新** — `game/index.html` の初日文言を自由な複数候補にし、説明書にVaultを開いた状態での同期、自動保存間隔、開けない時の制限を記す。
- [x] **Step 4: 関連テストを通す** — `node --test tests/game-runtime.test.mjs tests/game-cloud-save.test.mjs` 169件成功。

### Task 2: 新規プレイの序盤車獲得と旧セーブ互換を実装する

**Files:**
- Create: `game/vehicle-progression.js`
- Modify: `game/game.js`
- Modify: `game/index.html`
- Create: `tests/vehicle-progression.test.js`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Produces: `CityDaysVehicleProgression.createNewGame()`, `normalize(saved)`, `purchase(progress, cash)`。価格は **¥10,000**（初期資金だけでは買えず、カフェ通常シフト1回または配達等で得られる額）、新規開始は未所有、既存v1スナップショットで所有フラグ欠落時は移行上所有済みとする。
- Snapshot v1 に `vehicleProgression` を追加。既存schema versionを上げずoptional fieldで後方互換を保つ。

- [x] **Step 1: モデルテストを追加** — 新規未所有、価格不足、購入成功、二重購入拒否、legacy save車所有済み移行を確認。
- [x] **Step 2: テスト失敗を確認** — `node --test tests/vehicle-progression.test.mjs`。
- [x] **Step 3: progressionモデルを実装** — 純粋関数で入力を正規化し、失敗時にcash/progressを変更しない。
- [x] **Step 4: ゲームへ接続** — 新規プレイヤーは当初車を利用できず、自宅近くに停めた中古車のそばで¥10,000で購入できる。購入時に車を自宅近くの有効道路へ配置する。旧セーブの欠落flagは所有済み。未所有時に車の乗車・燃料購入を出さず、描画・交通衝突・ルート生成に破綻がないよう車エンティティを扱う。徒歩、電車、全仕事/交流/地域活動は引き続き利用可能。
- [x] **Step 5: 保存復元/導線テストを通す** — progression/runtimeテスト。
- [ ] **Step 6: ブラウザーで新規/旧セーブ/購入後を確認** — CUAがfile URLを明示的に拒否。代替ブラウザー経路の回避も禁止されたため未実施。

### Task 3: 生活経済の回復可能性を保証する

**Files:**
- Create: `game/life-economy.js`
- Modify: `game/game.js`
- Modify: `game/index.html`
- Create: `tests/life-economy.test.js`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Produces: `chargeRent(cash, rent)` result `{cash, arrears, status}`。不足分を猶予付き滞納として追跡し、差押え・退出・行動ロックをしない。
- 既存データにarrearsがない場合は0へ移行。家賃猶予 **14 game-days**、新規債務は家賃不足額だけで利息なし。

- [x] **Step 1: 失敗ケースのテストを追加** — 全額支払い、不足時に現金を0未満へ落とさない、不足額記録、後日の分割/全額返済、猶予超過でも退出/進行停止がないことを確認。
- [x] **Step 2: テスト失敗を確認** — `node --test tests/life-economy.test.mjs`。
- [x] **Step 3: 経済モデル実装** — 家賃を一回の引落しで所持金以下に制限し、残額を利息なし滞納として管理。返済可能額・状態を返す。
- [x] **Step 4: ゲーム連携** — 次回家賃、滞納額、猶予状態をHUD/phoneに提示し、仕事と配達の再開導線を示す。生活行動・移動・交流を資金不足だけで封鎖しない。
- [x] **Step 5: モデル/ランタイムテストを通す** — 関連テストと `git diff --check`。
- [ ] **Step 6: ブラウザーで資金不足を確認** — CUAのfile URL拒否により実操作未確認。

### Task 4: 行動結果を関係・地域・住まいへ返す

**Files:**
- Inspect/Modify: `game/social-npc-system.js`, `game/community-center.js`, `game/community-garden.js`, `game/home-crafting.js`, `game/game.js`
- Tests: 対応する `tests/*` モデルテストと `tests/game-runtime.test.mjs`

**Interfaces:**
- Existing models remain authorities for their own progress. New cross-system effects are committed through explicit result fields/callbacks and saved via existing snapshot; no duplicate friendship/garden canonical state.
- 任意の交流/活動が少なくとも2つの既存領域に結果を返す（関係、地域活動、家、スキル等）。

- [x] **Step 1: 現在の報酬と相互作用を棚卸し** — 菜園収穫→食料、講座→共有スキル、サークル→交流、手作り品→関係の接続を確認。
- [x] **Step 2: 接続不足を示すテストを追加** — 既存の接続と食料反映を検証。
- [x] **Step 3: 最小の明示的接続を実装** — 収穫結果が自宅料理に使えることを通知し、既存報酬バランスを維持。
- [x] **Step 4: 各モデルとゲーム保存のテストを通す** — integrationテスト。
- [ ] **Step 5: ブラウザーで2種類以上の活動経路を確認** — CUAのfile URL拒否により実操作未確認。

### Task 5: 全体の回帰、UI、説明書を整える

**Files:**
- Modify as needed: `game/index.html`, `game/game.css`, `game/game.js`, `docs/game-guide.md`, `docs/game-manual.md`, related tests.

**Interfaces:**
- Consumes: tasks 1–4 final game state and UI.
- Produces: responsive and accessible onboarding, accurate user guide/manual, unchanged Vault conflict semantics.

- [x] **Step 1: 主要フローの回帰を追加/更新** — 新規開始、Vault復元、旧セーブ移行、徒歩/電車、車購入/利用、家賃不足回復、関係/地域活動を確認。
- [x] **Step 2: PC/モバイル画面を調整** — 初回選択と保存状態が表示されるHUDを調整。端末での実操作は未確認。
- [x] **Step 3: ガイドとマニュアルをコードに一致** — 実際の価格、獲得条件、保存条件、回復方法を記述。
- [ ] **Step 4: 完全検証** — コマンド検証を実行。ブラウザーのPC/モバイル主要フローはCUAがfile URLを拒否したため未実施。

## Self-Review

- Spec coverage: daily choice/onboarding (Tasks 1,5); car acquisition and commute roles (Task 2); recoverable economy (Task 3); cross-system relationships/home/community (Task 4); save and docs (Tasks 1,5); integrations and final checks (Task 5).
- Step scan: each task separates tests, implementation, and UI verification; all concrete behavior with balance implications uses exact rules above.
- Type consistency: progression model results are pure and snapshot-backed; economy result owns cash/arrears; cross-system state stays with existing models.
- Review focus: all five risks have explicit owning task/tests.
- Proportion: plan is organized around five independently reviewable deliverables for an architectural scope.
