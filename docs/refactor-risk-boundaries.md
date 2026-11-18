# Vault・ルート・プロフィールの再構成判断（2026-11-18）

## 現行実装で確認した責任境界

| 責任 | 実装の探索先 | 変更前に確認すること |
| --- | --- | --- |
| セッション/パスキーの取得・更新・ロック | `vault-session.js` 冒頭〜セッション/資格情報関数、`profile-menu.js` | ロック時の平文・鍵破棄、保存済み認証手段 |
| 暗号化・復号・ローカル保留 | `vault-session.js` と `vault-payload.js` | 鍵/暗号形式、pending marker、ローカル変更を失わないこと |
| 通信・同期ロックとCAS | `vault-session.js` の `withVaultSaveLock` / `persistPayloadWithProtocol` | 最後に成功した暗号化baseline・3-way merge・再取得 |
| 削除同期とtombstone | `vault-session.js` の `recordSyncDeletion` / `prepareJournaledPayload`、`vault-sync-merge.js` | 削除の復活防止、 journal 確認・ack |
| 逐条集の暗号化 | `statutes-vault.js` | 他Vaultに統合しない。独立キーとオフライン動作 |
| 本棚の表示と保存 | `manga-list-route.js`、`manga-list-host-runtime.js`、`vault-payload.js` | route / DOM / state / queue / sync の境界 |
| ホーム・動画・漫画の画面切替 | `home-profile-spa.js` | start/detachの世代管理、VPNゲート、未同期の保護 |
| プロフィールのセキュリティ操作 | `home-profile-spa.js`、`profile-menu.js`、Vault API | 資格情報の一時保持とUIエラー後始末 |

## 今回分割しなかった理由

`vault-session.js` には暗号化、ローカル保留、履歴、CAS、競合マージ、パスキーが同居している。ただし非同期保存・鍵・pending世代が同じ閉包状態と結びつき、保存形式やsecurity boundaryを誤って分割する危険が大きい。今回のUIの分割と異なり、まず再起動・複数タブ・オフライン・CAS再試行を含めたテストで切り出し境界を保証する必要がある。

`manga-list-route.js` はロードと暗号化画像の片付けqueueを内包するが、すでに多数の `manga-list-*.js` が分担している。複数箇所への重複状態を増やさず、片付けqueueの保存契約・VPN制御を確認してから移管する。

`home-profile-spa.js` はプロフィール操作と画面切替の結合が強い。パスキー・アバターなどを抽出する場合、UIの個別イベントとアクセス制御を先にテスト化し、既存の `profile-menu.js` との重複を調査する。単に関数を別ファイルへ移すだけでは改善にならない。

優先的に行った分割は、保存機構と無関係な `video-library-view.js` / `video-library.css`、`statutes-page.css` / `statutes-page-interactions.js` である。
