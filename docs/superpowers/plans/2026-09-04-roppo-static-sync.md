# Roppo Static Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub保存の法令JSONを六法の通常データ源にし、1か月超過時のみe-Gov同期し、項ごとのUIとメモを提供する。

**Architecture:** Python同期スクリプトがe-Gov XMLを構造化JSONへ変換し、GitHub Actionsが毎日stale判定だけを行う。ブラウザは保存済みJSONだけを読み、`roppo-data.js` が項メモの状態正規化と旧メモ移行を担う。

**Tech Stack:** Static HTML/JS, Python 3 stdlib, GitHub Actions, Node 22 tests

**Spec:** `docs/superpowers/specs/2026-09-04-roppo-static-sync-design.md`

## Global Constraints
- ブラウザからe-Gov APIを直接呼ばない。
- e-Govへの同期は前回同期から1暦月を超えたときだけ行う。
- 一般漢数字は変換せず条参照だけ算用数字化する。
- 法令本文は暗号化不要、項メモは既存Vault暗号化同期を使う。

---

### Task 1: e-Gov XML同期アダプタ
**Files:** Create `scripts/sync_roppo.py`; Create `tests/test_roppo_sync.py`
- [x] RED: 漢数字変換・Paragraph構造・暦月stale判定の失敗テストを作成。
- [x] GREEN: XML parser とJSON writerを実装しテスト通過。

### Task 2: Paragraph note state
**Files:** Modify `roppo-data.js`; Modify `tests/roppo-data.test.mjs`
- [x] RED: 旧条メモ移行と項メモ分離の失敗テストを作成。
- [x] GREEN: `paragraphStorageKey`、schemaVersion 2、paragraph検索を実装。

### Task 3: Static JSON reader and paragraph UI
**Files:** Modify `roppo.html`; Create `tests/roppo-page.test.mjs`
- [x] RED: e-Gov直接アクセス禁止・項メモUI・本文プレビュー廃止のテストを作成。
- [x] GREEN: 保存済みJSON読み込み、caption表示、項カード・項メモを実装。

### Task 4: Automated stale-only refresh
**Files:** Create `.github/workflows/roppo-sync.yml`; Modify `.github/workflows/verify.yml`
- [ ] 毎日stale判定、手動実行、初回生成トリガーを追加。
- [ ] Verify workflowにPythonテストを追加。
- [ ] 初回JSON生成を確認。

### Task 5: Verification and integration
- [ ] Node/Python/static testsの成功を確認。
- [ ] 最新mainとの差分を確認して競合を避けて統合。
