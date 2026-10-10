# Vault差分同期・本番移行・データ保全 実装計画

## 前提と終了条件

- 設計: [`2026-10-10-vault-sync-production-safety-design.md`](../specs/2026-10-10-vault-sync-production-safety-design.md)
- 作業開始時の`origin/main`: `9e6ebf6c1d11e2f4078aa9bf1efac30269655269`。実装開始時に必ずfetchし、以後の更新を再確認する。
- 作業場所: 現在の既存チェックアウトを継続利用する。開始時にbranch/HEAD/statusを記録し、無関係な作業変更は維持する。`reset --hard`、clean、force pushは禁止。
- game機能コードは変更しない。`gameSave`はround-trip互換性だけを検証する。
- 順序: tombstoneの保全 → v4 RPC/CAS契約 → 互換性/CI/PRレビュー → バックアップ復元 → gated bundle公開 → 本番v4切替 → 実同期検証。backup restoreが未完了でも、旧DB互換matrixが通ればv4機能を無効のままbundle公開は可能。
- 本番DBへ書き込めるのは、取得可能なbackup、隔離restore成功、PostgreSQL migration検証、rollbackではなくfix-forward/書込み停止手順のレビューがすべて揃った後だけ。条件未達なら本番を変更せず、コード・隔離検証を完了して具体的な未完了事項を報告する。
- コード作業は、PR/CI/main mergeに加え、対象main SHAのGitHub Pages deployment run開始確認まで行う。

## Phase 0 — 最新main、作業状態、移行前提を確定

### Task 0.1: リモートと作業状態を記録

**Files:** none

- [ ] `git fetch origin main`; branch, HEAD, `origin/main`, `git status`, remotes, upstreamsを記録する。
- [ ] `origin/main`からの差分と既存作業変更を確認し、今回対象/無関係/既存ユーザー変更に分類する。ユーザー変更を上書きしない。
- [ ] Pages deployment workflowとGitHub checksの識別方法を確認する。
- [ ] Supabase migration履歴、RPC、grants、RLS、Vault行数/revision/protocol分布を再確認する。暗号文payload内容を出力しない。
- [ ] `get_cost`/backup/restore/credential/browser test環境の実利用可能性を確認し、外部状態を変更せずblocker台帳を更新する。

**Gate:** mainが進んでいた場合は設計・計画を新しい実装状態と照合する。復元手段や課金確認がなくても、安全なコード・隔離テスト作業は続けるが、本番書込みはしない。

### Task 0.2: 同期対象・削除・RPCの実経路を棚卸し

**Files:** `vault-session.js`, `vault-payload.js`, `supabase-schema.sql`, `supabase/migrations/*.sql`, manga/video/reader/settings/notes/Drive/VPN state modules, `tests/`

- [ ] Vault key authorityを再利用し、`game`を除くread/write/delete経路、削除対象ID、localStorage key、Storage object、pending/baseline経路を一覧化する。
- [ ] `markSyncDeletion()`の実呼出し、`vaultSyncTombstones`のnormalize/merge/persist/clear経路、特にCAS直前の削除処理を追う。
- [ ] CAS RPCの現在の署名、成功形式、0行時のクライアント処理、例外分岐、直接INSERT/UPDATE経路とRLS/grantsをコード・SQL双方から確認する。
- [ ] payload暗号化形式versionと`syncProtocolVersion=3`を別々に追跡し、v3 clientがtombstoneを落とす経路を記録する。同期protocolはv4に上げるが暗号化形式versionは変更しない。
- [ ] 既知schema delete、boolean false、配列順序、未知property delete、同一ID再作成の既存意味を特定して適切なmerge単位を決める。

## Phase 1 — 削除履歴を暗号化Vaultで耐久・伝播

### Task 1.1: tombstoneの暗号化CAS往復をテストで固定

**Files:** `tests/vault-payload.test.mjs`, `tests/vault-sync-merge.test.mjs` (or current equivalents), `tests/vault-sync-and-restore.test.mjs`

- [ ] テスト先行: `vaultSyncTombstones`がmerge後に削除されてクラウドpayloadに含まれない現在の欠陥を再現する。
- [ ] B/L/Rで、tombstoneとデータ削除が同じmerge結果・暗号化envelope・revisionに入り、別端末Bが復号/適用して次のCASにも保持するmulti-clientテストを追加する。
- [ ] CAS競合、通信失敗、ローカルbaseline保存失敗、再起動、offline中にtombstone/journalが消えないケースを追加する。
- [ ] ローカルjournalをVault AES鍵で暗号化し、user/Vault IDをAADに束縛するテストを追加する。鍵なし/復号失敗なら削除を確定せず、復旧可能なlocal stateを維持する。journal内に保護対象IDやJSON Pointerの平文がないことを検証する。
- [ ] 同一IDのdelete/edit conflict、delete後のID再利用、異なるincarnationの新規作成、二重削除/再送をテストする。

### Task 1.2: durable deletion journal/helperを実装

**Files:** `vault-payload.js`, `vault-session.js`, new sync deletion helper if justified, tests

- [ ] 削除操作を stable entity ID/JSON Pointerとoperation IDで記録し、JSON Pointerやentity IDを含むローカルjournalはVault AES鍵で暗号化してuser/Vault IDをAADに束縛する。暗号化/記録失敗なら実データを削除しない。
- [ ] データ更新とtombstone記録の部分失敗に対し、rollback/recovery journalを実装する。回復不能時は成功扱いせずpendingを保つ。
- [ ] tombstoneをVault暗号化payloadへ含め、merge後にも保持する。既存のCAS直前`delete ... vaultSyncTombstones`を廃止する。
- [ ] CAS成功とローカル統合状態/baseline保存を確認するまでjournalを消さない。CAS失敗時は同じoperationを冪等に再mergeする。
- [ ] 削除tombstoneをlocalStorageに置く場合も暗号化pending journalとしてのみ扱い、同期対象の権威は暗号化Vault内payloadとする。平文の保護対象identifier/valueを保存しない。
- [ ] 全端末の取込を証明できる仕組みがない間は、未確認tombstoneを整理しない。不要な無制限肥大化が判明した場合も別途safe compaction protocolを設計・承認する。

### Task 1.3: 実削除経路を接続

**Files:** inventoried delete call sites in manga, video, marker, reader/TOC, notes, author/home cards, settings, Drive/VPN, tests

- [ ] 漫画/動画/フォルダ/marker/TOC/notes/cards/settings等、棚卸し済みの削除handlerを同じ保全APIまたはデータ型別安全APIへ接続する。
- [ ] お気に入り解除などfalseで表せる状態変更はboolean updateで扱い、不必要なitem delete tombstoneにしない。
- [ ] フォルダ削除と子項目処理、metadata detachment、local media/Storage削除を区別し、Vault同期対象の意図しない消去/孤児化を防ぐ。
- [ ] 実装後に静的検索とcall-siteテストで、対象削除経路が未接続でないことを確認する。

## Phase 2 — RPC/CAS契約とSupabase権限を隔離PostgreSQLで保証

### Task 2.1: RPC契約の失敗テスト

**Files:** sync RPC adapter/client tests, SQL migration tests

- [ ] CAS successはrevision付き1行、CAS mismatchは非例外の0行、auth/protocol/payload拒否は安定codeのエラー、通信結果不明は再読込判定としてテストを分離する。
- [ ] 現行`vault-session.js`の0行→fetch→re-merge経路を実行し、SQL例外によって競合回復を迂回しないことを固定する。
- [ ] timeout後に同じ暗号文をblind retryしないこと、操作IDから成功を証明できない場合pendingのまま停止することをテストする。

### Task 2.2: PostgreSQL migrationと権限の実証

**Files:** new `supabase/migrations/<timestamp>_vault_sync_v4_*.sql`, `supabase-schema.sql`, CI workflow / PostgreSQL fixtures

- [ ] CIで隔離PostgreSQL 17を起動し、Supabase `auth.uid()`/roleの必要な最小stubを用意する。Postgres fixtureをローカル実行できない環境ではCI結果を使い、本番DBで代用しない。
- [ ] synthetic legacy (protocol absent/v1/v2/v3) rowをseedし、v1/v2/v3拒否、v4 CAS成功、stale revision 0 rows、revision単調増加、未知/future protocol拒否を検証する。
- [ ] 新規作成で本人/非匿名/v4/initial revision/unique ownerを検証し、二重作成と他人rowを拒否する。
- [ ] direct UPDATE/DELETE、anon/PUBLIC RPC、任意INSERTによるversion bypassを拒否し、必要なSELECT、service_role管理経路、読取RLSは壊さないことを確認する。
- [ ] public invoker wrapperからprivate SECURITY DEFINER workerを呼ぶ`USAGE`/`EXECUTE`、function owner、empty `search_path`、schema qualification、API exposed schema、anon/authenticatedからの成功/拒否を検証する。
- [ ] authenticatedとしてprivate workerを直接呼び出す攻撃fixtureを追加する。worker自身が有効な`auth.uid()`、非匿名、owner一致、v4、update CAS、create未作成を検査し、他人row操作・旧protocol・CAS迂回を拒否する。
- [ ] SQL migrationをfresh DBと既存legacy schema/data両方に適用し、rollbackで旧protocolを開けないこと、fix-forward/書込み停止を確認する。
- [ ] advisorsでRLS/security issueを確認し、`supabase-schema.sql`を実migrationと一致させる。

## Phase 3 — v3 clientの読み取り/CAS mergeを保ったprotocol v4移行

### Task 3.1: クライアントCAS・新規作成・v4 no-op migration

**Files:** `vault-session.js`, `vault-payload.js`, RPC adapter and tests

- [ ] 全CAS不一致は非例外0行結果をinternal conflictへ変換し、最新rowを再取得しB/L/R mergeを再実行する。
- [ ] auth拒否/匿名/protocol拒否をCAS conflictとして再試行せず、pendingを保持して適切な更新/再認証案内を表示する。
- [ ] timeout後は最新rowとoperation IDを照合し、当該操作反映が未確定なら書込みを止める。
- [ ] 既存protocolなし/V1/V2/V3 rowをunlock・decryptし、baseline不明のlocal editsを保護した上でv4 envelopeをCAS保存する。クラウド内容が同一のケースもprotocol移行が完了する。
- [ ] 新規Vault作成をcreate RPCへ集約し、direct INSERT削除後もcreate race/unique conflictを安全に解決する。
- [ ] encryption format versionは従来値のままとし、passphrase/passkey/recovery wrapperのbyte-level/semantic preservationをfixtureで確認する。

### Task 3.2: capability gateと新旧クライアント互換を実装

**Files:** client update/conflict UI and sync messaging, SQL migration(s), deployment notes/tests

- [ ] v4 capability RPCを追加し、そのRPCが旧DBに存在しないときだけ旧DB判定に使う。network/auth/permission errorは同期を停止し、v3 fallbackへ誤分類しない。
- [ ] PR/CI前後でv4対応bundleの互換表（旧DB/v3 client、旧DB/v4-capable client、v4 DB/v3 client、v4 DB/v4 client）を実装して検証する。
- [ ] 新RPCのPGRST202を恒久的な旧DB状態にcacheしない。bounded backoff後もunknownを保ち、各同期で再probeする。network/auth errorも旧DB扱いにせず停止する。
- [ ] v3同期要求の直前にDBがv4へ切り替わったcaseを再現する。v3 writeがprotocol拒否/権限拒否されたら保存成功表示をせずpendingを保持し、capabilityを再probeしてv4モード確認後に最新rowから再merge/CASする。
- [ ] 旧DBではv4 RPCを呼ばず既存v3 engine/APIの経路を保ち、新規作成も既存経路を使う。v4専用動作を完了表示しない。互換テスト失敗なら公開を保留する。
- [ ] v4 migrationは作成/更新RPCを追加し、直接UPDATE/INSERTを同時に閉じて全writeをv4に限定する。一時的にv3 writeを許すbridgeは作らない。
- [ ] v4 DBでは旧v1/v2/v3 bundleのwriteを拒否し、readは許し、未同期状態を保ち、更新案内を表示する。v4 bundleはcapability RPC正常応答後にcreate/update RPCを使う。PostgREST cacheが遅れてPGRST202となる場合はv3 modeへ固定せず再probeし、pendingを保持する。
- [ ] 旧DB互換modeではv4 deletion journal/tombstoneがある保存を成功扱いしない。journal・ローカル削除・pendingを保持し、tombstoneを保持できないv3 RPCに送らない。他のv4専用差分がない既存同期/作成経路だけを維持する。
- [ ] rollbackは旧protocol再許可ではなくwrite pause/fix-forwardのみとし、DB復元時の即時v4再遮断手順をrunbookに記載する。

## Phase 4 — Merge、pending、全データ保全の回帰監査

### Task 4.1: 複数端末と障害注入

**Files:** `vault-sync-merge.js`/current merge module, `vault-session.js`, sync tests

- [ ] 独立2クライアントで漫画追加＋動画追加、同一動画の別field編集、同一field conflict、delete/edit、順序変更、未知field変更/欠落を検証する。
- [ ] CAS raceの全再merge、counter operation ID + aggregate consistency、duplicate/out-of-order operation、lost response、timeout、HTTP 5xx、expired auth、offline/VPN、multiple tab、logout/lockを検証する。
- [ ] v3端末別counter vector/aggregate fixtureをv4 checkpointへ移行し、既存値を保持しながら二重加算も初期化も起こらないことをテストする。旧値を未適用incrementと区別できない場合は自動加算を停止する。
- [ ] local quota/failure、encrypt/decrypt failure、baseline corrupt/missing/stale, process interruption, partial apply/rollbackでdata/pending/tombstoneを保持する。
- [ ] `gameSave` round-tripと既存Vault payload normalizationを含む広域保全テストを実行する。game機能コードには触れない。

### Task 4.2: 未知フィールド、削除寿命、データ経路を最終監査

**Files:** `vault-payload.js`, deletion handlers, tests

- [ ] 未知field unchanged / explicit delete / normalizer omissionの各テストを作り、無断delete/resurrectionを防ぐ。
- [ ] Tombstone compaction条件を再確認する。端末ackがない場合は削除記録を残す。
- [ ] 暗号化画像/chunk tombstoneとVault tombstoneの相互作用、logout/lock cleanup、VPNアクセス喪失中のread/write/sync拒否を回帰確認する。
- [ ] source内の全Vault writer/deleter検索結果をplan inventoryと照合し、漏れを修正する。

## Phase 5 — 必須チェックと隔離restore/browser検証

### Task 5.1: 自動検証

- [ ] 関連テストを先行実行して修正し、最後に`npm test`、`npm run verify:static`、変更JS syntax check、PostgreSQL migration suite、Supabase security advisorsを成功させる。
- [ ] `git diff --check`、全差分レビュー、game差分なし、secret/payload loggingなしを確認する。
- [ ] 実施できなかった検査は正確な環境blockerを記録する。テストを削除/skipして成功扱いにしない。

### Task 5.2: データを隔離した検証

- [ ] 本番とは別の実PostgreSQLへ本番DB backupをrestoreし、row count/revision/schema/function/grantsと暗号文hashを照合する。payloadを表示/ログ化しない。
- [ ] Supabase DB backupにStorage実ファイルが含まれないことを前提に、必要な暗号化Storage objectを別途export/restoreし、object key/metadata/reference/getを検査する。
- [ ] 2つの独立認証済みテストclient/browser contextで、編集、削除、CAS race、legacy/v3→v4 decrypt/migrate、reload後の保持を検証する。
- [ ] guest Drive画像とVPN gateは専用fixture/テスト主体で確認し、利用者データを破壊しない。
- [ ] 実利用者Vaultの復号権限がない場合は、DB側では暗号文hash/revisionだけ確認し、fixture復号と実データの中身確認を区別して報告する。

**Gate:** バックアップ復元が失敗、または端末未同期データを保全する手段が不明なら、本番migrationに進まない。

## Phase 6 — PR/CI、互換bundle公開、本番migration、Pages確認

### Task 6.1: 本番変更より先にPRレビュー・CIを完了

- [ ] 全差分をレビューし、作業開始時の無関係/ユーザー変更を含まないこと、game機能コード差分がないことを確認してPRを作成する。
- [ ] GitHub CIでnpm/static/PostgreSQL/互換matrix/security checksが成功するまで本番DBを変更しない。
- [ ] PRレビュー・CI成功後に、旧DBで既存v3 bundleが動くことと、v4-capable bundleがcapability absent時に既存v3経路で動作し新RPCを要求しないことを、Pages相当のbundle/API統合testで確認する。
- [ ] gateがnetwork/auth failureを旧DBと誤認しないこと、v4-specific writesを成功扱いしないことを確認する。

### Task 6.2: compatibility-gatedコードをmain/Pagesへ先行公開

- [ ] Task 5.2の隔離restore gateを通過済みであれば、レビュー/CI済みPRをmainへmergeする。backup取得/restoreが未完了でも、旧DB compatibility matrixが成功し、v4 RPCを必要としないことが証明できた場合はv4 capability gate付きbundleとして公開してよい。
- [ ] PR merge後、remote main SHAと内容を照合し、そのSHAのGitHub Pages deployment run開始とrun URLを確認する。
- [ ] 旧本番DB上で新bundleが既存のread/sync/create機能を壊さず、capabilityがない間はv4動作を有効扱いしないことをread-only/専用test userで確認する。問題があればproduction migrationを止め、client fixを先に行う。

### Task 6.3: backup gate後に本番protocol v4 migrationを適用

- [ ] migration直前に新規backupを取得し、artifact/時刻/対象を記録する。DB、local pending、Storageの復旧経路を別々に再確認する。
- [ ] PRレビュー/CI、CI PostgreSQL、security advisor、production backup隔離restoreがすべて成功した場合のみ、本番でread-only preflight後にmigrationを適用する。
- [ ] migrationはatomicにv4 capabilityとcreate/update RPCを有効化し、直接INSERT/UPDATEを閉じてv4以外のwriteを拒否する。途中状態や必要権限不足をcapability v4として広告しない。
- [ ] 適用後、migration履歴、RPC定義、worker ownership/auth checks、grants、RLS、schema、Vault行数/revisionを読み取り確認する。payload/鍵は出力しない。
- [ ] 想定外ならwrite pauseし、旧protocolを戻さないfix-forward/復旧を行う。v4 capabilityは修復完了まで無効とする。

### Task 6.4: v4実同期確認

- [ ] 専用の2認証端末でlegacy protocolなし/v1/v2/v3 Vaultを復号し、未同期差分を保ったv4 CAS移行、独立追加/編集、tombstone削除、CAS再試行を確認する。
- [ ] v4 bundleがcapabilityを検知して新規作成/更新RPCに切り替わること、古いv3 bundleの書込み拒否とローカルpending保持を確認する。
- [ ] 最新再読込後も両端末の編集と削除が反映されることを実データとは分離した専用fixtureで確認する。
- [ ] 実端末/アカウントが利用できない場合は隔離統合テストを完了し、実同期を未完了として明記する。

## 最終報告項目

- 作業開始main SHA、変更内容/file一覧、削除経路/tombstone伝播、protocol v4移行、旧版拒否、新規作成RPC、権限/CAS契約。
- PostgreSQL backup/restore対象と結果、Storage/端末ローカル復旧評価、本番migration状態、RPC/RLS/grant確認。
- 2-client/multi-browser、delete/edit、merge、counter、実ブラウザ・guest/VPN確認、各テスト件数。
- PR URL、最終main SHA、Pages deployment run URL。
- 未解決条件を列挙し、次の6問へ証拠とともに完了/未完了で回答する。
  1. legacy Vaultでも旧クライアント更新を本番拒否できるか。
  2. 既存データを失わずにprotocol v4へ移行できるか。
  3. 削除済みデータが別端末で復活しないか。
  4. 複数端末の独立変更が同期順に依存せず保持されるか。
  5. 本番Supabase migrationが実適用・検証済みか。
  6. 同期基盤に重大な未解決データ消失リスクがないか。

## 実装開始前のレビュー

設計/計画レビューで指摘されたprotocol v3識別不足、公開順序、worker認可、CAS表現、journal秘匿性、counter migration、および本番切替中のin-flight v3同期/PostgREST schema cache遅延を反映済み。実装承認済み。Phase 0から順に実施する。PRレビュー/CIは本番変更前に完了し、本番writeはPhase 5 backup/restore gate後のPhase 6.3に限る。Phase 6.2のPages公開は旧DB互換gateが成功した場合だけ行い、v4 capabilityが正常確認されるまでv4 writeを行わない。PGRST202等で新RPCが未認識の場合は永続的な旧DB判定にせず、pendingを保持して再probeする。
