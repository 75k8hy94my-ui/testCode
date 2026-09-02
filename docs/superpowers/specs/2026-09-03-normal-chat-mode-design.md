# 通常チャットモード設計

日付: 2026-09-03
対象: testCode
ブランチ: `feat/normal-chat-mode`

## 1. 目的

testCode に、一般的なAIチャット風の「通常チャットモード」を追加する。

将来作る LINE 風のキャラクターチャット（LoRA、キャラクター設定、長期記憶等）とは別機能として分離する。

初版では、Windows 上で稼働する Ollama を、Tailscale 経由の小さなローカル Chat API から呼び出す。

## 2. 必須要件

- `chat.html` を通常チャット専用ページとして追加する。
- 未ログイン時はチャット画面を一切表示せず、ログイン画面へ戻す。
- ログイン済みでも暗号化保管庫が未解除なら、保管庫解除画面へ戻す。
- ブラウザから Ollama を直接呼ばない。
- Chat API は Supabase の有効なユーザーアクセストークンを毎リクエスト検証する。
- Chat API は追加の Chat API キーも必須とする。
- API キーとチャット内容は同期対象にする。
- API キーとチャット内容は Supabase 上で平文保存しない。
- API キーとチャット内容は端末の `localStorage` にも平文保存しない。
- Open WebUI は管理・動作確認用として残し、通常チャットからは依存しない。

## 3. 全体構成

```
iPhone / PC browser
        |
        | testCode (HTTPS)
        v
    chat.html
        |
        | Authorization: Bearer <Supabase access token>
        | X-TestCode-Chat-Key: <chat api key>
        v
Tailscale Serve
        |
        v
127.0.0.1 only
testCode Chat API
        |
        | http://127.0.0.1:11434
        v
      Ollama
```

Chat API は Windows で `127.0.0.1` のみに bind する。LAN 全体や `0.0.0.0` には公開しない。外部からは Tailscale Serve 経由だけで到達させる。

## 4. 認証・認可

### 4.1 フロントエンド

既存の `home.html` / `study.html` と同じ認証方式を利用する。

1. HTML は `auth-pending` 状態で開始し、認証確認前に本文を表示しない。
2. `MangaVault.loadSession()` でローカルセッションの存在を確認する。
3. `MangaVault.refreshSession()` を実行し、Supabase Auth により実セッションを再検証する。
4. 失敗した場合は保存セッションを破棄し `index.html` へ戻す。
5. `MangaVault.loadActive()` がない場合は `sync.html` へ戻し、保管庫解除を要求する。
6. 上記すべてに成功してから UI を表示する。

ローカルに残ったセッション情報だけを認可根拠にしない。

### 4.2 Chat API

すべてのモデル取得・チャット生成 API で、以下を両方必須とする。

- Supabase access token
- Chat API key

Supabase プロジェクトは現状の認証構成に合わせ、ローカル Chat API から Supabase Auth の `/auth/v1/user` を呼び出して Bearer token を検証する。ブラウザ由来の `session.user` オブジェクトは認可に使用しない。

Chat API key は十分な長さのランダム値とする。サーバー側では平文を Git に保存せず、環境変数またはローカル秘密設定で保持する。実装時は、可能なら SHA-256 ハッシュ比較 + timing-safe comparison とし、リポジトリには `.env.example` のみ置く。

### 4.3 CORS

- 許可 Origin は環境変数で完全一致指定する。
- `Access-Control-Allow-Origin: *` は使わない。
- 不明な Origin、Authorization のない要求、API key のない要求は Ollama へ到達させる前に拒否する。
- Cookie 認証にはしないため、クロスサイト要求で暗黙に資格情報が送られる構成にしない。

## 5. チャットデータの暗号化と同期

### 5.1 既存保管庫とは分離する理由

漫画・学習データの既存 `manga_reader_vaults` にチャットを直接追加しない。

理由:

- 古いクライアントが未知フィールドを正規化時に落とすと、チャットデータ消失の可能性がある。
- チャット履歴が増えると既存保管庫全体が肥大化する。
- 漫画・学習同期とチャット同期の競合を分離したい。

### 5.2 専用テーブル

Supabase にチャット専用の暗号化保管庫を追加する。

概念:

```
public.chat_vaults
- user_id uuid primary key references auth.users(id)
- payload jsonb not null
- revision bigint not null default 1
- updated_at timestamptz not null default now()
```

`payload` には平文の会話や API key を入れず、既存保管庫と同じ AES-256-GCM 系のクライアント暗号化 envelope のみ保存する。

RLS:

- SELECT: `auth.uid() = user_id`
- INSERT: `auth.uid() = user_id`
- UPDATE: `auth.uid() = user_id` を USING と WITH CHECK の両方で要求
- anon にはデータアクセスを許可しない

更新競合対策として revision を利用する。別端末で先に更新済みなら上書きせず、ユーザーへ同期競合を表示する。

更新用 RPC を作る場合は `SECURITY DEFINER` を使わず、invoker 権限のまま RLS を効かせる。関数の EXECUTE は `PUBLIC` から剥がし `authenticated` のみに付与する。

### 5.3 端末ローカル保存

端末では次の内容を1つの暗号化 blob として保存する。

```json
{
  "version": 1,
  "settings": {
    "apiEndpoint": "...",
    "apiKey": "...",
    "defaultModel": "..."
  },
  "conversations": [],
  "activeConversationId": "..."
}
```

この blob は、既存の解除済み vault raw key を使った AES-GCM で暗号化してから `localStorage` に保存する。

したがって:

- `localStorage` に API key の平文を置かない。
- `localStorage` にメッセージ本文の平文を置かない。
- vault が未解除なら復号できない。
- ログアウト・保管庫ロック後も残るのは暗号文だけ。

暗号化時は用途を固定する AAD（例: `testCode-chat-local-v1`）を使用し、別用途 ciphertext の取り違えを防ぐ。

## 6. UI

通常のAIチャットUIとする。LINE風にはしない。

### デスクトップ

- 左: 新規チャット、会話一覧
- 中央: メッセージ履歴
- 上部: モデル選択、設定
- 下部固定: 入力欄、送信、生成停止

### モバイル

- 会話一覧はドロワー
- 上部にモデル名
- 入力欄は safe-area を考慮して画面下部固定

### 初版機能

- 新規チャット
- 会話一覧
- メッセージ送信
- ストリーミング回答
- 生成停止
- 再生成
- モデル選択
- 会話削除
- API endpoint / API key 設定
- 同期状態表示

会話タイトルは初回ユーザーメッセージの短縮版を使い、タイトル生成のためだけに別LLM呼び出しはしない。

## 7. 出力レンダリング

セキュリティ優先で、モデル出力を `innerHTML` に直接入れない。

初版では:

- HTML は必ず escape
- Markdown は必要最小限の安全なサブセットのみ
- fenced code / inline code / 見出し / 箇条書き / 強調 / http(s) リンク程度
- raw HTML は無効
- リンクは `rel="noopener noreferrer"`
- `javascript:` 等の危険スキームはリンク化しない

外部 CDN の Markdown ライブラリを無条件で読み込まない。

## 8. Chat API

予定エンドポイント:

### GET /v1/models

認証必須。Ollama のローカルモデル一覧を返す。

### POST /v1/chat

認証必須。入力:

```json
{
  "model": "dolphin-mistral:7b",
  "messages": [
    { "role": "user", "content": "こんにちは" }
  ]
}
```

Ollama の `/api/chat` へ固定接続し、応答をブラウザへストリーミングする。

ブラウザから Ollama URL、任意の内部URL、任意HTTPヘッダー等を指定できる設計にはしない。SSRF の入口を作らない。

### 入力制限

- JSON body の最大サイズを設定
- role は allowlist
- model は Ollama に存在するモデルのみ
- message 数・各 message の長さに上限
- 空入力拒否
- 同一ユーザーの同時生成数を制限
- AbortSignal で停止可能

## 9. ログとプライバシー

Chat API は以下をログ出力しない。

- prompt
- assistant response
- Authorization header
- refresh token
- Chat API key
- 暗号化前の同期 payload

ログは必要最小限とし、時刻・HTTP status・モデル名・処理時間などに限定する。

エラー応答でも API key や Supabase token を反射しない。

## 10. testCode への組み込み

予定変更箇所:

- `chat.html` 新規
- `chat-store.js` 新規
- `chat-sync.js` 新規
- `chat-markdown.js` 新規
- `app-desktop-rail.js`: Chat 導線追加
- `home-dashboard.js`: Chat カード追加
- `supabase-schema.sql`: chat_vaults と RLS / revision 更新関数
- `chat-server/`: ローカル Chat API
- `.env.example`: 秘密値を含まない設定例
- `.gitignore`: ローカル秘密設定を除外
- `tests/`: 下記テスト追加

既存 Open WebUI のコードや設定には依存しない。

## 11. テスト

### フロントエンド

- 未ログイン時にチャットUIが表示されない
- refresh 失敗時に index.html へ戻る
- vault 未解除時に sync.html へ戻る
- API key / chat 本文が localStorage の平文に存在しない
- 暗号化 blob の復号が同じ vault key で成功する
- 別 key では復号失敗する
- model output の HTML/script が実行可能な形で挿入されない
- javascript: URL をリンク化しない
- conversation の保存・復元・削除

### Chat API

- Bearer token 欠落 -> 401
- 無効 token -> 401
- API key 欠落/不一致 -> 403
- 許可外 Origin -> 403
- 認証失敗時に Ollama が呼ばれない
- 不正 model / role / body -> 400
- request size 超過 -> 413
- 正常ストリーム
- client abort 時に Ollama 側も中止
- request body がログへ出ない

### Supabase

- RLS enabled を確認
- authenticated user は自分の行のみ読める
- 他 user_id への INSERT/UPDATE を拒否
- UPDATE に USING + WITH CHECK が存在
- RPC が SECURITY DEFINER でない
- security advisor を実行し、新規問題がないことを確認

## 12. セキュリティ上の非目標

初版では以下は行わない。

- Ollama をインターネットへ直接公開
- `0.0.0.0:11434` 公開
- service_role / secret key のブラウザ埋め込み
- API key の Git コミット
- wildcard CORS
- モデル出力 raw HTML 実行
- Web検索
- 任意 URL fetch
- キャラクターモード / LoRA
- LINE風UI

## 13. 現行環境で確認した事項

- testCode は静的 HTML + JavaScript 中心で、Supabase Auth を利用している。
- 既存保管庫 `manga_reader_vaults` は RLS 有効で、所有者 `auth.uid() = user_id` のポリシーが存在する。
- 既存保管庫はブラウザ側 AES-256-GCM 暗号化を行っている。
- 現在の Supabase Security Advisor には、今回のチャット実装とは独立して「Leaked Password Protection Disabled」の警告が1件ある。今回のコード変更で悪化させない。
- Supabase の現行ドキュメントに従い、サーバー認可判断ではブラウザ保存済み session user を信頼せず、アクセストークンを検証する。

## 14. 完了条件

- ログイン + vault 解除済みのユーザーだけがチャットを利用できる。
- Chat API に直接アクセスしても、有効な Supabase token と Chat API key の両方がなければ Ollama に到達できない。
- API key とメッセージ本文が Supabase / localStorage のいずれにも平文で残らない。
- iPhone から Tailscale 経由でストリーミングチャットできる。
- 会話履歴と設定が別端末へ暗号化同期される。
- 既存の漫画・学習機能と Open WebUI が壊れない。
