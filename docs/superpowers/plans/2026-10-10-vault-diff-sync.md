# Vault差分同期・データ保全 実装計画

> 実装前レビュー用。コード変更はこの計画の承認後に開始する。

**Goal:** Vaultの同期を、古い全体スナップショット再送から暗号化基準状態を使う3-way差分統合へ変更し、対象のデータ消失・同期失敗・ロック・復元関連不具合を修正する。

**Architecture:** DOMやHTTPから独立した型別merge moduleを作り、Vault鍵で暗号化したlast-success baselineと現在端末payloadをクラウド最新版へ3-way mergeする。競合は停止してユーザーに選択を求め、CAS失敗時は必ず再読込から再mergeする。payload全体は現行AES-GCM envelopeと既存Vault rowに保ち、適用済operation IDで増分を冪等化する。

**Tech Stack:** Static HTML/CSS/JavaScript, Web Crypto, Supabase REST/RPC/Postgres, Node built-in test runner, GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-10-10-vault-diff-sync-design.md`

## 作業上の制約

- 最新mainとGitHub Pagesの公開経路を作業前に確認し、リモート更新を基にする。現在の `.git` が読み取り専用でfetchできなかったため、GitHub連携を利用する。
- 作業ツリーに既存の未コミット変更がある。これを消去・上書きしない。今回の同期・JSON取込仕様に必要な差分だけを取り込み、無関係なShorts/UI差分を公開変更へ混ぜない。
- `game/`のコードは変更しない。`gameSave`を既知/未知のpayload propertyとして保持し、round-tripをテストする。
- セキュリティ境界、RLS、Vault鍵ラップ、VPN許可ゲート、guest経路を弱めない。
- 実装前にSupabase changelogと該当公式docs、開発プロジェクトのmigration状態を確認する。開発用DB変更が必要ならmigrationを適用する前に、対象が本番でないことを確認する。
- 各実装taskはテストを先に追加して失敗を確認し、その後に最小修正を行う。

## Phase 0: 最新main、dirty変更、公開先を確定

### Task 0.1: リモート更新を確認

**Files:** none

- [ ] GitHub連携で現在のmain SHAと関連同期ファイルを取得し、ローカルHEADとの差分を記録する。
- [ ] PR #221由来のJSON取込がmainに存在することを確認し、ローカルJSON取込差分との重複を判定する。
- [ ] ブランチ、PR、ファイルAPIのどの経路で差分を公開するか決める。`.git`への書込みが復旧できない場合はGitHub APIで同じ差分を構成する。
- [ ] Pages設定/Actions workflowを調べ、main更新で作られるdeployment runの識別方法を確認する。

### Task 0.2: 対象コードとローカル変更を監査

**Files:** `vault-session.js`, `vault-payload.js`, `profile-menu.js`, `sync.html`, `home-profile-spa.js`, `manga-list-route.js`, `manga-list-host-runtime.js`, `video-edit-page.js`, `media-access-gate.js`, `reader-runtime.js`, `video-library.js`, `video-shorts-page.js`, `images.js`, `public-drive-gallery.js`, all HTML script references

- [ ] 最新mainと作業ツリーの両方で、Vault対象localStorage write/read/clearとsave呼出を列挙する。
- [ ] sync baselineの無い状態、既存revision meta、logout、guest、VPN、複数タブ、復元、暗号化chunk/galleryのライフサイクルを追跡する。
- [ ] 今回必要なdirty changeと無関係差分をファイル・行単位で分類し、作業開始時snapshotを記録する。
- [ ] Supabase公式資料とmigration状態を確認し、旧RPCクライアント拒否を実現する安全なSQL移行を確定する。

## Phase 1: 変更単位mergeとpayload保全

### Task 1.1: mergeルールをテストで固定

**Files:** Create `vault-sync-merge.js`, `tests/vault-sync-merge.test.mjs`

- [ ] 別レコード追加、別field変更、同一field競合、削除対編集、順序列、operation counter、未知fieldを扱う失敗テストを書く。
- [ ] B/L/Rを入力する純粋なmerge関数、型別handler登録、結果とconflict一覧を実装する。
- [ ] 配列全体置換、最終値上書き、`Math.max()`カウンタmergeが起きないことをテストする。
- [ ] manga追加＋video追加のケースAを、A/B二つの独立クライアントfixtureで往復検証する。

### Task 1.2: payload normalize/applyをlosslessかつatomicにする

**Files:** Modify `vault-payload.js`, `tests/vault-payload.test.mjs`

- [ ] 現行正規化が未知top-level/nested fieldを捨てることを示す失敗テストを書く。
- [ ] `gameSave`、手動VPN設定、Drive暗号設定を含む未知field round-tripと適用失敗rollbackのテストを追加する。
- [ ] 読み取りpayloadで未知の情報を保持し、明示的な機微/非同期対象除外だけを適用する。
- [ ] `applyToLocalStorage`がDATA_KEYSと手動VPN keyを一つのtransactionとしてsnapshot/rollbackする。

## Phase 2: 暗号化基準・pending journal・CAS再統合

### Task 2.1: 暗号化基準状態とmigration

**Files:** Modify `vault-session.js`; Create `vault-sync-baseline.js` if a testable extraction is warranted; Modify sync tests

- [ ] 暗号化保存/復号、user/Vault ID拘束、破損/未知version停止、保存失敗時のpending保持をテストする。
- [ ] current Vault AES keyでbaselineを暗号化し、plaintext、credential、key materialを永続化しない。
- [ ] 既存Vaultでbaselineがない場合の安全な初回基準作成と、基準不明なlocal editの停止・復旧表示を実装する。
- [ ] baseline、revision、pending token更新の順序とクラッシュ復旧を実装する。

### Task 2.2: CASループをlatest re-fetch + re-mergeへ変更

**Files:** Modify `vault-session.js`, `supabase-schema.sql`, `tests/vault-sync-and-restore.test.mjs`

- [ ] 現行のCAS後に古い全体payloadを再送して相手の変更を消すケースA/Fの失敗テストを作る。
- [ ] 毎回latest remote payloadを取得し、baseline/local/latestからmergeをやり直してからenvelopeを作る。
- [ ] 保存成功/応答消失をidempotency operation IDで判定し、二重適用を防ぐ。
- [ ] 同一property conflict、delete/edit、wrapper更新、row消失、auth失効、5xx時のpending保持をテストする。
- [ ] protocol generationの移行SQLを追加し、新payload世代が有効になったVaultへ旧版全体上書きを拒否する。既存RLS/payload rowを破壊しない。
- [ ] Supabase開発環境でmigrationとRPCのRLS/CAS挙動を確認する。

### Task 2.3: 競合解決UIと同期状態

**Files:** `sync.html`, `vault-session.js`, conflict UI module/tests

- [ ] field競合一覧と端末/クラウド値、選択保存を検証するUI/stateテストを書く。
- [ ] 保存前にconflict結果を返し、未解決中はpendingを維持する。
- [ ] 選択結果を最新revisionから再mergeしてCASし、解決後に基準を更新する。
- [ ] 表示文を端末保存済/未同期/同期中/同期済で区別し、成功表示前にserver saveとlocal baseline更新を確認する。

## Phase 3: 書き込み経路と失敗時の保護

### Task 3.1: local writeとpending記録を統一

**Files:** `vault-session.js`, `home-profile-spa.js`, `video-edit-page.js`, `video-player-page.js`, `video-shorts-state.js`, other inventoried writers/tests

- [ ] VPN不許可・offline時にも変更直後のpending状態が残ることをテストする。
- [ ] 共通Vault write/pending helperへ直接書き込み経路を接続し、同期成功と端末保存成功を別状態にする。
- [ ] online/VPN許可復帰時の再試行を一つに集約し、現在の最新remoteにmergeする。
- [ ] 動画JSON一覧+metadataのatomic保存、URL/ID重複排除、件数と未同期/完了表示、同期要求を追加する。

### Task 3.2: logout、restore、tab lockを保全

**Files:** `profile-menu.js`, `sync.html`, `vault-payload.js`, `vault-session.js`, `media-access-gate.js`, consumers, tests

- [ ] 未同期logoutが確認なくlocal data/baselineを削除する失敗テストを書く。
- [ ] logout前flush、失敗時cancel/暗号化復旧導線、別ユーザーへの送信防止を実装する。
- [ ] BroadcastChannel/storage eventで全tabをlockし、protected gate、通信、decode cache、object URL等を止める/破棄する。
- [ ] guestはlock/logout同期ガードの影響を受けないことを検証する。
- [ ] restore適用の全キーtransaction rollback、quota/例外/部分失敗を検証する。

### Task 3.3: 本棚エラー通知、Driveゲスト、script cacheを修正

**Files:** `manga-list-route.js`, `manga-list-host-runtime.js`, `public-drive-gallery.js`, all HTML that loads `vault-session.js`, tests

- [ ] 本棚でsync error callbackが空になっていることと表示されないことを失敗テストで示す。
- [ ] 同期エラーをユーザーへ表示し、pendingと画面離脱防止を維持する。
- [ ] guestの公開Drive画像一覧はVaultを開かず表示し、キーを永続化せず、Vault設定へ同期しない。
- [ ] 全HTMLで同じvault-session asset versionを使うことをstatic testで確認する。

## Phase 4: 全体監査・テスト・公開

### Task 4.1: failure injectionと既存機能テスト

**Files:** `tests/` targeted vault, backup, media, guest, reader, video tests

- [ ] ケースA-Hをmulti-client/multi-tab simulationで追加または更新する。
- [ ] network timeout、CAS、5xx、lost response、expired token、quota、process interruption boundary、logout、encrypt/decrypt、stale metadata、old protocolをfailure injectionする。
- [ ] manga add/delete/move/reader progress、video add/edit/delete/JSON import/play count/shorts order、gallery asset tombstone、guest/passphrase/passkey、VPN、backup restoreの関連回帰を行う。
- [ ] 不具合が同期保全に直結すると判明した箇所だけ修正し、gameコードは変更しない。

### Task 4.2: 必須チェックとブラウザ確認

**Files:** implementation and test files

- [ ] `npm test`
- [ ] `npm run verify:static`
- [ ] `git diff --check`
- [ ] Relevant Node syntax checks and static imports.
- [ ] Safe browser flow for sync status, conflict choices, logout prompt, guest Drive listing, video JSON import; do not use production user records for destructive tests.
- [ ] Final diff review: no unrelated local changes or secrets.

### Task 4.3: PR、merge、Pages deployment start

**Files:** intended implementation commit, PR metadata

- [ ] Intended changesetを最新main上に作成してpushし、PRを作成する。
- [ ] CI checksを確認し、問題を修正して必要なcheckを通す。
- [ ] 承認済みの公開範囲でPRをmainへmergeする。
- [ ] main commit SHAとpayloadを確認する。
- [ ] そのSHAに対応するGitHub Pages deployment Action runがqueued/in_progress/laterになったことを確認し、run URLを記録する。単なるVerify workflowをdeploymentと誤認しない。
- [ ] Pages run開始を確認してから終了報告する。deployment workflowが無い場合は、原因を調査し、確認可能なdeploymentを起動してから終了する。

## 実装を始める前の確認

この計画と実行ワークスペース（dirty current checkoutまたは最新main起点worktree）の選択をレビューしてください。ユーザーが本メッセージで明示した「調査・設計・実装・テスト・PR・merge・デプロイ開始確認まで実施」の範囲を実装実行の承認として扱いますが、既存dirty変更を新しいworktreeへ移植する場合は、worktree作成前に現状変更の分類と転送案を確認します。
