# manga.html / video.html 構造変更前の回帰基準

第2段階では本番コードを変更せず、静的回帰テストと手動確認項目を追加する。

## 自動テスト可能

- `tests/entry-baseline-static.test.mjs`
  - manga/videoの静的script一覧
  - manga/videoルート認識
  - `renderReader()`呼出し
  - `reader.html?v=20260916-reader`取得先
  - manga/videoの最終タブ選択
  - 反対側UIの削除対象
  - 初期化失敗時のエラー表示
  - 認証分岐
  - Vault保存境界
  - revision/CAS識別子の存在
  - 既存localStorageキー
  - VPNガードの対象要素と状態遷移
  - 動画ライブラリの二つの読み込み経路と初期化構造
  - 主要イベント登録

- 既存の `media-access-gate.test.mjs`
  - VPN判定、手動指定、遮断・復元、診断情報

- 既存の `vault-payload.test.mjs`
  - Vaultペイロード、既存キー、VPN手動指定キー、保存失敗時のロールバック

- 既存の `reader-entry-routing.test.mjs`、`reader-vault-handoff.test.mjs`
  - readerの画面ルートとVault引き渡し

## 静的検証可能だが、実行回数そのものは未確認

以下はソース上の呼出し・登録箇所は固定するが、実ブラウザでの実行回数とは区別する。

| 項目 | 現状の静的確認 |
| --- | --- |
| `reader.html` fetch | `home-profile-spa.js`に1箇所 |
| `refreshSession()` | `home-profile-spa.js`の`start()`から1箇所。実際のページ表示回数は未確認 |
| `MangaVault.savePayload()` | `home-profile-spa.js`、`video-library.js`、`reader.html`に存在。実操作ごとの回数は未確認 |
| `checkVpn()` | `media-access-gate.js`内に初期確認と公開関数呼出しが存在。ページ別実行回数は未確認 |
| `video-library.js`評価回数 | 読み込み経路は2系統。ブラウザ上のscript評価回数は未確認 |
| `video-library.js`初期化回数 | `init()`とDOMContentLoaded登録を確認。実行回数は未確認 |
| `scheduleVaultSync()` | 動画ライブラリと動画機能に存在。操作ごとの回数は未確認 |
| `pagehide` / `visibilitychange`保存 | 動画再生側の既存テストで静的確認。入口ページ全体の実行回数は未確認 |

## 手動確認が必要

### 動画バックアップ復元

動画バックアップ復元フックは、`reader.html`直接表示時の既存バックアップ復元経路に限定される。`manga.html`と`video.html`では動画ライブラリ本体を初期化しないため、既存バックアップ画面への導線は`reader.html#screen=backup`を使用する。

1. `reader.html#screen=backup`または既存のバックアップ画面を開く。
2. 動画フォルダ・動画メタデータを含むバックアップを復元する。
3. 復元確認を承認する。
4. 期待結果：動画フォルダと動画メタデータが復元される。
5. 復元確認をキャンセルする。
6. 期待結果：動画フォルダと動画メタデータが反映されない。
7. `video.html`を開き、復元した動画データを確認する。
8. ページを再読み込みする。
9. 期待結果：復元データが残る。
10. Vault保存を失敗させる。
11. 期待結果：既存のローカルデータを失わず、中途半端なsidecar状態にならない。

失敗判定：`manga.html`や`video.html`でバックアップ復元UIが新たに表示される、確認キャンセルでsidecarが保存される、復元後のフォルダまたはメタデータが欠落する、Vault保存失敗で片方だけ反映される。

自動テスト環境だけでは、実ブラウザ・実Supabase・実ネットワークを伴う次の項目を完全には保証できない。

### 認証・Vault

1. 未ログイン状態で`manga.html`を開く。
2. 期待結果：`index.html`へ遷移する。
3. ログイン済み・Vault未解除状態で`manga.html`を開く。
4. 期待結果：`sync.html`へ遷移する。
5. Vault解除済み状態で`manga.html`と`video.html`を開く。
6. 期待結果：対象一覧が表示され、Vaultの復元データが見える。
7. `refreshSession()`失敗を発生させる。
8. 期待結果：セッションを消去して`index.html`へ遷移する。

失敗判定：白紙、無限待機、誤ったページへの遷移、Vaultデータ欠落、認証情報の不意な消去。

### 同期・CAS

1. 漫画または動画を追加・編集・削除する。
2. 期待結果：既存localStorageキーが更新され、既存Vault保存経路が呼ばれる。
3. 2つの認証済みブラウザで同じVaultを開き、両方で変更して保存する。
4. 期待結果：一方だけ成功し、もう一方はrevision競合となり、ローカル変更が保持される。
5. ネットワーク失敗中に保存する。
6. 期待結果：端末データは失われず、失敗が画面に表示される。

失敗判定：CASを迂回する、古いデータで上書きする、保存失敗を無言で無視する、localStorageの変更が戻る。

### VPN

1. VPN未接続で`manga.html`または`video.html`を開く。
2. 期待結果：外部画像・動画・iframeが読み込まれず、VPN未接続表示になる。
3. VPN接続後に再確認する。
4. 期待結果：判定成功後、遮断された要素が復元される。
5. 判定APIを失敗させる。
6. 期待結果：誤って許可されず、診断情報と再確認導線が表示される。
7. VPN診断ボタン、手動VPN指定、手動非VPN指定を操作する。
8. 期待結果：既存キー`testCode.manualVpnIps`と`testCode.manualNonVpnIps`が維持される。

失敗判定：判定前に外部通信する、判定失敗で許可する、診断ボタンが消える、手動指定が別キーに保存される。

### URL・履歴

次のURLを直接開き、戻る・進むを確認する。

- `manga.html`
- `video.html`
- `reader.html`
- `video-player.html?id=...`
- `index.html`
- `sync.html`

失敗判定：既存リンク切れ、クエリ消失、戻る・進むで誤った画面、readerから一覧へ戻れない。

## 初回描画完了の現状判定

現状は、次のDOM・状態が目安になる。

- manga：`#savedListOverlay`、`#mangaListSection`、`#listTabManga`
- video：`#videoLibraryApp`、`#videoListSection`、`#listTabVideo`
- 認証完了：`html.auth-pending`が除去される

ただし、これらは現行実装のDOMに依存した基準であり、構造変更後は新しい基準を別途定義する。

## 第4.1段階：漫画一覧DOM境界の手動確認

自動テストではDOM参照の静的契約を確認する。次の項目は実ブラウザで確認する。

1. `manga.html`を直接開く。
2. 期待結果：漫画一覧が従来どおり表示される。
3. 検索語を入力する。
4. 期待結果：一覧結果が更新される。
5. フォルダを開いて戻る。
6. 期待結果：フォルダ内表示と一覧への復帰が従来どおり動作する。
7. 並べ替えとページングを操作する。
8. 期待結果：並べ替えとページ移動が反映される。
9. 漫画カードを開く。
10. 期待結果：既存のreader.htmlへの遷移が維持される。
11. 漫画を追加、編集、削除する。
12. 期待結果：各操作が完了し、再読み込み後も変更が残る。
13. VPN未接続状態と接続状態で外部カバー画像を確認する。
14. 期待結果：未接続時は遮断され、接続後は既存のガード経路で復元される。
15. `video.html`を開く。
16. 期待結果：動画一覧の表示と動画初期化責任者が変わっていない。
17. `reader.html`を直接開く。
18. 期待結果：reader直接表示と既存の動画初期化経路が維持される。

失敗判定：漫画一覧が白紙になる、検索・フォルダ・並べ替え・ページングが機能しない、カード遷移や編集結果が変わる、VPN判定前に外部画像が許可される、`video.html`または`reader.html`の動画表示が変わる。
