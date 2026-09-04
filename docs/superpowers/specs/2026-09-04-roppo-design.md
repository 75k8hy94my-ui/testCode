# 六法機能 Design

## Goal
`testCode` の六法機能を、通常閲覧時に e-Gov API を直接呼ばない静的法令データ方式へ変更する。法令本文は GitHub リポジトリ内の JSON を参照し、前回同期から 1 か月を超えた場合だけ更新が必要であることを判定し、必要時に GitHub Actions から e-Gov と同期できるようにする。条・項を構造化し、条番号表記・正式見出し・項単位メモを改善する。

## Scope
- 対象グループ: 憲法、民法、刑法、民事訴訟法、刑事訴訟法、行政法、会社法。
- 行政法は行政手続法・行政事件訴訟法・行政不服審査法・国家賠償法を同一グループに置く。
- 法令本文は `data/roppo/<lawId>.json` として GitHub に保存し、暗号化しない。
- `data/roppo/metadata.json` に `lastSyncedAt` と法令ごとの同期情報を保存する。
- 通常の `roppo.html` はリポジトリ内 JSON のみを読む。ブラウザから e-Gov API を直接呼ばない。
- 月次 cron は使わない。`lastSyncedAt` から 1 か月を超えた場合に「更新が必要」と判定する。
- 更新は手動起動可能な GitHub Actions (`workflow_dispatch`) が e-Gov から取得・整形し、差分があれば JSON と metadata をコミットする。
- ユーザーのメモ・お気に入り・直近閲覧情報のみ既存 Vault payload に含め、既存 AES-GCM 暗号化同期経路を使う。

## UX
- `roppo.html` では法令グループ・法令を選択し、条番号・見出し・本文を検索できる。
- 条文一覧は `第105条（錯誤）` のように、条番号と e-Gov の正式な `ArticleCaption` のみを表示する。見出しがない条文では本文1行目を見出し代わりにしない。
- 条番号は `第百五条` / `第百五条の二` のような漢数字表現を `第105条` / `第105条の2` の算用数字に正規化する。
- 条文本文中の法令上の条参照（例: `第百五条`、`第百五条第二項`）も `第105条`、`第105条第2項` のように算用数字へ変換する。
- 金額、年月日、数量など、条・項・号の参照ではない一般の漢数字は変換しない。
- 複数項がある条文は、各項を視覚的に独立したブロックとして表示する。第1項を含め、各項に項番号を明示する。
- メモは項ごとに独立して入力・保存・暗号化同期できる。1項しかない条文も内部的には項単位として扱う。
- お気に入りと最近見た条文は条単位のまま維持する。
- `metadata.json` の前回同期から 1 か月を超えている場合は、画面上に「法令データ更新推奨」の状態を表示する。通常閲覧は古い JSON で継続可能とする。

## Static law data model
`data/roppo/<lawId>.json`:

```json
{
  "schemaVersion": 1,
  "lawId": "129AC0000000089",
  "lawName": "民法",
  "lawNumber": "明治二十九年法律第八十九号",
  "source": "e-Gov",
  "syncedAt": "2026-09-04T00:00:00.000Z",
  "articles": [
    {
      "key": "Article_105",
      "num": "105",
      "number": "第105条",
      "caption": "錯誤",
      "paragraphs": [
        { "num": "1", "text": "..." },
        { "num": "2", "text": "..." }
      ],
      "bodyText": "..."
    }
  ]
}
```

`data/roppo/metadata.json`:

```json
{
  "schemaVersion": 1,
  "lastSyncedAt": "2026-09-04T00:00:00.000Z",
  "laws": {
    "129AC0000000089": { "syncedAt": "2026-09-04T00:00:00.000Z", "articleCount": 0 }
  }
}
```

## User data model
`mangaReaderRoppoState` schemaVersion 2:

```js
{
  schemaVersion: 2,
  notes: {
    "<lawId>|<articleKey>|<paragraphNum>": { text: string, updatedAt: string }
  },
  favorites: ["<lawId>|<articleKey>"],
  recent: [{ lawId: string, articleKey: string, viewedAt: string }],
  preferences: { selectedGroup: string, selectedLawId: string }
}
```

Migration from schemaVersion 1 keeps existing notes by mapping `"<lawId>|<articleKey>"` to `"<lawId>|<articleKey>|1"`. Favorites, recent entries, and preferences remain unchanged. Normalization discards malformed entries, caps recent items at 50, and keeps unique favorites.

## Sync architecture
- `scripts/sync-roppo-data.mjs` owns e-Gov fetching, XML parsing, conversion to static JSON, numeral normalization, and metadata generation.
- `.github/workflows/sync-roppo.yml` exposes only `workflow_dispatch`; no cron/schedule trigger is configured.
- The workflow runs the sync script, commits `data/roppo/*.json` and `data/roppo/metadata.json` only when there is a diff, and pushes to `main`.
- `roppo-data.js` owns browser-side catalog/state/search/static-data validation and staleness helpers. It does not fetch e-Gov XML.
- `roppo.html` fetches `data/roppo/metadata.json` and the selected law JSON from the same GitHub Pages origin.
- Staleness is computed as one calendar month after `lastSyncedAt`; crossing that threshold marks data stale but never blocks reading.

## Security
- Public law text and sync metadata are public repository data and require no encryption.
- `roppo.html` remains authenticated and requires an unlocked Vault, matching existing protected pages.
- Notes/favorites/recent remain localStorage until incorporated by `MangaVaultPayload.buildFromLocalStorage()`; Supabase receives only the encrypted Vault payload.
- GitHub Actions uses the repository `GITHUB_TOKEN` with `contents: write`; no separate e-Gov secret is required.

## Backup and logout
- `backup-format.js` continues to include normalized `roppoState` in backup data.
- `vault-payload.js` continues to include the normalized state in encrypted sync and device clearing.
- Existing logout clearing removes the 六法 user state automatically.

## Verification
- Unit tests cover Japanese legal-reference numeral normalization, static law JSON shape, metadata staleness, state schema migration, paragraph-note keys, search, Vault round-trip, backup round-trip, and page wiring.
- Sync-script tests cover ArticleCaption handling, paragraph separation, and output formatting.
- A static check verifies `roppo.html`, `roppo-data.js`, `data/roppo/metadata.json`, sync script, and workflow references.
- CI must pass `npm test` and `npm run verify:static` before merge.
