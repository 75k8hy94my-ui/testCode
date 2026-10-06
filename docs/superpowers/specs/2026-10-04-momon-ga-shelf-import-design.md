# momon:GA 作品情報の一括取り込み 設計

## 目的

momon:GA の作品ページから作品メタデータとページ画像URL一覧を取得し、利用者が内容を確認したうえで、testCode の漫画本棚へ複数作品を一括登録できるようにする。

対象ソースは、別途提供された作品ページHTMLで構造を確認した `momon-ga.com` の作品ページとする。

今回の機能では、拡張機能は作品ページから情報を抽出して一時キューへ保持するところまでを担当し、testCode の本棚データへの登録・永続化・クラウド同期は testCode 側が既存の仕組みを利用して行う。

---

## 現状と制約

- testCode は静的HTML/CSS/JavaScriptで構成され、本番用のビルド工程や本番依存パッケージを持たない。
- 漫画本棚は `manga.html` が所有し、Readerは `reader.html?item=<itemId>` で独立して起動する。
- Readerにおける作品の識別子はURLではなく `item.id` である。
- 漫画本棚の作品レコードは `mangaReaderSavedItems` に保存される。
- クラウド同期は、本棚側の既存host runtimeおよびVault同期経路を使用する。
- Readerは現在、作品レコードに明示されたページ一覧を優先して使用する。
  - `pageManifest.pages`
  - `pages`
  - 上記が存在しない場合のみ、従来の連番URL探索を行う。
- したがって、新規に登録するmomon:GA作品については、連番探索に依存せず、作品ページから取得できる全ページURLを明示的に保存する。
- 本棚テンプレートには `一括読み込み` ボタン `#bulkDetectBtn` が既に存在するが、現状では対応するイベント処理が実装されていない。
- `個別追加` は既存の暗号化画像インポート機能に使用されているため、今回のURL取り込み機能とは別経路とする。
- 既存の暗号化画像インポートは、ローカル画像を処理・暗号化・アップロードする機能であり、今回の外部URL作品登録とは責務が異なる。
- 対象サイト構造の確認根拠は、次節に記載する別途提供されたmomon作品ページHTMLである。

## 対象サイト構造の確認根拠

本設計とは別に提供されたmomon作品ページのHTMLを確認した結果、`#post-tag` 内の `.post-tag-table` に「パロディ」「サークル」「作者」「内容」の区分が存在し、作品本文には `https://z*.momon-ga.me/galleries/<id>/<page>.webp` 形式のページ画像が並ぶことを確認している。

本設計書そのものは作品ページHTMLではなく、この確認結果とtestCodeの現行ソースを前提として、一括取り込み機能の構成・データモデル・責務境界を定めるものである。

サイト構造に依存する抽出仕様については、上記の確認済みHTMLをfixtureとしてテストし、実装時に推測でDOM構造を補わない。

---

## 基本方針

Manifest V3 の Chrome / Edge 拡張機能と、testCode本体の一括取り込み機能を組み合わせる。

処理の流れは以下とする。

1. 利用者がmomon:GAの作品ページを開く。
2. 拡張機能がそのページのDOMから作品情報と全ページ画像URLを抽出する。
3. 抽出結果を拡張機能内の一時キューへ追加する。
4. 複数の作品ページについて同じ操作を行える。
5. 利用者がtestCodeの `manga.html` を開く。
6. `一括読み込み` ボタンから、拡張機能のキューをtestCodeへ取り込む。
7. testCodeは受信した候補を検証し、登録前確認画面へ表示する。
8. 利用者は作品ごとの内容を確認・必要に応じて修正する。
9. testCode側で全候補を再検証し、重複判定を行う。
10. 登録対象となった作品についてtestCode側で正式な作品レコードを生成する。
11. `savedItems` を一度だけ更新し、既存の本棚永続化処理を使用する。
12. 本棚を再描画する。
13. クラウド同期は既存のhost runtimeの同期処理へ委譲する。

拡張機能自身がtestCodeの本棚データを書き換えてはならない。

---

## 責務の分離

### 拡張機能の責務

拡張機能は以下のみを担当する。

- momon:GA作品ページの判定
- DOMからの作品情報抽出
- 全ページ画像URLの抽出
- 抽出内容の最低限の形式確認
- 一時キューへの保存
- キューの一覧表示
- キューからの削除
- testCodeから明示的に要求された場合のキュー内容の受け渡し

拡張機能は以下を行わない。

- testCodeの `localStorage` への直接アクセス
- `mangaReaderSavedItems` の直接変更
- Vaultへのアクセス
- Vaultキーへのアクセス
- Supabase認証情報へのアクセス
- testCodeのログインセッションへのアクセス
- testCodeのクラウド同期処理の実行
- 画像本体のダウンロード・再アップロード
- Readerの作品レコード形式を直接確定すること

### testCodeの責務

testCode側は以下を担当する。

- 拡張機能から候補データを受信する
- 受信データを信用せず再検証する
- 登録前確認UIを表示する
- 編集された内容を再検証する
- 重複を検出する
- `item.id` を生成する
- `addedAt` 等のtestCode固有フィールドを生成する
- `pages` および `pageManifest` を生成する
- 必要に応じて作者カードを更新する
- `savedItems` を更新する
- 既存の永続化処理を呼び出す
- 本棚を再描画する
- 既存のクラウド同期処理を利用する

---

## 拡張機能から渡す候補データ

拡張機能からtestCodeへは、完成した `savedItem` を渡さない。

外部サイトから抽出した「登録候補」として、以下の構造を渡す。

```js
{
  schemaVersion: 1,

  title: "...",
  author: "...",
  circleName: "...",
  tags: ["...", "..."],
  sourceWork: "...",

  sourceUrl: "https://momon-ga.com/...",
  pages: [
    "https://z....momon-ga.me/galleries/.../1.webp",
    "https://z....momon-ga.me/galleries/.../2.webp"
  ],

  fallbackPagePattern: {
    baseUrl: "...",
    prefix: "",
    suffix: "",
    width: 1,
    extension: "webp"
  }
}
```

`fallbackPagePattern` は必須ではない。

全ページURLを正常に取得できている場合、Readerの主経路では使用しない。

---

## 抽出フィールド

### `title`

作品名。

取得優先順位は以下を基本とする。

1. 作品ページ固有の見出し
2. `og:title`
3. schema.org等の `headline`

取得後、momon:GAのサイト名など、作品名ではない既知の接尾辞が存在する場合だけ除去する。

過剰な文字列加工は行わない。

---

### `author`

「作者」区分に表示されている作者名。

複数作者が存在する場合の扱いは実HTMLを確認して定める。

初期実装で単一作者のみを正式対応とする場合、複数作者を黙って捨てず、登録確認画面で警告する。

---

### `circleName`

「サークル」区分の表示名。

存在しない場合は空文字とする。

---

### `tags`

「内容」区分にあるタグ。

DOM上の順序を維持する。

重複タグは除去する。

空文字は保存しない。

---

### `sourceWork`

「パロディ」区分の作品名。

testCode既存の `sourceWork` に対応させる。

存在しない場合は空文字とする。

`sourceWork` が存在する作品については、testCode側で `isDoujin` を適切に設定し、既存カード表示と整合させる。

`isDoujin` の最終決定は外部サイトから受信した値をそのまま信用せず、testCode側の正規化処理で行う。

---

### `sourceUrl`

momon:GAの作品ページURL。

`link[rel="canonical"]` が正常であればcanonical URLを使用する。

canonical URLが使用できない場合のみ、現在のページURLを正規化して使用する。

以下を除去する。

- 不要なfragment
- トラッキング用query parameter

ただし作品識別に必要なquery parameterが存在する場合は保持する。

---

### `pages`

作品ページに含まれるページ画像URLを、作品の表示順どおりに格納する。

今回の設計において最も重要なフィールドである。

例：

```js
[
  "https://z1.momon-ga.me/galleries/12345/1.webp",
  "https://z1.momon-ga.me/galleries/12345/2.webp",
  "https://z1.momon-ga.me/galleries/12345/3.webp"
]
```

以下を満たすこと。

- 1件以上存在する
- すべて `https:` である
- 許可された画像ホストに属する
- 同一URLの重複を除去する
- DOM上のページ順を維持する
- サムネイルや広告画像を混入させない
- 同一作品のgalleryに属することを確認する

拡張機能が取得したページURL一覧を、testCode側でも再検証する。

---

### `fallbackPagePattern`

ページURLから安全に生成できる場合だけ保持する補助情報。

新規作品のReader表示には原則使用しない。

用途は以下に限定する。

- 診断
- 将来の互換性
- ページURL一覧が欠損した場合の復旧補助

Readerの通常動作をこの値に依存させない。

---

## testCode側で生成する正式レコード

拡張機能から受け取った候補を検証した後、testCode側で `mangaReaderSavedItems` 用の正式な作品レコードを生成する。

概念上は以下のような形式とする。

```js
{
  id: "i-...",
  title: "...",
  author: "...",
  circleName: "...",
  tags: ["...", "..."],

  sourceWork: "...",
  isDoujin: true,

  sourceUrl: "https://momon-ga.com/...",
  url: "https://z1.momon-ga.me/galleries/12345/1.webp",

  pages: [
    "https://z1.momon-ga.me/galleries/12345/1.webp",
    "https://z1.momon-ga.me/galleries/12345/2.webp"
  ],

  pageManifest: {
    version: 1,
    pages: [
      "https://z1.momon-ga.me/galleries/12345/1.webp",
      "https://z1.momon-ga.me/galleries/12345/2.webp"
    ],
    splitSpreads: false
  },

  folderId: null,
  addedAt: 1234567890000
}
```

実際の生成処理では、既存のtestCodeデータモデルと整合するようにする。

---

## `id`

`id` は拡張機能に生成させない。

testCode側で新規登録時に生成する。

Readerは `reader.html?item=<itemId>` の `itemId` を作品の正式な識別子として使用するため、必須である。

URLを作品識別子として使用してはならない。

---

## `url`

互換性のため保持する。

momon:GA取り込み作品では原則として `pages[0]` と同じ値を入れる。

ただしReaderのページ列挙は `url` からの連番推測ではなく、`pageManifest.pages` / `pages` を使用する。

---

## `pages`

拡張機能から取得したページURL一覧を、testCode側で検証・複製して保存する。

外部から受信した配列オブジェクトをそのまま内部状態として使用しない。

---

## `pageManifest`

新規取り込み時にtestCode側で生成する。

```js
{
  version: 1,
  pages: [...],
  splitSpreads: false
}
```

Readerはこのページ一覧を直接使用する。

これにより、作品を初めて開いた際に1ページずつURLをprobeしてページ数を探索する必要がなくなる。

---

## `pageCount`

独立した永続化フィールドとしては原則不要とする。

ページ数は以下から取得できる。

```js
item.pageManifest.pages.length
```

または

```js
item.pages.length
```

確認UIでは `pages.length` を表示する。

将来、別の理由でキャッシュ値として保持する場合でも、ページ一覧を正とする。

---

## `sourceUrl`

作品画像URLとは別に、元のmomon:GA作品ページを記録する。

現在のtestCodeのReader動作には使用しない。

主な用途は以下。

- 重複判定
- 元ページ確認
- 将来の再取得
- デバッグ
- データ由来の確認

---

## 作者カードとの整合

testCodeには `mangaReaderAuthorCards` が存在する。

一括登録によって新しい `author` が追加された場合、既存の作者カード同期ロジックと整合する必要がある。

単に `savedItems` に作品を追加するだけで終わらせない。

以下を行う。

1. 登録対象作品の `author` を集める。
2. 既存 `authorCards` と照合する。
3. 未登録作者について作者カードを生成する。
4. `circleName` が得られている場合、既存データを壊さない範囲で反映する。
5. 作者カード変更がある場合は既存の作者カード永続化経路を使用する。

この処理は、一括取り込み専用の場当たり的なコードとして複製せず、可能なら既存の作者同期処理を再利用可能な関数へ切り出す。

---

## 一括読み込みUI

既存の `#bulkDetectBtn` を今回の機能の入口とする。

ボタン押下時、以下の画面を表示する。

### 一覧画面

表示項目：

- 登録対象チェック
- タイトル
- 作者
- サークル
- 元作品
- タグ
- ページ数
- 先頭ページ
- 元ページURL
- 重複状態
- エラー状態

各作品は展開して詳細編集できるようにする。

---

## 登録前編集

以下を編集可能とする。

- タイトル
- 作者
- サークル
- 元作品
- タグ

画像URL一覧は通常のテキスト入力として自由編集させない。

必要なら詳細表示または再抽出を提供する。

これは、ページURLの誤編集によるReader破損を防ぐためである。

---

## 登録対象の選択

以下を可能にする。

- 全件登録
- 選択した作品だけ登録
- 個別作品を除外
- 重複作品を明示的に再登録

重複作品は初期状態では登録対象外とする。

---

## 重複判定

重複は一つの値だけで判断しない。

以下を使用する。

優先度1：

```text
sourceUrl
```

優先度2：

```text
pages[0]
```

優先度3：

ページgalleryの識別子を安全に抽出できる場合、そのgallery identity。

同一 `sourceUrl` または同一先頭ページURLを持つ既存作品が存在する場合、原則として重複と判定する。

タイトルだけでは重複判定しない。

重複候補については、

```text
既に本棚に登録されています
```

と表示し、初期状態では登録チェックを外す。

利用者が明示的に選択した場合のみ別作品として追加できる。

---

## 登録処理

登録ボタンを押した後は、以下の順序とする。

1. 登録対象候補を取得
2. 全候補を再検証
3. 重複状態を再確認
4. すべての正式作品レコードをメモリ上で生成
5. 作者カード変更内容を生成
6. 途中エラーがないことを確認
7. `savedItems` の新しい配列をstateへ設定
8. 必要なら `authorCards` も更新
9. 永続化処理を呼び出す
10. 本棚を再描画
11. 既存のクラウド同期スケジュールへ委譲

入力検証エラーがある状態で部分的に `savedItems` を変更してはならない。

---

## 永続化の原子性

今回保証する「一括」はローカル本棚stateへの登録についてである。

クラウド同期そのものをトランザクション化するものではない。

ローカル側では、

- 全候補を先に検証
- 完成した `savedItems` を一度更新
- 永続化を一度実行

とする。

その後のVaultクラウド同期は、既存の遅延同期処理に委譲する。

新しい独自同期経路を作ってはならない。

---

## 拡張機能キュー

キューは拡張機能の `chrome.storage.local` に保持する。

キューの各項目には内部用IDを持たせてもよいが、そのIDをtestCodeの `item.id` として使用してはならない。

キューでは以下を可能にする。

- 一覧確認
- 個別削除
- 全削除
- 再抽出
- testCodeへの受け渡し

testCodeへの登録に成功した後も、キューを自動削除することは必須としない。

登録完了後に、

```text
登録済みの項目をキューから削除
```

を利用者が実行できるようにする。

将来的に自動削除を追加する場合でも、testCode側の登録成功応答を確認した後だけ実行する。

---

## 拡張機能とtestCodeの通信

曖昧な `window.postMessage` のみで構成しない。

推奨構成は以下。

```text
manga.html
    ↓ 明示的な取込要求
testCode origin上の拡張機能content script
    ↓
extension service worker
    ↓
chrome.storage.local のキュー
    ↓
content script
    ↓
manga.html
```

testCodeページ自身に `chrome.storage` や拡張機能内部APIへの直接アクセスを要求しない。

拡張機能側ではmanifestの権限を必要最小限にする。

---

## メッセージ形式

受け渡しメッセージには明示的なschemaを持たせる。

例：

```js
{
  type: "TESTCODE_MOMON_IMPORT_RESPONSE",
  schemaVersion: 1,
  requestId: "...",
  items: [...]
}
```

testCode側では以下を検証する。

- `type`
- `schemaVersion`
- `requestId`
- `items` が配列か
- 最大候補件数
- 各フィールドの型
- 各文字列の最大長
- tags件数
- pages件数
- URL形式
- URL protocol
- URL host
- ページURL間の整合性

拡張機能由来のメッセージであっても、データ自体を信頼してはならない。

---

## セキュリティ境界

### 作品ページ

作品ページは許可されたmomon:GA originに限定する。

基本対象：

```text
https://momon-ga.com/
```

必要に応じて `www` 等の実際に確認済みのhostだけ追加する。

---

### 画像ページ

画像は `momon-ga.com` ではなく、確認済みの画像配信hostを許可する。

提供HTMLで確認されている形式：

```text
https://z*.momon-ga.me/galleries/...
```

実装時には単純な文字列 `includes()` では判定しない。

`URL` オブジェクトで解析し、

- protocolが `https:`
- hostnameが許可規則に一致
- pathnameが期待するgallery形式

であることを確認する。

例：

```text
*.momon-ga.me
```

を許可する場合も、

```text
evil-momon-ga.me
```

等を誤許可しないhostname判定にする。

---

## URL検証

すべての外部URLについて、

```text
https:
```

のみを許可する。

以下は拒否する。

- `javascript:`
- `data:`
- `file:`
- `blob:`
- `http:`
- 不正なURL
- 未許可host

---

## HTML表示

拡張機能・testCodeの確認画面とも、外部サイトから取得した文字列を `innerHTML` に入れない。

表示には原則として、

```js
textContent
```

を使用する。

外部から渡されたHTMLをそのままDOMへ挿入しない。

---

## 件数制限

悪意ある、または壊れたデータによる極端なメモリ消費を避けるため上限を設ける。

初期値の例：

```text
キュー最大作品数: 500
1作品最大ページ数: 3000
タイトル最大長: 500文字
作者名最大長: 300文字
サークル名最大長: 300文字
タグ最大件数: 200
1タグ最大長: 200文字
```

実際の上限値は既存作品データを確認して決定する。

上限超過時に黙って切り捨てず、検証エラーとして表示する。

---

## ページ抽出

作品本文の全 `img` を無条件で採用してはならない。

以下を確認する。

- gallery画像URLである
- 同一galleryに属する
- ページ番号を持つ
- ページ順を判定できる
- 重複していない

DOMの出現順が作品ページ順として信頼できることをfixtureテストで確認する。

URLのページ番号から並び替える場合は、サイトの実際の命名規則をfixtureで確認した上で行う。

推測で並べ替えない。

---

## 一部ページの欠落

たとえば、

```text
1.webp
2.webp
4.webp
```

だけ取得された場合、単純に3ページ作品として登録してはならない。

ページ番号が連続することを期待できるサイト構造であるとfixtureから確認できる場合、

```text
ページURLに欠落があります
```

として警告またはエラーにする。

ただしサイト仕様として欠番が正常に存在することが判明した場合は、この検証を変更する。

---

## 抽出失敗時

作品単位で以下のようなエラーを表示する。

```text
タイトルを取得できませんでした
作者情報が見つかりません
ページ画像が見つかりません
複数のgalleryが混在しています
許可されていない画像URLです
作品ページの構造が変更された可能性があります
```

タイトル・作者・タグ等のメタデータは確認画面で補正できる。

ページ画像一覧の抽出に失敗した作品は、原則としてそのまま登録させない。

---

## Readerとの関係

### Readerのページ解決との関係

現行Readerでは、暗号化作品は `encryptedAssets` を使用する別経路で処理する。

通常URL作品については、以下の優先順位でページ一覧を解決する。

1. `pageManifest.version === 1` かつ `pageManifest.pages` が存在する場合は、`pageManifest.pages` を使用する。
2. `pageManifest` が存在せず、`pages` が存在する場合は、`pages` を使用する。
3. いずれも存在しない既存作品についてのみ、`url`、`pagePattern`、`numberWidth` 等から連番画像URLを探索するレガシー経路を使用する。

momonから新規に取り込む作品では、作品ページHTMLから全ページURLを取得できるため、連番探索を通常経路として使用しない。

testCode側で正式作品レコードを生成する際には、取得した全ページURLを `pageManifest.pages` に保存し、既存の本棚表示その他の処理との互換性のため `pages` にも同じページ一覧を保持する。

したがって、新規momon作品の正式なページ情報は `pageManifest.pages` を正とし、`pages` は互換表現として保持する。

Reader側へmomon:GA専用処理を追加してはならない。Readerは作品の出典サイトを意識しない設計を維持する。

---

## 既存連番探索との関係

`pagePattern` や `numberWidth` を使用した連番探索は既存作品との互換性のために残る。

今回のmomon:GAインポートでは、正常に全ページURLが取得できる限り使用しない。

つまり、

```text
momon:GA専用コード
    ↓
全ページURL
    ↓
汎用 pageManifest
    ↓
Reader
```

という境界にする。

---

## 本棚画像表示との関係

本棚カードは、`item.pages[0]` が存在する場合、そのURLをカバーとして使用できる。

したがって、momon:GA作品では先頭画像URLが既知であるため、新たなカバー探索処理を追加しない。

`pages[0]` を既存本棚表示に利用する。

---

## sourceUrlの表示

初期実装では必ずしも本棚カードに表示する必要はない。

登録確認画面では表示する。

将来的に作品詳細画面等から、

```text
元ページを開く
```

機能を追加できるよう保存しておく。

---

## エラー処理

以下を作品単位で区別して表示する。

- サイト構造変更
- タイトル欠落
- 作者欠落
- ページ画像欠落
- ページURL不正
- 未許可host
- 複数gallery混在
- 不正な受信メッセージ
- schemaVersion不一致
- 重複作品
- ローカル保存失敗
- クラウド同期失敗

ローカル本棚への登録成功と、その後のクラウド同期成功を同一のものとして扱わない。

たとえばローカル登録後にクラウド同期が失敗した場合、

```text
本棚には追加しましたが、クラウド同期に失敗しました
```

のように既存同期UIの方針に従って扱う。

---

## テスト

### 拡張機能抽出テスト

提供されたmomon:GA HTMLをfixtureとして保存する。

以下を検証する。

- タイトル
- 作者
- サークル
- パロディ元作品
- 内容タグ
- sourceUrl
- 全ページ画像URL
- ページ順
- ページ数
- gallery identity
- 不要画像が混入しないこと

---

### 構造変更テスト

fixtureを加工し、以下を検証する。

- `#post-tag` 欠落
- 作者欠落
- サークル欠落
- パロディ欠落
- タグ欠落
- ページ画像欠落
- gallery URL形式変更
- 複数gallery混在
- 不正URL
- 未許可host

---

## testCode側単体テスト

一括取り込み処理について以下を確認する。

- 正常候補から正式な作品レコードを生成できる
- `id` がtestCode側で生成される
- `addedAt` がtestCode側で設定される
- `url === pages[0]`
- `pageManifest.version === 1`
- `pageManifest.pages` が正しい
- `pages` と `pageManifest.pages` が同じページ順になる
- sourceUrlが保持される
- authorが保持される
- circleNameが保持される
- tagsが保持される
- sourceWorkが保持される
- 必要な場合に `isDoujin` が設定される
- 重複が初期状態で除外される
- 明示操作により重複登録できる
- 全候補検証後に一度だけ作品保存する
- 検証エラー時に `savedItems` が変更されない
- 作者カードが正しく生成・統合される

---

## Reader統合テスト

インポートした作品について、

```text
manga.html
↓
作品カード
↓
reader.html?item=<itemId>
```

で開けることを確認する。

さらに、

- 1ページ目
- 中間ページ
- 最終ページ
- ページスライダー
- 前へ
- 次へ
- 最初へ
- 最後へ
- Readerを閉じる
- `manga.html` へ戻る

を確認する。

Readerがmomon:GA用の連番探索を実行せず、保存された `pageManifest.pages` を使用していることもテストする。

---

## 実ブラウザ確認

UI変更を伴うため、単体テストだけで完了扱いにしない。

ChromeまたはEdgeでunpacked extensionとして実際に読み込み、以下の一連の操作を行う。

```text
momon:GA作品ページを開く
↓
拡張機能で作品をキューへ追加
↓
別作品も追加
↓
testCode manga.htmlを開く
↓
一括読み込み
↓
候補一覧を確認
↓
登録
↓
本棚に複数作品が表示される
↓
Readerを開く
↓
最終ページまで表示できる
↓
閉じる
↓
本棚へ戻る
```

---

## リポジトリ検証

実装完了前に少なくとも以下を実行する。

```bash
npm test
npm run verify:static
git diff --check
```

UIまたはブラウザ動作に関する変更については、これに加えて実ブラウザ確認を行う。

---

## 権限

拡張機能のmanifest権限は必要最小限とする。

必要候補：

- `storage`
- momon:GAの対象origin
- testCodeの実際の配信origin

以下は要求しない。

- 全サイトアクセス
- 閲覧履歴
- ダウンロード履歴
- Cookie全般
- 外部解析サービスへの通信
- Supabaseへの直接アクセス
- testCode認証情報へのアクセス

実際に使用しない権限は追加しない。

---

## ファイル構成

拡張機能側はtestCode本体と分離する。

例：

```text
extensions/
  momon-ga-importer/
    manifest.json
    service-worker.js
    content-momon.js
    content-testcode.js
    extractor.js
    queue.js
    popup.html
    popup.js
```

testCode本体側には、一括インポートを独立した責務として追加する。

例：

```text
manga-import-candidate.js
manga-import-validator.js
manga-import-bridge.js
manga-import-dialog.js
```

実際のファイル名は既存の命名規則を調査して決定する。

大きな処理を `manga-list-route.js` の中へ直接追加し続けない。

---

## manga-list-routeとの関係

`manga-list-route.js` は本棚route全体を所有しているが、momon:GA固有のDOM抽出処理を置かない。

本棚側では、

- 取込ボタンの起動
- import serviceへの依頼
- 正式レコードのstate反映
- persist
- 再描画

程度のオーケストレーションに留める。

momon:GAのHTML構造は拡張機能側のextractorに閉じ込める。

---

## 将来の別サイト対応

今回の対象はmomon:GAのみとする。

ただしtestCodeへ渡す候補schemaはサイト非依存にする。

つまり、

```text
momon-ga extractor
       ↓
ImportCandidate schema
       ↓
testCode
```

という構造にする。

将来別サイトを追加するときは、

```text
別サイト extractor
       ↓
同じ ImportCandidate schema
```

とできる構造が望ましい。

ただし今回の実装で、まだ存在しないサイトのための過剰な抽象化は行わない。

---

## 対象外

今回の実装対象外は以下。

- 他サイト向け汎用スクレイパー
- 検索結果ページからの大量自動巡回
- サイト全体の自動クロール
- 作品画像そのものの保存
- 作品画像の複製
- 作品画像の暗号化アップロード
- 外部メタデータAPI
- AIによる作者名・タグ等の推測補完
- Reader内のmomon:GA専用処理
- 拡張機能単独での本棚バックグラウンド変更
- 拡張機能からVaultを直接変更すること
- 拡張機能からSupabaseを直接変更すること

---

## 設計上の主要原則

今回の実装では以下を崩さない。

```text
外部サイト固有処理
        ↓
拡張機能
        ↓
検証済み候補データ
        ↓
manga.html
        ↓
testCode正式作品レコード
        ↓
mangaReaderSavedItems
        ↓
既存host runtime
        ↓
既存Vault同期
```

Readerについては、

```text
item.id
  ↓
reader.html?item=<itemId>
  ↓
pageManifest.pages
  ↓
Reader
```

を正式な経路とする。

新規取り込み作品について、

```text
先頭URL
  ↓
URL規則を推測
  ↓
Readerが全ページ探索
```

という旧方式を主経路に戻してはならない。

---

## 完了条件

以下をすべて満たした時点で完了とする。

1. momon:GA作品ページから必要なメタデータを取得できる。
2. 全ページ画像URLを正しい順序で取得できる。
3. 複数作品を拡張機能キューへ保存できる。
4. testCodeの `一括読み込み` からキューを取得できる。
5. 登録前に全作品を確認できる。
6. testCode側で受信内容を再検証している。
7. `item.id` をtestCode側で生成している。
8. `pages` と `pageManifest` を保存している。
9. 既存Readerが追加処理なしで作品を開ける。
10. Readerが保存済みページ一覧を使用する。
11. 本棚への登録が全件検証後に一括して行われる。
12. 作者カードとの整合が維持される。
13. 既存host runtime経由でクラウド同期される。
14. 拡張機能がVault・Supabase認証情報・本棚localStorageへ直接アクセスしていない。
15. `npm test` が成功する。
16. `npm run verify:static` が成功する。
17. `git diff --check` が成功する。
18. 実ブラウザでmomon:GA → キュー → 本棚 → Reader → 本棚復帰まで確認されている。