# testCode — 現行アーキテクチャの入口

> この文書は **2026-11-17 時点で確認した main の実装**を説明する。設計案ではない。以後、構造を変更するコミットではこの文書も更新する。

## まず読む資料と優先順位

1. **実際の実行経路**：入口HTMLの読み込み、呼出し元、現在の実装、現行テスト
2. **AGENTS.md**：Codex等に適用される継続的な開発・安全・公開ルール
3. **この文書**：現行の機能別担当、ページ境界、追跡の起点
4. **docs/superpowers/plans / specs**、その他日付入りの資料：作成時点の計画・設計・回帰基準。**現行仕様の証拠ではない**

この文書とコードが不一致ならコードを調べ、正しい変更時に本書を更新する。古い設計を実装し直さない。

## システムの基本

- ビルド工程のない静的HTML/CSS/JavaScriptサイト。ページによって静的script読込と実行時の動的script読込が混在する。
- Node.jsは主に検証用。package.json の `npm test`、`npm run verify:static`、`npm run test:e2e` を利用する。
- 認証・Vault・VPN・端末保存・暗号化同期は横断的な依存関係。見た目だけの変更でもアクセス境界を迂回しない。
- 現時点ではビルド方式や大規模フレームワークへの移行を既定の解決策としない。

## 現行ページと責任範囲

| 入口 / 機能 | 実装の起点・主な責任 | 絶対に混同しないこと |
| --- | --- | --- |
| `index.html` | ログイン入口 | 保護データを描画する画面とは分ける |
| `home.html`、`profile.html`、`manga.html`、`video.html` | `home-profile-spa.js` がSPA対象ページの表示・遷移を制御し、`app-global-shell.js` 等が共有UIを支える | SPA対象ページだからといってReaderまで同じ画面内に埋め込まない |
| `manga.html` | 漫画本棚。 `manga-list-route.js` が依存する本棚用スクリプトを読み込み、本棚関連モジュールで画面・操作・状態を組み立てる | 本棚の管理と作品の閲覧を混ぜない |
| `reader.html?item=<itemId>` | **単一作品の独立Reader文書**。`reader-runtime.js` が表示と操作を束ね、`reader-page-source.js` がページ発見、`reader-progress-repository.js` が進捗を担当 | `item` がルート識別子。古いReader SPA／iframe設計には戻さない |
| `video.html` | 動画一覧。`video-list-route.js` が起動し、`video-library.js` 等がライブラリ処理を担当 | 動画一覧と個々の再生処理は区別する |
| `statutes.html` | 逐条集のページ入口。`statutes-*.js` が検索・定義・注記等を担当 | 漫画・動画のVaultと逐条集独立Vaultの関係を推測で統合しない |

URLやデータの実際の操作経路は、必ず入口HTMLと呼出し元から再確認すること。

## 機能別の主な編集先

| 変更対象 | 最初に確認するファイル |
| --- | --- |
| 本棚の表示・カード・並べ替え・ページング・編集 | `manga-list-route.js` → `manga-list-*.js`、`manga-item-editor.js`、`manga-spreadsheet.js` |
| 漫画登録JSON | `manga-json-import.js`、`manga-list-route.js` |
| ReaderのURL・読み込み・ページ進捗 | `reader-target.js`、`reader-page-source.js`、`reader-runtime.js`、`reader-progress-repository.js` |
| 動画一覧・情報編集 | `video-list-route.js`、`video-library.js`、関連する `video-*.js` |
| ページ遷移・プロフィール・共通ヘッダー | `home-profile-spa.js`、`app-global-shell.js`、`profile-menu.js` |
| Liquid Glass 表現 | `liquid-glass-engine.js`（共通の光学表現）、`liquid-glass.css`、対象コンポーネントのスタイル |
| アプリ内通知 | `notice-center.js` とその読込元 |
| VPNによる保護データの利用制限 | `media-access-gate.js` と各画面の権限確認 |
| Vaultのデータ項目・正規化 | `vault-payload.js` |
| 同期・競合・履歴 | `vault-session.js`、`vault-sync-merge.js`、`vault-history.js` 等 |
| 逐条集独立Vault | `statutes-vault.js`、関連する逐条集コード |
| 暗号化画像の保存・読込 | `encrypted-asset-*.js`、Readerと本棚それぞれの呼出し元 |

これは**探索の起点**であり、全関数の網羅表ではない。変更前に呼出し側・保存先・テストまで追跡する。

## データとライフサイクルの境界

- Vault-backed なローカルデータキー・正規化の正本は `vault-payload.js`。別モジュールに独立したキー一覧・書込仕様を増やさない。
- 逐条集は `statutes-vault.js` に独立した永続化の仕組みがある。両方に関連するキーがあるからといって、移行検証なしに一方を消さない。
- 本棚からReaderへの移動は**文書境界をまたぐ**。本棚は遷移前に必要な状態を確定し、Readerは保存済みのIDで対象を解決する。
- Readerは要求中ページと表示確定ページを分離し、最新要求だけを画面に反映する。Reader固有のイベント・タイマー・URL等は終了時に解放する。詳細な不変条件は `AGENTS.md` を参照。
- VPNのアクセス制御、暗号化済みバックグラウンド同期の例外、削除・tombstone・競合保護については `AGENTS.md` の安全規則を優先する。

## 歴史的資料を現行設計と取り違えない

例えば次の資料は、少なくとも**現行のReader構成そのものを示す資料ではない**。

- `docs/superpowers/specs/2026-09-15-reader-page-split-design.md`：Readerに多数の画面を統合する旧案
- `docs/superpowers/specs/2026-10-04-reader-lifecycle-redesign.md`：文書内の「Current route」は当時の旧構成。そこから独立Readerに再設計した経緯の記録
- `docs/entry-regression-baseline.md`：以前の入口構造を前提にした回帰基準

同様に `reader-entry-page.js` のような旧Reader読込方式に見えるコードが残っていても、それだけで現行のページが利用しているとはみなさない。**現在のHTMLから到達可能かを検証してから**再利用・削除を判断する。

## 今後の構造改善の順番

1. **依存関係と正本の特定**：各機能の入口→制御→状態→保存→同期→テストを確認する。
2. **現状維持テストの追加**：移行やファイル分割の前に、表示・保存・VPN・同期・Reader遷移の回帰テストを整える。
3. **重複の集約**：同じ責任を持つ複数の処理を、動作を変えずに1つへ寄せる。
4. **ライフサイクルの明確化**：画面のmount/unmount、イベント登録・破棄、同時実行の所有者を定める。
5. **旧実装の削除**：参照元と保存データ移行を検証後、使われていない経路・古い互換処理を消す。
6. **毎変更時の更新**：責任範囲が変わったらこの文書・該当テスト・AGENTS.mdを同じ変更で更新する。

原則は「**1つの機能に1つの責任主体、1つの正規データ表現、検証可能な境界**」。全面書き直しではなく、機能別の小さな改修で近づける。

## AIが変更を始める前の確認手順

1. 現在の `main` を確認し、関連HTML・読み込まれるJS・関連テストをたどる。
2. **正本となる状態・データ保存先**を特定する。似た名前の旧ファイルを根拠にしない。
3. 追加イベント・タイマー・通信がある場合、重複起動と破棄を検討する。
4. 新規の共通処理を作る前に、既存の共通処理（特にVault、VPN、Liquid Glass）を再利用できるか調べる。
5. 動作を変える場合は回帰テストを更新。検証と本番反映は `AGENTS.md` の規則に従う。
6. 本書の責任範囲とコードがずれた場合、同じ変更で修正する。
