# Vault v4本番移行・バックアップ復元ランブック

この文書は、2026-10-10時点の本番状態を確認した結果に基づく運用手順です。通常のmigration手順と、検証環境で復元できない場合の停止条件を定めます。暗号化Vaultのpayloadや認証秘密を、この文書・Git・CIへ記録しません。

## 現在の確認状態

- `main`: `8a57a9e09bea1a4aa47abee56a01e33da6e3eb73`。PR #224はmainへ反映済みです。
- Pagesの同SHA deploymentは `completed / success` です。
- 本番SupabaseはFree plan、PostgreSQL 17です。Vaultは2行で、revisionは1と1133でした。payloadを復号・表示していません。
- 本番にはv4 capability/create/update RPCがなく、v4 migration履歴もありません。authenticatedにはVault表の直接INSERT/UPDATE/DELETE権限と旧RPCが残り、RLSは有効ですが本人行に対する旧書込み経路を許しています。
- PR #224のPostgreSQL 17 CIは合成データを使う隔離テストです。本番backupの取得・復元を証明しません。
- この実行環境に `psql`、`pg_dump`、`pg_restore`、Supabase CLI、Docker、DB接続資格情報がありません。Supabase MCPのSQL機能は読み取り診断にのみ使用し、Vault payload自体を返さない照合値だけを取得しました。

## Free planで使えるbackup経路

| 経路 | 利用可否と制約 |
| --- | --- |
| Dashboardのmanaged backup download | Free planではダウンロードできません。Supabaseの管理バックアップを隔離restoreする方法として使用しません。 |
| `pg_dump` / Supabase CLI `db dump` | Free planでも論理dumpを作れます。DB接続パスワード、PostgreSQL 17互換クライアント、ネットワーク接続が必要です。実行環境にdumpを保存し、GitHubや外部CIへ送信しません。 |
| ローカルPostgreSQL/Supabase | 現在の実行環境にはPostgreSQL/Dockerがありません。ツールを備えたローカルの隔離環境を用意できれば無償で検証可能です。Supabase管理スキーマの依存関係を確認し、単なる空PostgreSQLへ全体dumpを直接restoreしません。 |
| GitHub Actions PostgreSQL 17 | PRで合成データのmigration・dump・restore手順を検証します。実Vault backupをrunnerへ転送したりartifactへ保存したりしません。 |
| Supabase branch/追加project | 作成していません。Free quotaや費用が確認できない環境で作成しません。有料branch/PITRは費用の明示承認がない限り使用しません。 |

この環境では本番dumpを安全に取得・restoreするための接続資格情報とローカル復元先がありません。Free planであることだけが障害ではなく、`pg_dump`によるローカル取得は可能です。次回実行前にDBパスワードを利用者が安全なローカル経路で用意し、PostgreSQL 17 clientと隔離復元環境を準備してください。パスワードをチャット、ソース、コマンド履歴、CIへ入力しないでください。

## 本番backupと隔離restore

### 1. 事前準備

1. Supabase DashboardのConnectで接続情報を取得し、database passwordをローカルで確認します。接続URLへpasswordを埋め込まず、権限600の`.pgpass`または同等の秘密保管手段を使います。
2. PostgreSQL 17互換の`pg_dump`/`pg_restore`と、Supabase依存オブジェクトを扱える隔離restore先を用意します。restore先は本番と別のローカルコンテナ/VMとし、本番endpointへ接続しないことを接続先とDNSで確認します。
3. 一時保存先をGit checkout外に作成し、directory modeを700、file modeを600にします。FileVault等のディスク暗号化を有効にしてください。バックアップ用鍵をVault鍵やSupabase API keyと共用しません。
4. backup対象が`public.manga_reader_vaults`の全行・全列、関連制約、RPC/function定義、RLS、GRANT/REVOKE、`supabase_migrations`履歴、restore依存オブジェクトを含むことを確認します。Vault以外の必要なアプリデータも同一DB内にある場合は、関係範囲を事前に決めます。Storage APIの実ファイルはPostgreSQL dumpに含まれないため別対象です。

### 2. 暗号化backupを取得

CLIの形式はインストール済みSupabase CLIの`supabase db dump --help`で確認します。`pg_dump`のcustom archiveを使う場合は、passwordのない接続文字列と権限600のpassword fileを使用し、暗号化ファイルだけを保管します。例:

```bash
set -euo pipefail
umask 077
BACKUP_DIR="/private/var/<secure-local-backup-directory>"
mkdir -m 700 -p "$BACKUP_DIR"
export PGPASSFILE="$BACKUP_DIR/.pgpass"
test -f "$PGPASSFILE" # password file is prepared locally and never committed
chmod 600 "$PGPASSFILE"

# PGHOST/PGPORT/PGUSER/PGDATABASEはDashboardの接続情報から設定する。
# PGPASSFILEへdatabase passwordを安全に入力し、値を画面へechoしない。
DB_CONN="host=$PGHOST port=$PGPORT dbname=$PGDATABASE user=$PGUSER sslmode=require passfile=$PGPASSFILE"

pg_dump --format=custom --dbname="$DB_CONN" \
  | gpg --symmetric --cipher-algo AES256 --output "$BACKUP_DIR/vault-pre-v4.dump.gpg"
```

暗号化前のdumpを平文ファイルに残しません。GPGの暗号化パスフレーズは対話入力し、バックアップと別の安全な場所で保管します。`pg_dump`、PostgreSQL server、`gpg`の終了コードを確認し、archive一覧を復号ストリームで`pg_restore --list`へ渡して完了性を確認します。暗号化backupのchecksum、作成時刻、対象project、ツールversionを記録します。Vault payloadやpasswordをログへ出しません。

```bash
gpg --decrypt "$BACKUP_DIR/vault-pre-v4.dump.gpg" \
  | pg_restore --exit-on-error --no-owner --dbname="$LOCAL_DB_CONN" -
```

`LOCAL_DB_CONN`は隔離先の接続情報です。復号データを一時ファイルへ書かず、対話入力したGPGパスフレーズを使用します。

### 3. 隔離restoreと照合

1. 本番と別の一時PostgreSQL/Supabase環境へ復元します。復元先を再確認してから、対話入力したbackupパスフレーズで復号し、`pg_restore --exit-on-error --no-owner`を使います。production接続文字列をrestore先へ指定しません。
2. restore前後で、Vault件数、各行のrevision/updated_at、`payload::text`のSHA-256、テーブル/制約定義、RPCのidentity arguments/`prosecdef`/`search_path`/ACL、RLS/policy、table grants、migration履歴を照合します。比較結果だけを出し、payload本体はselect・表示・ログ出力しません。
3. SQL関数/roleの依存が不足してrestoreが失敗した場合は、その場で本番を変更せず、足りないrole/schema/extensionを隔離環境へ用意して再検証します。auth.users等に依存する所有者IDは必要最小限のscopeで扱い、DB一式を外部サービスへ送信しません。
4. 復元データのアプリ復号は専用fixtureで別に検証します。利用者の鍵を持たず実Vaultを復号できない場合、暗号文hash一致を復号確認と表現しません。
5. PostgreSQL backupはStorage実ファイル、ブラウザ内の未同期変更、暗号化baseline/pending journal、利用者の復号鍵を保護しません。それぞれの復旧経路を別途確認し、実Storage objectを変更・削除しません。

次の読み取りSQLは、本番と隔離restore先で同じ接続先確認後に実行します。結果は安全なローカルファイル間で比較し、payload列そのものは取得しません。

```sql
-- 件数、revision、時刻、暗号文のSHA-256だけを比較する
select count(*) as vault_count,
       jsonb_agg(jsonb_build_object(
         'revision', revision,
         'updated_at', updated_at,
         'payload_sha256', encode(extensions.digest(payload::text, 'sha256'), 'hex')
       ) order by revision) as vault_fingerprints
from public.manga_reader_vaults;

-- table columns と制約
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'manga_reader_vaults'
order by ordinal_position;
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.manga_reader_vaults'::regclass
order by conname;

-- RLS policy とtable grants
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'manga_reader_vaults'
order by policyname;
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'manga_reader_vaults'
order by grantee, privilege_type;

-- 関連RPCの署名、security属性、設定、ACL、定義hash
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       p.prosecdef, p.proconfig, p.proacl,
       encode(extensions.digest(pg_get_functiondef(p.oid), 'sha256'), 'hex') as definition_sha256
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in (
         'update_manga_reader_vault', 'manga_reader_vault_sync_capability',
         'create_manga_reader_vault_v4', 'update_manga_reader_vault_v4'))
   or (n.nspname = 'private' and p.proname in (
         'manga_reader_vault_sync_capability_worker',
         'create_manga_reader_vault_v4_worker', 'update_manga_reader_vault_v4_worker'))
order by n.nspname, p.proname, p.oid;

-- Supabase CLI migration history
select version, name from supabase_migrations.schema_migrations order by version;
```

PR #224以後、CIには合成fixtureをcustom archiveへdumpし、別DBへrestoreして行revision/hash、schema、RPC、RLS、grants、migration historyを比較する検証を追加します。このCIは手順と機械的な照合方法の検証だけを行い、本番backupの取得・restore結果として扱いません。

### 4. backup保管と削除

- 暗号化backupとchecksumだけを、アクセス制限されたローカルの保管先へ保存します。Git、GitHub、PR、CI artifact、チャット、一般共有ドライブへ置きません。
- 復元検証後に一時restore DB/containerと復号済み一時ファイルを削除し、暗号化backupは合意した保管期限が終わるまで保持します。削除時刻と担当だけを記録し、payload/鍵は記録しません。
- 暗号化backupの保管期限、暗号鍵の保管場所、破棄担当が決まらない場合は本番migrationを保留します。

## migration適用ゲート

以下すべてを満たすまでmigrationを適用しません。

- 本番直前backupと隔離restore成功、件数/revision/hash/schema/RPC/RLS/grants/history一致を記録済み。
- 非本番PostgreSQL 17でv3互換migrationとv4 migrationの両方が適用済み。
- protocolなし/v1/v2/v3/不正値/将来値の書込み拒否、v4 create/update、CAS stale 0行、認証/匿名/他人行/direct table writeの拒否を検証済み。
- capabilityはv4のRPC・権限が利用可能な状態でだけ応答し、PostgREST schema cache遅延はunknown/retryとして扱う。
- PR review/CIが完了し、現行bundleが旧DBで既存動作を維持し、旧クライアントはv4 writeを成功扱いしない。
- pending/local baselineと必要なStorageの保全策、障害時のwrite pauseとfix-forwardがレビュー済み。
- 有料環境を使う場合は、その料金に対する明示承認済み。

ゲート通過後に行う順序:

1. 本番のread-only preflightでVault件数/revision/hash、migration履歴、RLS/grants/RPCを再採取する。
2. 新しい暗号化backupを取得し、前回backupとVault件数/revision/hashを照合する。
3. v3 CAS permission migration、次にv4 RPC migrationを適用する。各migrationの終了結果を確認し、失敗したmigrationの後続を続けない。
4. read-only queryでcapability/create/update RPC、worker認可、RLS、authenticated/anon grants、`service_role`既存権限、migration履歴、Vault件数/revision/hashを確認する。
5. 旧bundleが更新拒否され、v4 bundleがcapability確認後にのみ同期できることを、専用の2端末test accountで検証する。

本番Vaultのpayload/revisionをmigrationで書き換えません。旧protocolの再許可や直接UPDATE/INSERT権限の再付与をrollbackとして行いません。

## 障害時の復旧

1. migration/実同期の異常を検出したら、専用クライアントを停止してVault writeを一時停止します。旧protocol書込みを再許可せず、`service_role`の緊急アクセスは記録付きの管理操作に限定します。
2. 現在のDBを新たにbackupし、異常状態と最新状態を保存します。既存Vault行をtruncate、置換、古いpayloadで上書きしません。
3. 失敗内容がfunction/権限/検索path等なら、v4 gateを閉じた状態を保ちfix-forward migrationを隔離DBで検証します。schema cache問題は一定間隔で再probeし、同期clientはpendingを保持します。
4. backupを本番へ直接restoreしません。restoreは別の隔離DBで先に実行し、migration後に更新されたVaultや未同期端末変更を確認します。復旧先へ切り替える必要がある場合は、データ差分と失われるrevisionをレビューし、v4遮断を再適用した後に限り計画します。
5. DBをmigration前状態へ復元した場合、外部clientを再接続する前にv4 writeを閉じ、旧protocol遮断と権限状態を再設定します。クライアントは同期成功を表示せず、pending/journalを保持させます。
6. 復旧後に件数/revision/hashとRLS/RPC/grantsをread-only照合し、専用test accountで実同期を再検証します。

write pauseの具体的なSQLは、適用後の実grantsを確認し、隔離DBで再現してから運用担当が実行します。未検証のREVOKE/GRANTやproduction data updateを緊急時に即興で実行しません。
