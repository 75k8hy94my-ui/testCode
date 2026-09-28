# 若葉コミュニティセンター実装計画

> **For agentic workers:** この計画をタスク単位で実行する。各タスクはテストを先に追加し、失敗を確認してから実装する。

**Goal:** 若葉コミュニティセンターに定期講座、プレイヤーの技能進行、住民参加と交流機会を追加する。

**Architecture:** 開催判定・講座定義・進行値の正規化を `community-center.js` に分離し、DOMやゲーム時間に依存しない純粋関数としてテストする。`map-model.js` に徒歩接続可能な施設を追加し、既存 `game.js` のプレイヤー行動、保存／復元、住民行動候補へ統合する。

**Tech Stack:** 静的HTML/CSS/JavaScript、Node.js標準テスト、既存Playwright/Chromium（開発時のみ）。本番依存・ビルド工程は追加しない。

**Spec:** `docs/superpowers/specs/2026-09-29-wakaba-community-center-design.md`

## Global Constraints

- アプリは静的HTML/CSS/JavaScriptのまま、ビルド工程と本番依存を追加しない。
- 住民は既存の行動計画・経路探索を通じて入口へ移動する。
- 参加費は参加確定時に一度だけ差し引き、効果は完了時に適用する。
- 旧セーブでは欠損値を既定値に補い、不正値は範囲補正する。
- `npm test` と `npm run verify:static` を実行する。
- 画面確認はCLI headless Playwright／Chromiumのみを使い、console error／warning、pageerror、failed requestを記録する。

## Review Focus

- 23:xxや日付境界、曜日切り替え時に次回講座の計算を誤らないこと（Task 1 schedule tests）。
- 同じ参加確定操作の重複で費用や技能を二重適用しないこと（Task 3 completion/idempotence tests）。
- `NaN`、負数、100超過、欠損を含む旧セーブを安全に正規化すること（Task 1 and Task 3 migration tests）。
- 経路未到達や到着前に講座が終了した住民が固定・瞬間移動せず通常活動へ戻ること（Task 4 simulation tests）。
- 講座開催のない時刻に住民の講座候補が生成されず既存活動を変えないこと（Task 4 candidate tests）。

---

### Task 1: 講座定義・開催計算・技能データ

**Files:**
- Create: `game/community-center.js`
- Modify: `game/index.html`
- Test: `tests/community-center.test.mjs`
- Modify: `tests/game-runtime.test.mjs`

**Interfaces:**
- Produces browser global `CityDaysCommunityCenter` with frozen `COURSES`, `getSession(courseId, day, minute)`, `listSessions(day, minute)`, and `normalizeProgress(value)`.
- `getSession` returns the current or next eligible session with course, start absolute minute, and `accepting` flag; returns `null` for unknown course.
- `normalizeProgress` returns `{skills:{cooking,craft,exercise}, attendance:[]}` with skills clamped to 0–100 and valid attendance records only.

- [x] **Step 1: Failing tests** — assert the three exact weekly schedules, start-time 10-minute acceptance window, next-session calculation across midnight/week boundary, unknown-course null, and progress defaults/clamping.
- [x] **Step 2: RED** — run `node --test tests/community-center.test.mjs`; expected assertion failures because module/global is missing.
- [x] **Step 3: Minimal implementation** — define Tuesday/Saturday 10:00 cooking (300円/60分), Wednesday/Saturday 14:00 crafts (200円/75分), Monday/Thursday 18:00 exercise (無料/45分); implement deterministic session math and normalization.
- [x] **Step 4: GREEN** — run `node --test tests/community-center.test.mjs` and the focused static-script inclusion assertion.
- [x] **Step 5: Commit** — `feat(game): add community course schedule model`.

### Task 2: マップ施設・徒歩接続

**Files:**
- Modify: `game/map-model.js`
- Test: `tests/map-model.test.mjs`

**Interfaces:**
- Consumes `CityDaysCommunityCenter` only indirectly; map place ID is `community-center`.
- Produces a place with a pedestrian entrance node and a road node connected by existing map edge definitions.

- [x] **Step 1: Failing tests** — assert the new place exists with stable ID, pedestrian route to its entrance, vehicle-accessible road node, and no building overlap with existing facility buildings or open spaces; assert all pre-existing facility-to-facility routes remain connected.
- [x] **Step 2: RED** — run `node --test tests/map-model.test.mjs`; expected missing-place assertion.
- [x] **Step 3: Minimal implementation** — add the center near civic/library district, add explicit pedestrian entrance edge to a connected node and only add vehicle connectivity if the chosen road node supports it; keep building outside plaza, roads, and existing building sites.
- [x] **Step 4: GREEN** — run map-model tests and inspect the model validator output.
- [x] **Step 5: Commit** — `feat(game): add community center to city map`.

### Task 3: プレイヤー講座・進行保存

**Files:**
- Modify: `game/game.js`
- Modify: `game/index.html` (cache token only if needed)
- Test: `tests/game-runtime.test.mjs`

**Interfaces:**
- Consumes `CityDaysCommunityCenter.COURSES`, `getSession`, and `normalizeProgress`.
- Produces save snapshot field `communityCenter` and a location action sheet for `community-center`.

- [x] **Step 1: Failing tests** — assert snapshot defaults and restoration of skill/attendance, old-save migration, affordance at the new place, rejection after the 10-minute window and on insufficient cash, and successful participation changing cash/time once then applying skill/need effects on completion.
- [x] **Step 2: RED** — run the focused runtime test; expected missing field and interaction assertions.
- [x] **Step 3: Minimal implementation** — add normalized player progression; show course choices with current/next schedule, cost, and reason when unavailable; charge once on enrollment; complete once at the existing time-advance boundary; clamp skills and needs.
- [x] **Step 4: GREEN** — run focused runtime tests then `npm test`.
- [ ] **Step 5: Commit** — `feat(game): add playable community classes`.

### Task 4: 住民参加・交流接続と最終検証

**Files:**
- Modify: `game/game.js`
- Test: `tests/game-runtime.test.mjs`
- Test: `tests/community-center.test.mjs` (if pure scheduling helper coverage is needed)

**Interfaces:**
- Consumes place ID `community-center`, course schedule API, and player-independent citizen activities.
- Produces deterministic eligible attendee selection per citizen/day, activity candidate `community_class`, and completion return to ordinary candidate selection.

- [ ] **Step 1: Failing tests** — assert no candidate outside a session window; eligible residents can choose an attending class based on schedule/needs/personality; blocked route or session expiry returns them to ordinary activities without position teleport; on-site player can have a brief conversation with attending residents.
- [ ] **Step 2: RED** — run focused runtime tests; expected missing activity candidate/interaction.
- [ ] **Step 3: Minimal implementation** — add a bounded class activity candidate to existing citizen planner; use stable citizen ID and day selection, existing route/indoor/completion machinery, and ordinary replanning on expiry/failure; expose nearby attendees through existing location interaction.
- [ ] **Step 4: GREEN and full verification** — run focused tests, `npm test`, `npm run verify:static`, then CLI headless Playwright/Chromium at `http://localhost:4173/game/index.html`; collect full-page desktop screenshot, console errors/warnings, pageerrors, failed requests; inspect DOM/computed styles/canvas and mobile screenshot as needed.
- [ ] **Step 5: Commit and push** — `feat(game): add community center resident activities`; verify `main` and `origin/main` are synchronized before reporting.
