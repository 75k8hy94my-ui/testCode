# 判例百選 Drive 連携 Design

## Goal

判例百選の収録一覧を testCode 上で表示し、Google Drive 上に対応する1判例1PDFが存在するかをファイル名完全一致で確認する。さらに同じ百選マスタを既存の索引検索へ接続し、索引中の判例が百選収録判例と厳格に一致するときだけ `民法Ⅱ14` のような百選掲載情報を検索結果へ表示する。

## Scope

- 新しい保護ページ `hyakusen.html` を追加する。
- 百選の収録情報はアプリ内の静的マスタとして保持する。
- 現時点ではユーザーから正式な収録一覧がまだ提示されていないため、実データを推測して登録しない。マスタ構造・UI・Drive照合・索引連携を先に実装し、後からデータだけ追加できるようにする。
- Google Drive のPDF本文は取得・保存・解析しない。ファイル名、ID、ブラウザ閲覧リンク等のメタデータのみ利用する。
- SupabaseにはDriveトークン、Driveファイル名、DriveファイルID、PDF内容を保存しない。

## Hyakusen master model

百選の掲載位置と判例自体の識別を分離する。

各掲載レコードは最低限次を持つ。

```js
{
  collectionId: 'minpo-2',
  collectionLabel: '民法判例百選Ⅱ',
  shortLabel: '民法Ⅱ',
  edition: 9,
  latestEdition: 9,
  number: 14,
  driveFileName: '民法Ⅱ14.pdf',
  case: {
    court: '最高裁',
    date: '平成X年X月X日',
    reporter: '民集',
    volume: 'X',
    issue: 'X',
    reportPage: 'X'
  }
}
```

`driveFileName` は各掲載レコードで明示可能にする。最新版では通常 `shortLabel + number + '.pdf'` だが、旧版固有ファイルなど命名が異なる場合もデータで表現する。

## Edition rules

- 特記がなければ「百選」は最新版を意味する。
- 同一判例が複数版に収録される場合、検索結果では最新版の掲載位置を優先する。
- 最新版に存在せず旧版だけにある判例は、利用可能な最も新しい旧版を主表示する。
- 最新版表示は `民法Ⅱ14` のように版を省略する。
- 旧版のみの主表示は `民法Ⅱ8版37` のように版を明示する。
- 内部APIは同一判例に紐づく全掲載レコードを保持できるようにする。

## Strict case matching

百選タグ付与は判決年月日だけで行わない。

既存索引検索の case identity と同じ構造を使い、次の6要素が揃った場合のみ百選マスタと照合する。

1. 裁判所
2. 判決年月日
3. 判例集名
4. 巻
5. 号
6. 判例集頁

これらを既存の `caseIdentityKey()` と同等の正規化規則で比較する。年月日が同じでも判例集、巻、号、頁のいずれかが異なる場合は一致させない。百選マスタ側は構造化された6要素を必須とし、`citationText` だけの曖昧な fallback では百選タグを付けない。

## Index search integration

既存の検索エンジンは変更後も同じ `buildIndex()` / `search()` APIを維持する。

判例検索結果について厳格一致する百選掲載がある場合、検索結果の `display` 末尾へ百選ラベルを付与する。既存 `index-search-page.js` は `result.display` をそのまま表示するため、ページ本体の大規模改修を避ける。

例:

```text
最判平成○年○月○日 民集○巻○号○頁　［民法Ⅱ14］
```

検索・同期・暗号化・Worker fallback の既存挙動は維持する。

## Drive authorization

静的GitHub Pagesであるため、Google Identity Services の OAuth 2.0 token model を使う。

- OAuth client type: Web application
- Scope: `https://www.googleapis.com/auth/drive.metadata.readonly`
- Client secretはブラウザ・GitHub・Supabaseへ置かない。
- OAuth Client ID は公開情報なので、ユーザーが `hyakusen.html` で設定できるようにし端末localStorageへ保存する。
- Access token はページメモリだけに保持し、localStorage、IndexedDB、Vault、Supabaseへ保存しない。
- Token期限切れ時はユーザー操作で再認可する。

Google Cloud側ではDrive API有効化と、OAuth Web clientのAuthorized JavaScript originとして本番originを登録する必要がある。

## Drive matching

選択中の百選コレクションについて、そのコレクションで期待される `driveFileName` 群だけを対象にする。

Drive APIからPDFメタデータを取得し、最終判定は次の完全一致のみとする。

```js
file.mimeType === 'application/pdf' && file.name === entry.driveFileName
```

空白差、拡張子差、接尾辞、類似名を許容しない。ゴミ箱内ファイルは除外する。

保存済みの場合は通常表示し、クリックで `webViewLink` を新しいタブで開く。未保存の場合は薄暗く表示し、クリック不可にする。

## Protected page behavior

`hyakusen.html` は `index-search.html` と同じく以下を要求する。

- testCodeログイン済み
- Vaultアンロック済み

未ログインなら `index.html`、Vault未解除なら `sync.html` へ遷移する。

## UI

`hyakusen.html`:

- 百選コレクション選択
- 版選択（初期値は最新版）
- Google OAuth Client ID設定
- `Google Driveに接続` ボタン
- Drive接続状態
- 判例番号順一覧
- Drive確認済みPDF: 通常表示、クリック可能
- Drive未確認PDF: opacityを落として非活性
- 百選実データがまだない場合は、推測データを出さず「百選データ未登録」を表示
- `索引検索へ戻る` リンク

既存索引検索ページには、`legal-index-search.js` がブラウザ実行時に小さな `判例百選` 導線を追加する。これにより既存HTMLの大規模置換を避ける。

## Security constraints

- Drive PDF本文を取得しない。
- Drive access tokenを永続化しない。
- Google client secretを要求・保存しない。
- OAuth scopeを `drive.metadata.readonly` より広げない。
- 百選マスタは法的資料の公開的な書誌対応データとして静的コードに置くが、Drive上の所持状況は永続同期しない。
- 既存の索引データ暗号化・Supabase同期方式を変更しない。

## Testing

- 百選ラベルの最新版優先・旧版fallback
- 同一判決日でも判例集情報が違う場合は不一致
- 判例集6要素完全一致の場合のみタグ付与
- Driveファイル名は完全一致のみ保存済み判定
- PDF以外、ゴミ箱、類似名は除外
- OAuth tokenが永続保存されない構造
- `hyakusen.html` がauth/Vault guardと必要スクリプトを持つ
- 既存 legal-index tests / static verification をすべて通す
