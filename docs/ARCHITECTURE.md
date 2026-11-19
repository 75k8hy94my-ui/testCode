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
| 漫画登録JSON（連番画像・個別ページURL配列） | `manga-json-import.js`、`manga-list-route.js`。個別URL配列は `pages` と `pageManifest` に保存し、Readerでは `reader-page-source.js` がその順序を尊重する |
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

旧Reader埋め込みコード `reader-entry-page.js` は、現行HTML・JavaScript内に参照元がなく、`readerEntryMount` / `ReaderShell.setScreen` もそのファイル内にしか存在しないことを確認して削除した。

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

## 動的依存と初期化の責任主体（2026-11-17 コード照合）

- 共通ページ：`home-profile-spa.js` がホーム・プロフィール・漫画・動画のルートを切り替え、`app-global-shell.js` が `notice-center.js` を読み込む。
- 漫画本棚：`manga.html` → `home-profile-spa.js` → `manga-list-route.js` → `manga-list-entry.js`、`manga-list-host-runtime.js` 等。`SCRIPT_URLS` に並んだ旧来型scriptの実行順序を推測で変更しない。
- 動画一覧：`video.html` → `home-profile-spa.js` → `video-list-route.js` → `video-data.js`、`video-library-pagination.js`、`video-library.js` 等。VPN許可後にのみ一部の動画補助処理をロードする。
- 動画UI：`video-list-route.js` が唯一の起動主体。同期的な `video-library.js.init()` の完了を直接確認し、タイマーによる初期化レースを設けない。`detach()` は未完了の起動を無効化する。
- Reader：`reader.html?item=...` が静的に `reader-target.js`、`reader-page-source.js`、`reader-progress-repository.js`、`reader-runtime.js` をロードする。本棚の動的ローダーやSPAとは独立する。

## データ・セキュリティの正本

| データ・境界 | 最初に確認する責任主体 |
| --- | --- |
| 本棚の作品・フォルダ・作者、Vault対象キー | `manga-list-host-runtime.js` / `manga-list-route.js`、`vault-payload.js` |
| Reader表示確定済み進捗（`mangaReaderLastPage`） | `reader-progress-repository.js` |
| 動画・メタデータ・カスタムプロパティ | `video-data.js`、`video-library.js`、`vault-payload.js` |
| 暗号化・ローカル保留・CAS・tombstone | `vault-session.js`、`vault-sync-merge.js`、`vault-payload.js` |
| 逐条集独立暗号化 | `statutes-vault.js` |
| ユーザー向け保護データへのVPN権限 | `media-access-gate.js` |

## 構造検証と限界

`scripts/check-architecture.mjs` は、現行の動的ローダー5ファイルで**文字列から確定できる**JS/CSS参照先の存在、およびReader・本棚のscript境界を検査する。`npm run verify:static` に組み込む。

これは全依存関係解析ではなく、動的に計算したURL、グローバル関数参照、イベント経由の依存、実際の循環依存、ユーザーデータの移行可能性までは保証しない。動的ローダーを新設する際は `DYNAMIC_OWNERS` の更新と実際の呼出し経路の確認が必要。

### 基準テストの修復

2026-11-17の変更前 `main` ではNodeテスト1828件中7件が失敗。4件は古いDOM属性・漫画表紙開始ページ・キャッシュキー構造・SPA履歴形式を固定していたため、現行の振る舞いを守るテストへ更新した。残る3件はReaderが描画前に終了すると `win.clearTimeout` で例外が発生する問題で、未マウント時もタイマー後始末が安全に動くようにした。Vaultデータ形式は変更していない。


## 第2次整理：動画ライブラリの責任境界（2026-11-18）

- `video-list-route.js`：唯一の初期化責任主体。VPNゲート、非同期スクリプトと `video-library.css` の先行ロード、画面のmount/detachを管理する。`video-library-view.js` を `video-library.js` より先に評価する。
- `video-library-view.js`：動画一覧・編集シートの静的DOM構築と要素参照の設定のみを担当する。`setupMarkup(documentRef, dom)` は副作用をDOMに限定し、Vault・保存データ・セッション・VPN判断を持たない。独立した自動起動も行わない。
- `video-library.css`：動画UI・ページャー・レスポンシブとテーマ別スタイルの正規定義。以前のJS内注入styleを移したもの。Liquid Glass光学エンジンを複製しない。
- `video-library.js`：動画一覧の状態、編集・保存・同期、描画イベントとアクセス制御を担当。DOM生成は `MangaReaderVideoLibraryView.setupMarkup(document, dom)` を呼び、同じ `dom` を共有する。`init()` の起動主体は従来どおりルートのみ。

### 動的依存関係の注意

ルートの依存順序は `video-data.js` などの共通データ・表示補助→`video-library-view.js`→`video-library.js`。スタイルシートはルートが読み込み完了を待つ。外部ページの `reader.html` にUIモジュールを読み込ませない。保存キー・Vaultデータ表現は今回変更しない。

### 現行 main に存在した回帰テストの更新

作業開始時点の main（bdbb8ceb）で Node テスト1847件中18件が失敗していた。動画編集フォームに追加された埋め込み項目が単体テストの仮想DOMに存在せず14件が同じTypeErrorとなる問題と、埋め込み再生や一括登録時の正規共有処理へ移動したコードを古い文字列配置で検査していたテストを検出。フォーム項目と実装の正規経路をテストで保護する。動画データ形式や保存処理自体には変更を加えない。

## 逐条集ページの表示責任の分離（第2次整理）

- `statutes.html`：ページ入口・認証/アクセスゲート・コンテンツのHTML、外部モジュールの読み込み順序を維持する。
- `statutes-page.css`：従来の単一インラインstyleをそのまま移した逐条集専用レイアウト・レスポンシブCSS。共通Liquid Glassは既存 `liquid-glass.css` / `liquid-glass-engine.js` が担当する。
- `statutes-page-interactions.js`：旧HTML末尾の連続4個のIIFEを順序を変えず移した、コンテキストメニュー抑制、スマホペイン比率、モバイルナビの配置、上部ヘッダー計測。永続データの書込みは表示比率 `statutes:phone-pane-ratio` のみ。
- `statutes-vault.js`：独立暗号化の正規所有者。今回の移動はそのAPI、保存内容・読込順を変更しない。

これらは永続化処理とは別の表示責任であり、HTMLのスタイルやUI操作を修正する場合は上記2つを優先して確認する。

## 実装から更新できる全ファイル依存関係インベントリ

最新のリポジトリで `npm run architecture:report` を実行すると、HTMLのscript/style参照、JSに埋め込まれた固定文字列の動的ロード、ES/CJSのimport、グローバルAPIの定義候補を自動的に表示する。`npm run architecture:report -- --json` はファイル別にイベントの発行/購読、storage識別子、明示的importの循環候補も出す。静的な生成レポートを古い状態のまま正本として残さない方式とする。

**限界：** グローバルAPI名やイベント、storageキーは文字列からの抽出であり、実際の呼出し・存続期間や保存責任を証明しない。循環解析も明示的なES/CJS依存のみであり、classic scriptや動的URLを介した依存を含まない。疑わしい関係は実行経路と回帰テストで確認する。重要な3つの公開singleton（動画ルート、動画ライブラリ、動画ビュー）は `verify:architecture` で明示的な定義重複を防ぐ。

## 高リスク領域の現在の判断資料

- [Readerの外部ハッシュ形式](reader-hash-embedding.md)：同一オリジン/クロスオリジン制約、矢印キー・ハッシュ補正の所有者、有限タイマーと終了処理。
- [Vault・本棚・プロフィールの再構成判断](refactor-risk-boundaries.md)：保存・暗号・CAS・tombstoneの責任と、今回機械的な分割を見送った理由。


## 動画一覧の表示責任を追加分離（2026-11-18）

前回の `video-library-view.js`（一覧と編集シートのDOM構築）を拡張し、同ファイルの `createCardRenderer(deps)` が**カード1件・シリーズグループの表示を唯一管理**する。新たなグローバル公開名や追加スクリプトは設けない。`video-card.js` は共通のカード本体・サムネイル表示の正規実装を引き続き担当する。

- **表示モデル**：`video-library-view.js` は、カスタムラベル・フォルダ名・再生済み情報・お気に入りメニュー・仮想編集済み動画のサムネイル情報を組み立て、`MangaReaderVideoCard.create` を呼ぶ。独立してlocalStorageやVaultにアクセスしない。
- **変更可能な状態の唯一の所有者**：`video-library.js` が `state` を保有し、Viewが発生させた `openVideo`、`toggleFavorite`、`removeSeries`、`selectVideo`、`selectSeries`、`toggleSeries` の各イベントを**注入コールバック**として受け取る。View自体が保存・同期・シリーズ選択状態を変更しない。
- **絞り込みの単一経路**：`video-library.js` の `filterVisibleVideos(scoped)` に「通常表示」「動画再生直前の戻りコンテキスト」「再生後に対象ページを復元する処理」を統合した。カスタムプロパティを含め、同一の条件を利用する。
- **初期化・終了の責任**：`video-list-route.js` が唯一 `MangaReaderVideoLibrary.init` を呼び、Viewのカード描画はその後にのみ実行。新しいDOMイベントは生成したカード要素内に限定し、グローバルイベント・タイマーを追加しない。保存データ形式、VPN許可判定、Vaultのpending/CAS/tombstone、プレーヤーのURL・進捗処理は従来どおり。

### 変更先の特定

カードの見た目・シリーズの折りたたみUI・カード表示項目は `video-library-view.js`。共通カードメニューとサムネイルは `video-card.js` / `video-thumbnail-renderer.js`。一覧状態・フィルター・戻りコンテキスト・保存同期・既存編集シートのイベントは `video-library.js`。専用編集ページは `video-edit-page.js`。画面起動と読み込み順序は `video-list-route.js`。

`video-data.js` は `findDuplicateVideoUrls` と `planVideoUrlConsolidation` で重複URLの候補と統合後の動画・メタデータ・マーカー・カスタム値を計算する。正規の保存キー、VPN確認、削除ジャーナル、ゲスト書込み、失敗時の復元は `video-library.js` が管理する。`video-library-pagination.js` の `resolveVideoReturn` はシリーズを1枠として対象IDのページを決める。`video-library.js` がフィルターとソートを適用し、戻り先の表示と状態更新を担当する。

### SPA切替時のイベント後始末

`video-library.js` はルート再訪時に同じDOMとイベント結線を使い、ページ全体のイベントを1回登録する。画面離脱と同一ルートの再マウントでは `video-list-route.js.detach()` が起動を無効化し、通知を受けた一覧がページ切替アニメーションを取り消す。同一ルートの再マウントは現在の検索やページを引き継ぐ。`render()` は `isListMounted()` で切断済みの一覧への描画を防ぐ。既に発行済みのデータ移行や暗号化Vaultの未同期キュー処理は完了・再試行できる。

## 動画関連ファイルの詳細マップ

[docs/VIDEO-ARCHITECTURE.md](VIDEO-ARCHITECTURE.md) に動画一覧・編集/再生・短尺再生・仮想編集・サムネイル・メタデータ・Vault/VPN境界の**現行実装の責任一覧**と主要なHTMLスクリプトロード関係をまとめた。今後の動画改修は必ずこのマップと実際のエントリコード・対象テストを照合する。

静的ホスティングではロードするスクリプトのバージョン付きURLを変更時に更新する。今回のカード所有者の再構成は動画ルートのView/library URLと、そのルートを読むSPA、および4つのSPA入口HTMLを同時に更新して、旧キャッシュとのバージョン混在を抑制した。

動画永続化では `vault-payload.js` のキー定義を使い、URL統合は同じスナップショットから対象IDと保存内容を計算する。Vaultの暗号化ジャーナルを公開する直前にアクセス権・元データ・既存削除意図を再照合し、競合時は最新状態から計画を作り直す。専用編集、プレーヤー、一覧の対象限定メタデータ更新とカスタムプロパティストアは、同一オリジンの短い保存ロックを共有する。経路別の責任と適用範囲は [動画アーキテクチャ](VIDEO-ARCHITECTURE.md#persistence-and-concurrent-writers) を参照。
