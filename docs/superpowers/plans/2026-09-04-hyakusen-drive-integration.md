# 判例百選 Drive 連携 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 判例百選の版付き掲載マスタ、Google Drive上のPDF所持確認ページ、既存索引検索への厳格な百選タグ付与を追加する。

**Architecture:** 百選マスタ／Driveメタデータ照合／ページUIを分離する。索引検索は既存の厳格な判例identityを再利用し、同一判決日だけでは紐づけず、裁判所・年月日・判例集・巻・号・頁が揃ったときだけ百選ラベルを付ける。DriveはGoogle Identity Services token modelと`drive.metadata.readonly`のみを使い、アクセストークンを永続化しない。

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js `node:test`, Google Identity Services, Google Drive API v3

**Spec:** `docs/superpowers/specs/2026-09-04-hyakusen-drive-integration-design.md`

## Global Constraints

- Static HTML/CSS/JavaScriptのまま。production dependencyを追加しない。
- 百選実データはユーザー提供前に推測して登録しない。
- Drive access tokenをlocalStorage、IndexedDB、Vault、Supabaseへ保存しない。
- Google client secretをブラウザ・リポジトリ・Supabaseへ置かない。
- OAuth scopeは`https://www.googleapis.com/auth/drive.metadata.readonly`のみ。
- Drive PDF本文を取得しない。
- 索引検索との判例一致は裁判所・年月日・判例集・巻・号・頁の6要素を必須とする。
- `npm test` と `npm run verify:static` をmerge前に実行する。

---

### Task 1: 百選マスタと版選択ロジック

**Files:**
- Create: `hyakusen-catalog.js`
- Test: `tests/hyakusen-catalog.test.mjs`

**Interfaces:**
- Produces: `normalizeEntry(entry)`, `caseKey(entry.case)`, `labelForEntry(entry)`, `findCaseListings(caseEntry, entries?)`, `primaryListing(caseEntry, entries?)`, `collections(entries?)`, `entriesForCollection(collectionId, edition, entries?)`, `DEFAULT_ENTRIES`

- [ ] **Step 1: Write failing tests** covering: latest edition label omits edition, old-only label includes edition, latest listing wins when same case exists in old/new editions, newest old listing wins if no latest listing, different reporter page does not match, incomplete six-part case identity is rejected.
- [ ] **Step 2: Run `npm test -- tests/hyakusen-catalog.test.mjs` and confirm RED** because `hyakusen-catalog.js` does not exist.
- [ ] **Step 3: Implement minimal catalog module** with empty `DEFAULT_ENTRIES` and injectable test entries; do not add guessed Hyakusen data.
- [ ] **Step 4: Run the focused test and confirm GREEN.**
- [ ] **Step 5: Commit** `test/feat: add hyakusen catalog model`.

### Task 2: Drive metadata client

**Files:**
- Create: `hyakusen-drive.js`
- Test: `tests/hyakusen-drive.test.mjs`

**Interfaces:**
- Consumes: normalized catalog entries with `driveFileName`.
- Produces: `DRIVE_METADATA_SCOPE`, `buildFilesListUrl({ pageToken })`, `matchDriveFiles(entries, files)`, `listPdfMetadata(accessToken, fetchImpl)`, `createTokenController({ clientId, googleApi })`.

- [ ] **Step 1: Write failing tests** proving exact filename match only, PDF MIME type required, trashed entries ignored, similar names do not match, duplicate exact names are handled deterministically, list requests ask only for metadata fields, and access tokens are held only in returned in-memory controller state.
- [ ] **Step 2: Run focused tests and confirm RED.**
- [ ] **Step 3: Implement Drive client** using REST `files.list` pagination and GIS `initTokenClient` with only `drive.metadata.readonly`.
- [ ] **Step 4: Run focused tests and confirm GREEN.**
- [ ] **Step 5: Commit** `feat: add read-only Drive metadata client`.

### Task 3: 百選ページ

**Files:**
- Create: `hyakusen.html`
- Create: `hyakusen-page.js`
- Test: `tests/hyakusen-page.test.mjs`

**Interfaces:**
- Consumes: `window.HyakusenCatalog`, `window.HyakusenDrive`, `window.MangaVault`.
- Produces: protected page UI and Drive availability state.

- [ ] **Step 1: Write failing static/behavior tests** asserting auth/Vault guard, GIS client script, client-ID field, connect button, collection/edition selectors, result list, disabled styling hook, and no access-token persistence calls.
- [ ] **Step 2: Run focused tests and confirm RED.**
- [ ] **Step 3: Implement page and controller.** Client ID may be saved in localStorage; access token may not. On selection, render number-order entries. When connected, retrieve PDF metadata, mark only exact filename matches available, and open `webViewLink` in a new tab. With empty master show `百選データ未登録`.
- [ ] **Step 4: Run focused tests and confirm GREEN.**
- [ ] **Step 5: Commit** `feat: add hyakusen Drive availability page`.

### Task 4: 索引検索へ百選タグを付与

**Files:**
- Modify: `legal-index-search.js`
- Modify: `legal-index-search-worker.js` only if required to preserve Worker/direct parity
- Test: `tests/legal-index-search.test.mjs`
- Test: `tests/legal-index-search-worker.test.mjs`

**Interfaces:**
- Consumes: `HyakusenCatalog.primaryListing()` and strict six-part case identity.
- Produces: case search results whose `display` includes `［民法Ⅱ14］` or old-edition label only when strict match exists.

- [ ] **Step 1: Write failing tests** with injected fixture data proving strict matching and latest-edition preference in rendered search result display, including a same-date/different-reporter-page negative case.
- [ ] **Step 2: Run focused legal-index tests and confirm RED.**
- [ ] **Step 3: Implement minimal integration** while preserving existing `buildIndex()`/`search()` API and Worker semantics. The default production catalog remains empty until user data is supplied.
- [ ] **Step 4: Run legal-index focused tests and confirm GREEN.**
- [ ] **Step 5: Commit** `feat: annotate index cases with hyakusen listings`.

### Task 5: 索引検索から百選ページへの導線

**Files:**
- Modify: `legal-index-search.js` browser-only bootstrap or another already-loaded small integration point
- Test: `tests/hyakusen-page.test.mjs` or a focused static test

**Interfaces:**
- Produces: one `判例百選` link/button on `index-search.html` without changing authentication behavior.

- [ ] **Step 1: Write failing test** asserting the browser integration inserts or exposes a deterministic `hyakusen.html` navigation target while Node search API remains side-effect free.
- [ ] **Step 2: Confirm RED.**
- [ ] **Step 3: Implement the smallest browser-only navigation injection.**
- [ ] **Step 4: Confirm GREEN.**
- [ ] **Step 5: Commit** `feat: link index search to hyakusen library`.

### Task 6: Documentation and full verification

**Files:**
- Modify: `AGENTS.md`
- Modify/Create: test files as needed for static regression

**Interfaces:**
- Documents Google Cloud setup: enable Drive API, create Web OAuth client, register `https://75k8hy94my-ui.github.io` as Authorized JavaScript origin, paste client ID into the page; no client secret.

- [ ] **Step 1: Add implementation notes** describing security boundary, empty master until user data is supplied, strict case matching, edition rules, and Drive token lifetime.
- [ ] **Step 2: Run `npm test`. Expected: 0 failures.**
- [ ] **Step 3: Run `npm run verify:static`. Expected: exit 0.**
- [ ] **Step 4: Review diff against the spec** and confirm no PDF content fetch, no token persistence, no client secret, no guessed catalog entries.
- [ ] **Step 5: Open PR and verify GitHub Actions before merge.**
