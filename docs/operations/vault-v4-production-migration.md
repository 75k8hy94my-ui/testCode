# Vault v4本番移行・バックアップ復元ランブック

この文書はVault v4 migrationの運用手順と停止条件を定めます。main SHA、Pages deployment、本番DBの状態、利用可能な接続方法は実施直前に再取得し、この文書にある過去の値を現在値として扱いません。暗号化Vaultのpayloadや認証秘密を、この文書・Git・CIへ記録しません。

## 実行直前の再確認

- GitHub `main` SHAとそのSHAに紐づくPages deploymentを確認します。PRのマージやCI成功だけでPages公開済みとは判定しません。
- 本番のVault件数・revision・暗文SHA-256、RPC、RLS、権限、migration履歴をread-onlyで採取します。以前の件数やrevisionを固定値として前提にしません。
- 本番migrationは、暗号化backupの復号・archive検査・隔離restore・照合を今回のmigration直前に完了するまで適用しません。
- CIの合成fixtureによるrestore検証と、本番backupを使った隔離restore検証は別の証拠として記録します。

## Free planで使えるbackup経路

| 経路 | 利用可否と制約 |
| --- | --- |
| Dashboardのmanaged backup download | Free planではダウンロードできません。Supabaseの管理バックアップを隔離restoreする方法として使用しません。 |
| `pg_dump` / Supabase CLI `db dump` | Free planでも論理dumpを作れます。DB接続パスワード、PostgreSQL 17互換クライアント、ネットワーク接続が必要です。実行環境にdumpを保存し、GitHubや外部CIへ送信しません。 |
| ローカルPostgreSQL/Supabase | ローカルのPostgreSQL 17または隔離Docker環境で検証できます。Supabase管理スキーマの依存関係を確認し、単なる空PostgreSQLへ全体dumpを無条件にrestoreしません。 |
| GitHub Actions PostgreSQL 17 | PRで合成データのmigration・dump・restore手順を検証します。実Vault backupをrunnerへ転送したりartifactへ保存したりしません。 |
| Supabase branch/追加project | 作成していません。Free quotaや費用が確認できない環境で作成しません。有料branch/PITRは費用の明示承認がない限り使用しません。 |

Free planであることだけでは`pg_dump`によるローカル取得を妨げません。利用可能な接続経路とPostgreSQL 17 client、隔離復元先を実施時に確認します。パスワードをチャット、ソース、コマンド履歴、CIへ入力しません。

## 本番backupと隔離restore

### 1. 事前準備

1. Supabase DashboardのConnectで接続情報を取得し、database passwordをローカルで確認します。接続URLへpasswordを埋め込まず、権限600の`.pgpass`または同等の秘密保管手段を使います。
2. PostgreSQL 17互換の`pg_dump`/`pg_restore`と、Supabase依存オブジェクトを扱える隔離restore先を用意します。restore先は本番と別のローカルコンテナ/VMとし、本番endpointへ接続しないことを接続先とDNSで確認します。
3. 一時保存先をGit checkout外に作成し、directory modeを700、file modeを600にします。FileVault等のディスク暗号化を有効にしてください。バックアップ用鍵をVault鍵やSupabase API keyと共用しません。GPG鍵は暗号学的乱数で生成し、macOS Keychain APIを使って`WhenUnlockedThisDeviceOnly`属性で保存します。鍵をコマンド引数へ渡しません。`security find-generic-password`で別プロセスから再取得できることを値を表示せず確認します。
4. backup対象が`public.manga_reader_vaults`の全行・全列、関連制約、RPC/function定義、RLS、GRANT/REVOKE、`supabase_migrations`履歴、restore依存オブジェクトを含むことを確認します。Vault以外の必要なアプリデータも同一DB内にある場合は、関係範囲を事前に決めます。Storage APIの実ファイルはPostgreSQL dumpに含まれないため別対象です。

### 2. 暗号化backupを取得

CLIの形式はインストール済みSupabase CLIの`supabase db dump --help`で確認します。`pg_dump`のcustom archiveを使う場合は、passwordのない接続文字列と権限600のpassword fileを使用し、暗号化ファイルだけを永続保管します。custom archiveはseek可能である必要があるため、平文dumpは権限600のRAM disk内に一時作成し、暗号化後にRAM diskを取り外します。例:

```bash
set -euo pipefail
umask 077
BACKUP_DIR="/private/var/<secure-local-backup-directory>"
RAM_DISK="/Volumes/<private-ram-disk>"
KEYCHAIN_SERVICE="<unique-backup-keychain-service>"
KEYCHAIN_ACCOUNT="$(id -un)"
mkdir -m 700 -p "$BACKUP_DIR"
export PGPASSFILE="$BACKUP_DIR/.pgpass"
test -f "$PGPASSFILE" # password file is prepared locally and never committed
chmod 600 "$PGPASSFILE"

# PGHOST/PGPORT/PGUSER/PGDATABASEはDashboardの接続情報から設定する。
# PGPASSFILEへdatabase passwordを安全に入力し、値を画面へechoしない。
DB_CONN="host=$PGHOST port=$PGPORT dbname=$PGDATABASE user=$PGUSER sslmode=require passfile=$PGPASSFILE"

pg_dump --format=custom --dbname="$DB_CONN" --file="$RAM_DISK/production.dump"
chmod 600 "$RAM_DISK/production.dump"
security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 0 \
      --symmetric --cipher-algo AES256 --output "$BACKUP_DIR/vault-pre-v4.dump.gpg" \
      "$RAM_DISK/production.dump"
chmod 600 "$BACKUP_DIR/vault-pre-v4.dump.gpg"
shasum -a 256 "$BACKUP_DIR/vault-pre-v4.dump.gpg" > "$BACKUP_DIR/vault-pre-v4.dump.gpg.sha256"
chmod 600 "$BACKUP_DIR/vault-pre-v4.dump.gpg.sha256"
```

シェルではpipefailを有効にしてpg_dump/Keychain取得/GPGの失敗を検出します。Keychain値はpipe内だけで渡し、画面・環境変数・コマンド引数・ログへ出しません。暗号化backupのchecksum、作成時刻、対象project、tool versionを記録します。Vault payloadやdatabase passwordをログへ出しません。平文archiveは復号・restore検証後にRAM diskをdetachします。

```bash
security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w \
  | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt \
      "$BACKUP_DIR/vault-pre-v4.dump.gpg" > "$RAM_DISK/production.dump"
chmod 600 "$RAM_DISK/production.dump"
pg_restore --list "$RAM_DISK/production.dump" >/dev/null
pg_restore --exit-on-error --no-owner --dbname="$LOCAL_DB_CONN" "$RAM_DISK/production.dump"
```

`LOCAL_DB_CONN`は隔離先の接続情報です。RAM diskが永続ディスクへマウントされていないことを確認してから復号します。復元を2回独立に行い、両方の結果を本番read-only fingerprintと照合するまでは旧暗号化backupを削除しません。

### 3. 隔離restoreと照合

1. 本番と別の一時PostgreSQL/Supabase環境へ復元します。復元先を再確認してからKeychainから別プロセスで鍵を取得し、RAM disk上のarchiveを`pg_restore --exit-on-error --no-owner`で復元します。production接続文字列をrestore先へ指定しません。
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

PostgreSQL 17 CIは合成fixtureをcustom archiveへdumpし、別DBへrestoreして行revision/hash、schema、RPC、RLS、grants、migration historyを比較します。また`scripts/test-vault-v4-production-cutover.sh`で単一transactionのrollback/history、in-flight旧v3要求の拒否、段階適用時のwrite pauseを検証します。これらは手順の検証だけであり、本番backupの取得・restore結果として扱いません。

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
3. migration 2本は個別に`supabase db push`せず、次の単一`psql`呼び出しで適用します。psqlの`--single-transaction`と`ON_ERROR_STOP`を必須にし、両migrationと履歴行を同じtransactionに含めます。実行前に最新の暗号化backupと隔離restoreを完了してください。

   ```bash
   psql --single-transaction --set=ON_ERROR_STOP=1 --dbname="$DB_CONN" --file=scripts/vault-v4-atomic-cutover.psql
   ```

   このscriptはVault表に`ACCESS EXCLUSIVE` lockを取得して進行中の表操作をdrainし、migration 2本とmigration historyの2行を同じtransactionで実行します。lock timeout、SQL error、接続切断で失敗した場合、PostgreSQLは全変更と履歴をrollbackします。終了コードが0でない場合は後続を実行せず、読み取り診断で全migration前状態かを確認します。migration historyに片方だけある状態を検出したscriptは停止します。
4. commit後、read-only queryでcapability/create/update RPC、worker認可、RLS、authenticated/anon grants、`service_role`既存権限、migration履歴、Vault件数/revision/hashを確認します。2つのmigration versionが履歴にあり、Vault fingerprintがbackupと一致することを確認します。
5. transaction commit後、PostgRESTのschema cacheを`NOTIFY pgrst, 'reload schema'`で更新します。これにはdirectまたはsession-mode接続を使用します。transaction-mode poolerはsession機能のLISTEN/NOTIFYに使わず、Supabase SQL Editorから通知する代替手順を使います。Supabaseはmigration/backupにdirect connection、IPv4環境ではsession poolerを案内しています。
6. capability/RPC probeを一定間隔で再試行します。`PGRST202`、RPC未認識、応答timeoutは一時的なunknownとして扱い、その間は同期を成功扱いせずpendingを維持します。必要ならschema reload通知を再送し、capability 4とRPCが応答するまで保護データの書き込みを再開しません。
7. 旧bundleのv3書き込みが拒否され、v4 bundleがcapability確認後にのみ同期できることを、専用の2端末test accountで検証します。

`supabase db push`はmigration fileごとにtransaction/historyを確定するため、この2本に対しては使用しません。保護策として1本目のmigration単体にもfail-closed write guardを入れています。誤って1本目だけがcommitした場合はv3/直接書き込みが拒否された停止状態になります。旧protocolや直接権限を戻さず、再度backup・診断後にv4 migrationをfix-forwardで適用します。この経路は通常の一括切替手順の代替ではありません。

本番Vaultのpayload/revisionをmigrationで書き換えません。旧protocolの再許可や直接UPDATE/INSERT権限の再付与をrollbackとして行いません。

## 障害時の復旧

1. migration/実同期の異常を検出したら、専用クライアントを停止してVault writeを一時停止します。旧protocol書込みを再許可せず、`service_role`の緊急アクセスは記録付きの管理操作に限定します。
2. 現在のDBを新たにbackupし、異常状態と最新状態を保存します。既存Vault行をtruncate、置換、古いpayloadで上書きしません。
3. 失敗内容がfunction/権限/検索path等なら、v4 gateを閉じた状態を保ちfix-forward migrationを隔離DBで検証します。schema cache問題は一定間隔で再probeし、同期clientはpendingを保持します。
4. backupを本番へ直接restoreしません。restoreは別の隔離DBで先に実行し、migration後に更新されたVaultや未同期端末変更を確認します。復旧先へ切り替える必要がある場合は、データ差分と失われるrevisionをレビューし、v4遮断を再適用した後に限り計画します。
5. DBをmigration前状態へ復元した場合、外部clientを再接続する前にv4 writeを閉じ、旧protocol遮断と権限状態を再設定します。クライアントは同期成功を表示せず、pending/journalを保持させます。
6. 復旧後に件数/revision/hashとRLS/RPC/grantsをread-only照合し、専用test accountで実同期を再検証します。

write pauseの具体的なSQLは、適用後の実grantsを確認し、隔離DBで再現してから運用担当が実行します。未検証のREVOKE/GRANTやproduction data updateを緊急時に即興で実行しません。
