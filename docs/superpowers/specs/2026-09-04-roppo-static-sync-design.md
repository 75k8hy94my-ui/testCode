# 六法静的条文・項メモ Design

## Goal
六法の通常閲覧で e-Gov API を直接呼ばず、GitHub リポジトリ内に保存した構造化 JSON を唯一の表示元にする。前回同期から1か月を超えた場合だけ GitHub Actions が e-Gov から再取得し、JSON と同期日時を更新する。

## Data source and refresh
- 保存先は `data/roppo/<lawId>.json` と `data/roppo/metadata.json`。
- `metadata.json.lastSyncedAt` を前回同期日時とする。
- GitHub Actions は毎日起動するが、同期スクリプトが `lastSyncedAt + 1 calendar month` 未満なら e-Gov へアクセスせず即終了する。
- 1か月を超えた場合、対象10法令を e-Gov 法令API v1から取得し、静的JSONを再生成して自動コミットする。
- 初回は metadata が存在しないため必ず生成する。
- ブラウザは e-Gov API を直接呼ばない。

## JSON model
各法令JSONは `lawId`, `lawName`, `lawNumber`, `syncedAt`, `articles` を持つ。各 article は `key`, `number`, `caption`, `paragraphs` を持ち、各 paragraph は `number`, `text` を持つ。

## Number normalization
- ArticleTitle の `第百五条` / `第百五条の二` を `第105条` / `第105条の2` にする。
- 本文中の明示的な条参照も同様に算用数字化する。
- `前二条` / `次二条` は `前2条` / `次2条` にする。
- 金額・年月日等の一般的な漢数字は変換しない。
- 「第二項」等の本文上の項参照は今回の「条文番号」変換対象外とする。UI上の項番号は `1項`, `2項` の算用数字表示にする。

## UI
- 一覧は `article.number` と、存在する場合のみ正式な `ArticleCaption` を表示する。本文先頭をプレビューとして使わない。
- ArticleCaption が無い条文は番号だけを表示し、見出しを捏造しない。
- 条文詳細は Paragraph ごとにカード分割し、項番号・本文・項メモを一体表示する。
- 1項のみの条文も内部構造は Paragraph で統一する。
- お気に入りと最近見た条文は条単位のまま維持する。

## Memo model and migration
- 新しい項メモキーは `<lawId>|<articleKey>|P_<paragraphNum>`。
- 既存の条メモ `<lawId>|<articleKey>` は初回 normalize 時に `<lawId>|<articleKey>|P_1` へ移行する。
- 項メモは既存 Vault 経路で暗号化同期される。法令本文JSON自体は公開情報なので暗号化しない。

## Verification
- Python unit tests: 漢数字変換、条参照限定変換、XML→Paragraph構造化、暦月ベースの stale 判定。
- Node tests: 旧メモ移行、項メモ分離、本文/見出し検索、静的JSON読込、本文プレビュー廃止。
- CI は Node tests、Python tests、static verification を実行する。
