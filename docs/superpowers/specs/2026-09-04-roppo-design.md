# 六法機能 Design

## Goal
`testCode` に、主要法令を閲覧・検索し、条文ごとに暗号化同期されるメモとお気に入りを保存できる「六法」機能を追加する。

## Scope
- 対象グループ: 憲法、民法、刑法、民事訴訟法、刑事訴訟法、行政法、会社法。
- 行政法は単一法典ではないため、行政手続法・行政事件訴訟法・行政不服審査法・国家賠償法を同一グループに置く。
- 条文本体は e-Gov 法令 API から取得し、ユーザー固有データとしては保存・同期しない。
- 条文メモとお気に入り、直近閲覧情報だけを既存 Vault payload に追加し、既存の AES-GCM 暗号化同期経路をそのまま使う。
- 法令API取得に失敗した場合は、e-Gov の当該法令ページへ移動できる導線を表示する。

## UX
- `roppo.html` を新設する。
- 左/上部で法令グループ・法令を選択し、検索欄で条番号・条文文字列を絞り込む。
- 条文カードには見出し、本文、お気に入りボタン、メモ欄を表示する。
- メモは入力後の短いデバウンスで端末保存し、Vault に同期する。
- 条文間移動は一覧の前後ボタンと検索結果クリックで行う。
- Home に「六法」カードをデフォルト追加し、主要ページナビゲーションにも「六法」を追加する。

## Data model
`mangaReaderRoppoState`:

```js
{
  schemaVersion: 1,
  notes: {
    "<lawId>|<articleKey>": { text: string, updatedAt: string }
  },
  favorites: ["<lawId>|<articleKey>"],
  recent: [{ lawId: string, articleKey: string, viewedAt: string }],
  preferences: { selectedGroup: string, selectedLawId: string }
}
```

Normalization must discard malformed entries, cap recent items at 50, and keep unique favorites. No law text is included in this state.

## Law catalog
- 日本国憲法: `321CONSTITUTION`
- 民法: `129AC0000000089`
- 刑法: `140AC0000000045`
- 民事訴訟法: `408AC0000000109`
- 刑事訴訟法: `323AC0000000131`
- 行政手続法: `405AC0000000088`
- 行政事件訴訟法: `337AC0000000139`
- 行政不服審査法: `426AC0000000068`
- 国家賠償法: `322AC0000000125`
- 会社法: `417AC0000000086`

## e-Gov adapter
`roppo-data.js` owns the catalog, XML parsing, search normalization, and state helpers. The page calls e-Gov Version 1 `lawdata/{lawId}` because that endpoint is stable and returns the complete current XML. XML is parsed with `DOMParser`; each `Article` becomes an in-memory article record. The adapter exposes pure helpers usable from Node tests.

## Security
- `roppo.html` is authenticated and requires an unlocked Vault, matching `index-search.html` / `hyakusen.html`.
- Notes/favorites/recent are localStorage only until incorporated by `MangaVaultPayload.buildFromLocalStorage()`; Supabase only receives the encrypted Vault payload.
- No provider secret, access token, or plaintext user note is written outside the existing encrypted Vault path.

## Backup and logout
- `backup-format.js` includes normalized `roppoState` in backup data.
- `vault-payload.js` includes the same state in encrypted sync and device clearing.
- Existing logout clearing therefore removes the 六法 state automatically.

## Verification
- Unit tests cover catalog, state normalization, search, home card, Vault round-trip, backup round-trip, and static page wiring.
- `scripts/check-static.mjs` includes `roppo.html` and `roppo-data.js`.
- CI must pass `npm test` and `npm run verify:static` before merge.
