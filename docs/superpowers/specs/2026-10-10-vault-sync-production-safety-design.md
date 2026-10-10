# Vault差分同期・本番移行・データ保全設計

## 状態

設計・計画レビュー承認済み。Phase 0から実装中。

## 目的と範囲

Vault同期の残存するデータ消失リスクを修正し、既存の暗号化データを保持した状態で安全に運用できることを目指す。対象は`game`の機能コードを除くtestCode全体のVault同期、削除、Supabase権限、バックアップ、テスト、公開である。`gameSave`は既存値の読込・書戻し互換性を検証するが、game機能コードや保存形式は変更しない。

実装完了と本番運用可能の判定を分ける。コードのPR・main反映・Pagesデプロイ開始はコード作業の終了条件とする。本番運用可能と報告するには、本番バックアップの復元検証、本番migration、実同期検証も必要であり、これらが未完了なら明示的に未完了とする。

## 現状と制約

- 現行mainでクライアント定数`SYNC_PROTOCOL_VERSION`は3。ただし現行v3クライアントはCAS merge後に`vaultSyncTombstones`をpayloadから削除するため、新しい削除伝播規則と互換ではない。今回の移行先はv4とし、v3を含むprotocolなし/v1/v2のenvelopeは読み取り・クライアント側移行の対象、書込みはv4のみ許可する。
- 本番Vaultは2件で、envelopeにprotocol情報がない旧形式。暗号化payloadを調査・変更・再生成せず、利用者クライアントによる復号とCAS更新でのみ移行する。
- envelopeの暗号化形式versionと`syncProtocolVersion`は別のversionである。同期protocol v4への移行を理由に暗号化形式version `version = 1`を変更しない。
- 本番RPCは旧CAS実装で、直接UPDATE経路が残る。現在のmigrationをそのまま適用しても、legacy行への旧protocol書込みを拒否できない。
- `markSyncDeletion()`は存在するが、主要な実削除経路から呼ばれていない。
- SupabaseプロジェクトはFreeで開発branchがなく、復元済みバックアップを確認できていない。ローカルPostgreSQL/CLIも使えない。branch作成の費用確認ツールも利用できないため、課金を伴う環境操作はしない。
- これらの制約の下では、本番DB変更を実施しない。復元確認済みバックアップと非本番での検証環境が確保されるまで本番migrationを保留する。

## 同期protocolと旧Vault移行

サーバーが受理する更新・新規作成はprotocol v4に限定する。現行v3はtombstone保持規則がなく、protocol v3だけでは新旧クライアントを区別できない。protocolなし/v1/v2/v3、不正値、未対応の将来値は読み取り可能でも書込みを拒否する。現在行のversionにかかわらず受信envelopeを検査する。version番号は機能能力の暗号学的証明ではないが、既知のv3クライアントと新v4クライアントを確実に区別する境界にする。

既存Vaultは次のクライアント手順で移行する。

1. 認証済みの現行クライアントが現在のVault envelopeとrevisionを取得する。
2. 利用者の既存認証手段でクライアント内復号し、既存payloadを保持する。
3. 同期基準とローカル状態を照合する。基準不明・復号失敗・識別子不一致時は書込みを止め、データを保持する。
4. 端末の未同期変更をクラウド最新版へ3-way mergeする。通常変更がない場合も、正当な基準を確立できたときは同一データのv4 envelopeを生成する。
5. 取得revisionを使ってCAS保存する。失敗時は最新版を再取得してmergeからやり直す。
6. CAS成功後にのみ、統合payload・暗号化基準・revision・pending状態をローカルへ更新する。

認証credential、鍵素材、平文protected dataを新たに永続化しない。パスフレーズ、passkey、Recovery Key、wrapperは既存値を維持し、protocol移行で再生成・削除しない。新規Vaultもv4の厳格な作成APIを通し、CAS更新と権限境界を迂回する直接書込みを廃止する。

### CAS RPC契約

- CAS成功は、更新後のrevisionを含む単一行として返す。期待revision不一致はSQL例外にせず、成功したRPCの0行結果として返す。クライアントadapterはこれを内部の`conflict`結果に正規化し、認証状態を保ったまま最新行を再取得する。競合結果にクラウドpayloadを含めない。
- 認証拒否、本人不一致、匿名制限、protocol不正/旧版、payload不正は、競合とは別の安定したエラーcodeにする。クライアントはこれらを自動再試行しない。
- HTTP/RPCタイムアウト等で結果不明の場合は、同じpayloadを即座に再送しない。最新行を再取得し、操作IDまたは保存内容から当該操作の反映を証明できれば成功として回復し、できなければ新しい最新版から再mergeする。判定できない場合はpendingを保持して停止する。
- merge/save APIのテストは、成功の1行結果、通常のCAS競合の0行結果、例外形式の認証/protocol拒否、通信結果不明を別ケースとして固定する。クライアントadapterは0行を再取得・再mergeへ接続し、例外をCAS競合として誤認しない。DBのエラー形式を変更する場合はadapterと統合テストを同じ変更で更新する。

### 新旧クライアント混在時の切替

1. 現行の旧RPC・既存Vault・複数世代クライアントが混在する状態を記録し、DB、端末、Storageの保全策と隔離restoreを完了する。
2. v4 RPC/権限/migrationとv4対応クライアントを実装し、非本番PostgreSQLで検証したうえでPRレビューとGitHub CIを完了する。
3. 本番DB変更前に、v4対応bundleをcapability gate付きでPagesへ公開する。v4 capabilityがない旧DBでは削除journal/tombstoneを端末に保持し、削除同期成功とは扱わない。他のv4専用変更を含まない既存v3同期/作成経路だけを維持し、新RPCを呼ばない。互換マトリクスの旧DB経路が失敗した場合は公開を保留する。
4. backup隔離restoreを含む本番ゲート通過後にv4 migrationを適用し、create/update RPCとv4 capabilityを有効にする。直接INSERT/UPDATEは閉じ、protocolなし/v1/v2/v3をすべて拒否する。v4 bundleはcapabilityを検出して新RPCへ切り替える。
5. 旧v3クライアントは読み取り可能だが書込み拒否となり、ローカル変更/pendingを消さない。新bundleは更新案内を表示する。v4 RPCと直接書込み拒否を本番read-only検査で確認する。

v4 capabilityは新DB側のRPCがversion 4を正常応答した場合のみ有効とする。新RPCのPGRST202/not-found応答は旧DBの確定判定に使わず、PostgREST schema cache遅延を含むunknownとしてbounded backoffで再照会する。照会がまだできない状態で旧RPC経路を試し、serverがprotocol-outdatedまたはpermission deniedを返したら保存成功にせずpendingを保持してcapabilityを再確認する。各同期でprobeを再試行するため、一時的なnot-foundを永続的な旧DB判定としてcacheしない。network/auth/permission errorを旧DB扱いにしない。

互換マトリクスは少なくとも次を満たす。

| DB | クライアント | 動作 |
| --- | --- | --- |
| 旧DB/v3 RPC | 旧v3 bundle | 既存動作を維持。v4完了とは扱わない。 |
| 旧DB/v3 RPC | v4対応bundle | 正常なv4 capability応答が得られない間は、v4固有削除journal/tombstoneをpendingのまま保持し、他の変更だけ旧v3経路で扱う。v4 RPC不在を永続判定せず、削除変更を同期済みと誤表示しない。 |
| v4 DB/RPC | 旧v3 bundle | read-only。v4必須エラーを受けてもローカル状態を保持し、同期成功表示をしない。 |
| v4 DB/RPC | v4対応bundle | v4 create/update RPC、CAS、tombstone propagationを利用する。schema cache更新前はunknownとして再試行し、v3経路が拒否された場合pendingを保つ。 |

切替中に不具合が起きた場合、旧protocolを再許可するmigration rollbackはしない。読み取りを保ちながらVault書込みを一時停止し、またはv4検証を維持したfix-forward migrationを行う。クライアントはcapability gateで旧DB互換モードを維持する。バックアップからDB復旧する場合も、旧クライアント遮断を復旧直後に再適用するまでv4書込みと同期成功表示を閉じる。

## Supabase権限・RPC

公開されたVault表はRLSを維持し、利用者は自分の行だけを読める。`anon`/`PUBLIC`/`authenticated`から直接UPDATE・DELETEを許可せず、CASを迂回できる更新経路をなくす。必要な作成・更新は狭いRPCに集約する。作成時は認証本人、非匿名条件、未作成状態、protocol v4、初期revisionを検査する。更新時は認証本人、非匿名条件、受信protocol v4、期待revision、revision遷移、payload形状を検査する。CAS不一致は非例外の0行結果とし、クライアントが競合として識別する。他人の行、削除・再作成による制御回避、旧protocol、未知protocolを拒否する。

RLS/RPCは本番に適用する前に実PostgreSQLの隔離fixtureで検証する。必要な`SECURITY DEFINER`は公開API面に漫然と置かず、固定された空の`search_path`、完全修飾名、制約された所有者、明示的な`EXECUTE`権限を持つprivate schema内workerへ最小化し、公開側は認証済みinvoker wrapperにする。関数所有者、`auth.uid()`、匿名ログイン、RLS、権限、エラー処理、管理用service_roleの既存運用をテストする。RLSを無効化しない。

Invoker wrapperからworkerを実行する権限経路も明示する。worker schemaはPostgRESTの公開exposed schemaに含めず、wrapper呼出しに必要な`USAGE`とworkerへの`EXECUTE`だけを必要roleへ付与し、`PUBLIC`/`anon`には付与しない。wrapper本体はschema修飾でworkerを呼ぶ。SECURITY DEFINER worker自身もwrapperの検査だけに依存せず、`auth.uid()`が有効で対象行のownerと一致すること、匿名操作でないこと、受信protocolがv4であることを毎回確認する。更新workerはexpected revisionをCAS条件に含め、新規作成workerは本人のVaultが未作成であることを確認する。権限付与対象、関数所有者、匿名/認証済みからの呼び出し可否を隔離PostgreSQLで実証し、worker直接呼出しでも他人行・旧protocol・CAS bypassを拒否し、過剰grantと正規RPCがpermission deniedになる不足grantの双方を検出する。

## 削除とtombstone

まずVault同期対象と削除操作を、`game`機能コードを除いて網羅的に列挙する。配列/ID辞書の正規形から3-way差分で削除を一意に判定できるデータ、お気に入りのようにfalse値で表せるデータ、未知フィールドなど明示tombstoneが必要なデータを区別する。項目削除には安定ID、未知プロパティの削除にはJSON Pointer等の曖昧でないパスを使う。

明示tombstoneが必要な削除では、削除意図を先に耐久化するjournal/transaction helperを使う。JSON Pointer等に作品名/メモ識別子が含まれるjournalはVault AES鍵で暗号化し、user/Vault IDをAADに束縛する。平文journalに保護対象名・ID・値を保存しない。鍵が利用できず安全なjournalを作成できない場合は削除を確定せず、操作を止めてデータを保持する。記録失敗時はデータ削除を行わない。データ削除が失敗した場合は記録をロールバックするか、起動時recoveryで安全に整合させる。保存障害などで完全な原子性を保証できない局面では削除を成功扱いせず、pending intentを維持して回復可能にする。同期・CAS失敗、オフライン、VPN不許可中にtombstoneを破棄しない。再試行は冪等にする。

削除tombstoneは平文の便宜的な同期metadataとしてVault外へ出さず、同期payloadの一部としてVault暗号文に含める。削除した実データとそのtombstoneは同じ統合payload・同じrevisionのCASで確定する。他端末は復号後にtombstoneをmergeへ適用し、その削除履歴を次の暗号化CASにも含める。既存の`vault-session.js`にあるtombstone除外処理をこの仕様に合わせる。未同期journalはローカルで保持し、クラウドCAS成功とローカル基準更新の両方を確認するまで消さない。

削除済みIDを再利用した新規作成は、削除tombstoneだけでは新規作成と判別できないため自動復活させない。通常は新しい安定ID/incarnation IDで作成する。同一IDの意図的な再作成をサポートする必要がある場合は、削除revisionを明示参照する新しいgenerationの作成操作とし、merge規則・競合UI・テストで明示承認された場合だけtombstoneを越える。既存データにgenerationがない場合に同一ID再作成を推測しない。

3-way mergeでは、基準との差分、既知schema、未知field、操作journal、tombstoneを照合する。変更のない未知fieldは保持する。明示削除は他端末から復活させない。正規化の欠落か利用者の削除か判断できない項目は自動で消去・復活させず、同期停止または利用者に選択を求める。削除対同一項目編集は未解決競合とし、暗黙のlast-write-winsをしない。tombstoneは、全対象端末が削除を取り込んだことを示せる安全な条件が成立するまで保持する。長期オフライン端末があり安全な確認ができない場合は保持を優先し、整理方針を別途計測可能にする。

## Merge、競合、pending

3-way mergeの基準は最後に同期成功した状態である。独立した追加と別プロパティ編集は統合し、同一プロパティの異なる編集や削除対編集は書込み前に競合として提示する。CAS失敗時は古いpayloadをrevisionだけ差し替えて再送せず、必ず最新クラウド値からmergeを再実行する。順序列は安定した順序を構成できる場合だけ自動統合する。カウンター等の非可換操作は一意なoperation IDを用い、重複再送を冪等化する。既存端末別カウンターベクトルをoperation ID方式へ移す際は、v3までの集計/ベクトル値をv4 migration checkpointとして一度だけ基準化し、過去incrementを新operationとして再計上しない。旧状態を未適用operationと区別できない場合は自動加算せず停止し、確認可能な復旧を優先する。

pending変更と暗号化baselineは、クラッシュから回復できる順序で保存する。応答消失、タイムアウト、ブラウザ終了、複数タブ、ログアウト、offline/VPN gateを含め、保存成否不明時はクラウドを再読込して判定する。基準不明やユーザー/Vault識別子不一致の状態で全体上書きしない。利用者が選択した競合解決は、最新revisionへ再mergeしてCAS保存し、その成功後にのみpendingを解消する。

## 検証方針

- SQLはCI等の隔離された実PostgreSQLで適用し、synthetic legacy protocol-absent/v1/v2/v3 row、v1/v2/v3拒否、v4 CAS、revision競合、新規作成、他ユーザー拒否、direct worker呼出し拒否、直接UPDATE拒否、匿名拒否、将来version拒否、権限/RLSを確認する。これは本番バックアップの復元検証の代替ではない。
- 同期テストは独立した2クライアント状態を使い、漫画追加＋動画追加、別プロパティ編集、同一プロパティ競合、順序、counter重複、削除対編集、未知field保持/明示削除、暗号化Vault内tombstoneのCAS保存と別端末伝播、CAS再試行、応答消失、offline/VPN、複数タブ、logout/lock、基準欠落を検証する。カウンターはoperation ID集合と集計値/適用済み状態の整合、旧端末別ベクトルからのcheckpoint移行、二重加算/初期化がないこと、重複ID、順不同再送、部分統合を確認する。
- 旧DB/v3 client、旧DB/v4-capable client、v4 DB/v3 client、v4 DB/v4 clientの互換性マトリクスをブラウザ/API統合テストで検証する。旧DBでv4 RPCを必要としないこと、通信/認証失敗を誤って旧DBと判定しないこと、v4 DBでv3 writesを拒否しpendingを保つことを確認する。
- 認証情報wrapper、passphrase/passkey/recovery、`gameSave`、漫画・動画・設定・暗号化画像などのround-tripとrollbackを検証し、実ユーザーデータで破壊テストをしない。
- 実ブラウザの2認証端末、ゲストDrive画像、公開環境のVPN gateは専用認証/データで実施する。利用環境がない場合は隔離統合テストを行い、ブラウザ/本番検証が未実施と報告する。
- `npm test`、`npm run verify:static`、`git diff --check`、変更JavaScriptの構文検査、SQL検査、Supabase security advisorを実施する。復元テストは実際に分離環境へrestoreし、データ件数・メタデータ・アプリからの復号/読取を確認する。

## 本番移行と公開ゲート

バックアップの範囲と目的を区別する。

| 対象 | 保全・復元で確認すること |
| --- | --- |
| Supabase PostgreSQL | Vault暗号文、行数、revision、schema、関数、RLS/grants/migration履歴。復元後に暗号文のハッシュ、行数、revision等を照合する。実利用者の平文をサーバーで確認できない場合、fixtureでアプリ復号を別途検証し、復号確認済みと誤報しない。 |
| ブラウザ端末 | 未同期変更、暗号化baseline、pending/tombstone journal。DB backupでは保護されないため、同期前に端末を消去/ログアウトしない。restore演習ではfixtureのローカル状態を別に保存して再読込・再同期を確認する。 |
| Supabase Storage | 暗号化画像等の実ファイルとobject key/metadata。PostgreSQL backupにStorage APIの実ファイルが含まれると仮定せず、必要な対象は別途export/restoreし、参照整合性と取得可否を確認する。 |
| 復号/復旧手段 | passphrase、passkey、Recovery Key、必要なwrapperが既存利用者に有効であることをfixtureで確認する。backupに鍵を同梱したり、復号用secretをレポートへ出したりしない。 |

同期基盤全体の安全性判断では4対象の境界を個別に記録する。今回のDB migrationに必要な最低条件はPostgreSQLの隔離restoreと、関連Storage objectを変更/削除しないことの確認である。同期機能を全体として本番運用可能と判定するには、ローカル未同期データと必要なStorageファイルの復旧経路も評価する。本番migrationの前提は、取得可能なDB backup、別の隔離環境へのrestore成功、restore後の既存Vault件数/revision/schema/RPC権限確認、実行順序とfix-forward/書込み停止手順のレビュー、非本番実PostgreSQL検証である。いずれかを満たせない場合は本番DBに書き込まない。適用時はmigration前後のschema/RPC/RLS/grantsとrevision・行数を読み取りで照合し、payloadをログやレポートへ出さない。障害時は行を初期化せず更新を止め、旧protocolを遮断したまま復旧する。

コードはPRレビューとCIの完了後、旧DB互換gateのテストも通ったv4-capable bundleをmainへmergeしてPagesへ公開する。旧DB上ではv4 capabilityが存在しない場合だけv3互換経路を維持し、v4機能は有効扱いしない。v4 RPC capabilityが検出された場合に限ってv4書込みへ切り替える。capability確認がnetwork/auth errorの場合はfallbackせず停止する。本番DB migrationはCI/レビュー/backup restore gateの後で行い、migrationを保留してもPagesの既存機能が壊れない互換性試験を必須とする。新RPCを必要とする機能をgateなしで公開しない。本番DBの未解決条件が残る場合、コード公開済みでも同期基盤を完全修正・本番運用可能とは報告しない。ユーザーの追加認証、実バックアップ、restore環境、費用確認が必要ならその具体的な障害を記録する。

## 受け入れ条件

1. legacy Vaultに対するprotocolなし/v1/v2/v3書込みをDBが拒否する。
2. v4対応クライアントが旧protocolなし/v1/v2/v3のVaultを復号し、未同期差分を保持してv4へCAS移行できる。baseline不明時は停止してデータを保持する。
3. 新規Vault作成も本人確認・v4検証を通り、直接経路で迂回できない。
4. 必要な実削除経路が正しい削除表現へ接続され、tombstoneと実データ削除が同じ暗号化CAS payloadで確定し、同期後に別端末から復活しない。
5. 独立端末の別項目/別プロパティ変更が保持され、同一field競合は利用者選択なしに確定しない。
6. game機能コードを変更せず、`gameSave`を含む既存データを保全する。
7. 必須自動テスト・SQL/権限検証が成功し、security-definer worker直接呼出しも認可条件を迂回できず、実施していない本番/ブラウザ検証を明示する。
8. 本番運用可能の判定にはバックアップrestoreと実Supabase適用の証拠がある。
9. コード作業の終了前に対象main SHAのPagesデプロイ開始を確認する。PR/CIレビューは本番DB変更より先に完了し、migration不能時にも公開bundleが旧DB上で既存動作を壊さない。

## 未解決の運用前提

本番backupをエクスポートし、隔離環境でrestoreを実行できる経路が必要。Supabase Free環境ではmanaged branching/automatic backupを前提にできない。費用の明示確認が利用できない状態で有料branchを作成しない。認証済みテストユーザー/第2端末、Google Drive guest fixture/API、VPN public deploymentの検証権限も、実環境検証の前に準備する。
