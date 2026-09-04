# 六法静的同期 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 六法本文を GitHub 内の静的 JSON から表示し、1 か月超過時のみ必要に応じて e-Gov 同期できるようにし、項単位メモ・正式見出し・算用数字の条参照表示を実装する。

**Architecture:** e-Gov XML の取得・整形は `scripts/sync-roppo-data.mjs` に隔離し、出力を `data/roppo/*.json` と `metadata.json` に保存する。ブラウザ側は同一オリジンの JSON のみを読み、`roppo-data.js` は状態移行・検索・同期期限判定の純粋関数を提供する。GitHub Actions は cron を持たず `workflow_dispatch` のみで同期を実行する。

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, GitHub Actions, e-Gov 法令 API v1 XML

**Spec:** `docs/superpowers/specs/2026-09-04-roppo-design.md`

## Global Constraints
- 通常閲覧時は e-Gov API を呼ばない。
- 公開法令本文は暗号化不要。ユーザーメモは既存 Vault AES-GCM 経路を維持する。
- 月次 cron は作らない。前回同期から 1 か月超過を stale とする。
- 条見出しは ArticleCaption のみを用い、本文先頭を代用しない。
- 一般の漢数字を一括変換せず、条・項・号の法令参照だけ算用数字化する。

---

### Task 1: Browser data/state helpers

**Files:**
- Modify: `roppo-data.js`
- Modify: `tests/roppo-data.test.mjs`

**Interfaces:**
- Produces: `paragraphStorageKey(lawId, articleKey, paragraphNum)`, `isLawDataStale(metadata, now)`, schemaVersion 2 migration, static-law search.

- [ ] **Step 1: Write failing tests** for v1 note migration to paragraph 1, paragraph key generation, one-calendar-month staleness, and static paragraph search.
- [ ] **Step 2: Run** `node --test tests/roppo-data.test.mjs` and verify the new assertions fail for missing behavior.
- [ ] **Step 3: Implement minimal helpers** and change normalized state to schemaVersion 2.
- [ ] **Step 4: Run** `node --test tests/roppo-data.test.mjs` and verify PASS.
- [ ] **Step 5: Commit** `test/feat: add roppo paragraph state and staleness helpers`.

### Task 2: e-Gov static-data converter and sync workflow

**Files:**
- Create: `scripts/roppo-sync-lib.mjs`
- Create: `scripts/sync-roppo-data.mjs`
- Create: `tests/roppo-sync.test.mjs`
- Create: `.github/workflows/sync-roppo.yml`

**Interfaces:**
- Produces: `normalizeLegalReferences(text)`, `parseLawXml(xml, meta)`, JSON files under `data/roppo/`, metadata with `lastSyncedAt`.

- [ ] **Step 1: Write failing converter tests** covering `第百五条の二` -> `第105条の2`, `第二項` in legal references, untouched monetary/date kanji numerals, ArticleCaption preservation, and separate Paragraph records.
- [ ] **Step 2: Run** `node --test tests/roppo-sync.test.mjs` and verify RED.
- [ ] **Step 3: Implement converter library and sync CLI** using Node built-ins and e-Gov API v1.
- [ ] **Step 4: Add workflow_dispatch-only workflow** with `permissions: contents: write`, Node setup, sync command, diff check, commit, push.
- [ ] **Step 5: Run converter tests** and verify PASS.

### Task 3: Seed repository law JSON

**Files:**
- Create: `data/roppo/metadata.json`
- Create: `data/roppo/321CONSTITUTION.json`
- Create: `data/roppo/129AC0000000089.json`
- Create: `data/roppo/140AC0000000045.json`
- Create: `data/roppo/408AC0000000109.json`
- Create: `data/roppo/323AC0000000131.json`
- Create: `data/roppo/405AC0000000088.json`
- Create: `data/roppo/337AC0000000139.json`
- Create: `data/roppo/426AC0000000068.json`
- Create: `data/roppo/322AC0000000125.json`
- Create: `data/roppo/417AC0000000086.json`

- [ ] **Step 1: Generate current JSON** through the same converter path used by Actions.
- [ ] **Step 2: Validate** every catalog law has a non-empty `articles` array, every article has paragraph records, and metadata counts match.
- [ ] **Step 3: Commit** generated law data without encryption.

### Task 4: Paragraph-oriented 六法 UI

**Files:**
- Modify: `roppo.html`
- Modify: `tests/roppo-page.test.mjs`

**Interfaces:**
- Consumes: static law JSON and `paragraphStorageKey`/`isLawDataStale`.
- Produces: paragraph blocks with independent memo textareas; article favorites/recent remain article-scoped.

- [ ] **Step 1: Write failing static-page assertions** that prohibit `laws.e-gov.go.jp/api/1/lawdata` fetches and require `data/roppo/metadata.json`, paragraph memo UI hooks, and stale-data copy.
- [ ] **Step 2: Run** `node --test tests/roppo-page.test.mjs` and verify RED.
- [ ] **Step 3: Replace law loading** with same-origin JSON fetch and metadata loading.
- [ ] **Step 4: Render official caption only**, render each paragraph as a separate block, and bind each memo to `lawId|articleKey|paragraphNum`.
- [ ] **Step 5: Preserve debounce safety** by capturing the paragraph key/value before delayed persistence.
- [ ] **Step 6: Run page tests** and verify PASS.

### Task 5: Vault/backup migration regression coverage

**Files:**
- Modify: `tests/vault-payload.test.mjs`
- Modify: `tests/backup-format.test.mjs`

- [ ] **Step 1: Add failing fixtures** with schemaVersion 1 article notes and expected schemaVersion 2 paragraph-1 notes after normalization/round-trip.
- [ ] **Step 2: Run targeted tests** and verify RED if existing fixtures assume v1.
- [ ] **Step 3: Make only compatibility changes required** in `vault-payload.js` / `backup-format.js` if normalization is not already delegated to `roppo-data.js`.
- [ ] **Step 4: Run targeted tests** and verify PASS.

### Task 6: Static verification and integration

**Files:**
- Modify: `scripts/check-static.mjs`

- [ ] **Step 1: Add checks** for `data/roppo/metadata.json`, sync script, sync workflow, and absence of runtime e-Gov lawdata fetch in `roppo.html`.
- [ ] **Step 2: Run** `npm test`.
- [ ] **Step 3: Run** `npm run verify:static`.
- [ ] **Step 4: Inspect GitHub Actions CI** for the feature branch and resolve any failures.
- [ ] **Step 5: Merge only after current `main` is rechecked** to avoid overwriting concurrent changes.
