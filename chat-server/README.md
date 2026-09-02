# testCode Chat API

Windows 上の Ollama を testCode の通常チャットから利用するためのローカル API です。

## セキュリティ境界

- 既定で `127.0.0.1:3100` のみに bind します。
- ブラウザから Ollama を直接公開しません。
- `CHAT_ALLOWED_ORIGINS` は testCode の HTTPS Origin を完全一致で指定します。ワイルドカードは使えません。
- `/v1/models` と `/v1/chat` は、有効な Supabase Bearer token と Chat API key の両方を要求します。
- Chat API key の平文はサーバー設定に保存せず、SHA-256 digest のみを環境変数へ設定します。
- prompt / response / Authorization / Chat API key はサーバーログへ出しません。
- Ollama 接続先は localhost のみに制限されています。

## Chat API key の生成（PowerShell）

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$CHAT_API_KEY = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')

$sha = [Security.Cryptography.SHA256]::Create()
$hashBytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($CHAT_API_KEY))
$env:CHAT_API_KEY_SHA256 = [Convert]::ToHexString($hashBytes).ToLowerInvariant()

$CHAT_API_KEY
```

最後に表示された `$CHAT_API_KEY` は testCode のチャット設定画面へ一度入力します。testCode 側では解除済み保管庫鍵で暗号化して保存・同期します。

## 起動

```powershell
$env:CHAT_HOST = '127.0.0.1'
$env:CHAT_PORT = '3100'
$env:CHAT_ALLOWED_ORIGINS = 'https://your-testcode-origin.example'
$env:SUPABASE_URL = 'https://iblrwiehgzgplpzsrnqv.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = 'your publishable key'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

node .\chat-server\server.mjs
```

`CHAT_ALLOWED_ORIGINS` にはパスを含めず、ブラウザの `location.origin` と完全に同じ値を指定してください。

## エンドポイント

- `GET /health`: 秘密情報を含まない死活確認。
- `GET /v1/models`: 認証後に Ollama のインストール済みモデル名だけ返します。
- `POST /v1/chat`: 認証・入力検証後、固定の Ollama `/api/chat` へストリーム転送します。

Chat API をインターネットへポート開放しないでください。iPhone からの到達は Tailscale Serve 経由に限定します。
