# 若葉線きっぷ・一日乗車券 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** 若葉線の駅で切符を買い、運賃を支払って列車を利用できるようにする。

**Architecture:** 純粋な`rail-transit.js`が券・一日券・購入／乗車遷移を管理する。ゲーム実行は駅入口メニューを表示し、成功結果だけ現金・時間・乗車状態へ適用する。交通アプリは現在の所持情報を表示する。

**Tech Stack:** 静的JavaScript、Node built-in test、headless Chromium。

**Spec:** `docs/superpowers/specs/2026-09-29-wakaba-rail-fares-design.md`

## Global Constraints

- 静的HTML/CSS/JavaScriptを維持し、本番依存を追加しない。
- 旧ゲームスナップショットで券を作り出さず、空所持として移行する。
- `game/character-showcase.html` は編集、ステージ、コミット、Pushをしない。
- `npm test` と `npm run verify:static` を実行する。

## Review Focus

- 現金不足・所持上限・券なしで現金、所持品、乗車状態が変わらない。
- 一日券が日付変更後に使えず、購入直前の終了時刻で無効化される。
- 一日券と片道券の両方を持つ時に一回の乗車で二重消費しない。
- 列車が未到着でも券購入でき、停車中だけ乗車可能。
- モバイル駅メニューが表示領域内でスクロール・操作可能。

---

### Task 1: 券・一日券ルールモデル

**Files:**
- Create: `game/rail-transit.js`
- Create: `tests/rail-transit.test.mjs`

**Interfaces:** `createProgress()`, `normalizeProgress(value, day)`, `listOptions(progress, day, minute, cash)`, `buySingle(progress, cash)`, `buyDayPass(progress, day, minute, cash)`, `board(progress, day)`。

- [x] Write tests for starting state, legacy/corrupt migration, max-five single tickets, current-day pass state, costs and purchase times.
- [x] Write tests for insufficient funds, full ticket inventory, pass already active, too-late pass purchase, no-fare boarding, single-ticket consumption and pass priority.
- [x] Run `node --test tests/rail-transit.test.mjs`; observe expected missing-module failure.
- [x] Implement the pure model with immutable progress transitions.
- [x] Run the focused tests; all pass.
- [x] Commit as `feat: model Wakaba rail fares` (`7b69abc`).

### Task 2: Station interaction, train runtime and phone

**Files:**
- Modify: `game/index.html`
- Modify: `game/game.js`
- Modify: `game/phone-system.js`
- Modify: `tests/game-runtime.test.mjs`
- Modify: `tests/phone-system.test.mjs`

**Interfaces:** Consume Task 1 transit-model API.

- [x] Add failing runtime tests for station menu, ticket purchase, boarding validation, snapshot migration, and transit phone state.
- [x] Run the focused runtime/phone tests and observe the missing integration assertions fail.
- [x] Load the model before game runtime; add state initialization, snapshot round-trip and legacy defaults.
- [x] Route each station entrance to a ticket-machine menu; render current ticket options and disabled reasons; revalidate every purchase and board action.
- [x] Require valid fare before boarding, consuming an active day pass first and otherwise exactly one single ticket.
- [x] Show station kiosk landmarks and live ticket/pass/trip counts in the phone transit app.
- [x] Run runtime, phone and model test files; all pass.
- [x] Commit as `feat: add ticket machines to Wakaba Line stations`.

### Task 3: Headless interaction verification

**Files:**
- Create: `scripts/verify-rail-fares-headless.mjs`

- [x] Verify no-fare boarding is rejected, buy one ticket, board and consume one ticket, then buy a day pass and make two rides without additional fare consumption.
- [x] Verify next-day pass expiry, ticket retention, old-snapshot migration, UI state and mobile bounds; capture desktop/mobile screenshots.
- [x] Capture console error/warning, pageerror, failed requests and bad responses; expect all empty.
- [x] Run `npm test`, `npm run verify:static`, the headless verifier, syntax checks and `git diff --check`.
- [x] Commit as `test: verify Wakaba rail fare loop headlessly`.
