# Normal Chat Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** testCode に、ログイン必須・暗号化同期対応の通常AIチャットを追加し、Windows上の認証付きローカルChat API経由でOllamaを安全に利用できるようにする。

**Architecture:** フロントエンドは `chat.html` と小さな専用JSモジュールに分け、既存のSupabaseセッションと解除済みvault keyを再利用する。会話履歴・API endpoint・API key・既定モデルは専用暗号化blobとして端末保存し、同じciphertext envelopeを専用 `chat_vaults` へ同期する。Windows側Chat APIはNode標準機能だけで実装し、Origin・Supabase Bearer token・専用API keyを検証してから固定localhost Ollamaへ転送する。

**Tech Stack:** Static HTML/CSS/JavaScript, Web Crypto AES-GCM, Supabase Auth/Postgres/RLS, Node.js 20+ standard library, Ollama local HTTP API, Tailscale Serve.

**Spec:** `docs/superpowers/specs/2026-09-03-normal-chat-mode-design.md`

## Global Constraints

- 未ログイン時はチャット画面を一切表示しない。
- vault 未解除時はチャットデータを復号しない。
- ブラウザから Ollama を直接呼ばない。
- Chat API は Supabase access token と Chat API key の両方を必須とする。
- API key とチャット本文は Supabase / localStorage のいずれにも平文保存しない。
- Chat API は `127.0.0.1` bind を既定とし、wildcard CORS を使わない。
- service_role / secret key をブラウザまたはGitへ置かない。
- モデル出力の raw HTML を実行しない。
- Open WebUI には依存しない。
- Nodeサーバーは追加npm依存を導入しない。

---

### Task 1: Chat Store Encryption

**Files:**
- Create: `chat-store.js`
- Test: `tests/chat-store.test.mjs`

**Interfaces:**
- Consumes: `MangaVault.loadActive().rawKey` と Web Crypto API。
- Produces: `ChatStore.createDefaultState()`, `ChatStore.normalizeState(value)`, `ChatStore.encryptState(state, rawKey)`, `ChatStore.decryptState(envelope, rawKey)`, `ChatStore.loadEncrypted(storage)`, `ChatStore.saveEncrypted(envelope, storage)`, conversation CRUD helpers。

- [ ] **Step 1: Write failing tests**

Tests assert:
- default state contains version/settings/conversations/activeConversationId
- normalization strips unknown malformed structures
- AES-GCM roundtrip restores endpoint/apiKey/messages
- wrong key fails
- serialized localStorage value does not contain plaintext secret or message
- conversation create/delete/update helpers preserve normalized state

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --test-name-pattern="chat store"`
Expected: FAIL because `chat-store.js` does not exist.

- [ ] **Step 3: Implement minimal store**

Use AES-256-GCM with:
- 12 byte random IV
- imported 32-byte raw vault key
- AAD = UTF-8 `testCode-chat-local-v1`
- base64url encoding

Persist only:
`{"type":"testcode-chat-local","version":1,"iv":"...","ciphertext":"..."}`
under `testCodeChatEncryptedState`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all existing + chat-store tests PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add encrypted chat store`

### Task 2: Safe Markdown Renderer

**Files:**
- Create: `chat-markdown.js`
- Test: `tests/chat-markdown.test.mjs`

**Interfaces:**
- Produces: `ChatMarkdown.render(text): string` returning sanitized HTML.

- [ ] **Step 1: Write failing tests**

Verify:
- `<script>` and raw HTML are escaped
- `javascript:`, `data:`, `file:` links are not clickable
- `http://` and `https://` links use escaped href and `rel="noopener noreferrer"`
- fenced code and inline code escape HTML
- simple headings, bullets, bold render correctly

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --test-name-pattern="chat markdown"`
Expected: FAIL because renderer does not exist.

- [ ] **Step 3: Implement renderer**

Implement a small renderer without external dependencies. Escape all input first; only then introduce known markup. Raw HTML remains text.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add safe chat markdown rendering`

### Task 3: Supabase Chat Vault Sync

**Files:**
- Create: `chat-sync.js`
- Modify: `supabase-schema.sql`
- Test: `tests/chat-sync.test.mjs`

**Interfaces:**
- Consumes: `MangaVault.withSession`, `MangaVault.api`, encrypted local envelope from ChatStore.
- Produces: `ChatSync.loadRemote()`, `ChatSync.saveRemote(envelope)`, `ChatSync.syncFromRemote()`, `ChatSync.syncToRemote(envelope)`.

- [ ] **Step 1: Write failing tests**

Static/module tests verify:
- only encrypted envelope is submitted
- request is authenticated through `MangaVault.withSession`
- update uses expected revision
- conflict returns a distinct conflict error
- no API key/chat plaintext field exists in network payload builder

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --test-name-pattern="chat sync"`
Expected: FAIL.

- [ ] **Step 3: Add database schema**

Create `public.chat_vaults(user_id,payload,revision,updated_at)`.
Enable RLS.
Create SELECT/INSERT/UPDATE policies to `authenticated` with `auth.uid() = user_id`.
Create `update_chat_vault(expected_revision,new_payload)` as `SECURITY INVOKER`.
Revoke execute from PUBLIC; grant to authenticated.

- [ ] **Step 4: Implement sync module**

Use REST/RPC calls analogous to the existing manga vault, but store the already-encrypted chat envelope rather than reusing the large manga payload.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Apply schema to Supabase and verify**

Apply the DDL via a migration to project `iblrwiehgzgplpzsrnqv`.
Verify `pg_policies` and function security mode.
Run Supabase Security Advisor and ensure no new finding is introduced.

- [ ] **Step 7: Commit**

Commit: `feat: add encrypted chat vault sync`

### Task 4: Authenticated Local Chat API

**Files:**
- Create: `chat-server/server.mjs`
- Create: `chat-server/security.mjs`
- Create: `chat-server/README.md`
- Create: `.env.example`
- Modify: `.gitignore`
- Test: `tests/chat-server.test.mjs`

**Interfaces:**
- HTTP:
  - `GET /health` returns generic health only; no secrets.
  - `GET /v1/models` requires full auth.
  - `POST /v1/chat` requires full auth and streams Ollama response.
- Env:
  - `CHAT_PORT` default 3100
  - `CHAT_HOST` default `127.0.0.1`
  - `CHAT_ALLOWED_ORIGINS` comma-separated exact origins
  - `CHAT_API_KEY_SHA256` lowercase SHA-256 hex
  - `SUPABASE_URL`
  - `SUPABASE_PUBLISHABLE_KEY`
  - `OLLAMA_BASE_URL` default `http://127.0.0.1:11434`

- [ ] **Step 1: Write failing server security tests**

Mock Supabase verification and Ollama fetch. Verify:
- missing Origin -> 403 for browser API endpoints
- wrong Origin -> 403
- missing Bearer -> 401
- invalid bearer -> 401
- missing/wrong chat key -> 403
- auth failures never call Ollama
- body > configured max -> 413
- invalid roles/model -> 400
- plaintext request body is never passed to logger
- abort propagates to Ollama fetch

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --test-name-pattern="chat server"`
Expected: FAIL.

- [ ] **Step 3: Implement security module**

- parse exact allowlist origins
- verify Bearer by GET `${SUPABASE_URL}/auth/v1/user` with publishable apikey and Authorization header
- SHA-256 hash provided `X-TestCode-Chat-Key`
- compare hashes with `crypto.timingSafeEqual`
- validate JSON, role allowlist (`system,user,assistant`), sizes, and model against local model list
- never log headers/body

- [ ] **Step 4: Implement server**

Use `node:http` and built-in `fetch`.
Forward only to fixed `${OLLAMA_BASE_URL}/api/tags` and `/api/chat`.
Do not accept a caller-provided backend URL or arbitrary headers.
Stream response chunks to client.
Bind default host `127.0.0.1`.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: add authenticated local chat api`

### Task 5: Chat UI and Navigation

**Files:**
- Create: `chat.html`
- Create: `chat-app.js`
- Modify: `home-dashboard.js`
- Modify: `vault-payload.js` only if required for home card layout catalog compatibility; do not add chat plaintext.
- Modify: `app-desktop-rail.js`
- Test: `tests/chat-page.test.mjs`
- Test: `tests/home-dashboard.test.mjs` as needed

**Interfaces:**
- Consumes ChatStore, ChatSync, ChatMarkdown, MangaVault.
- Sends `Authorization: Bearer <access_token>` and `X-TestCode-Chat-Key`.
- Does not store access token inside chat state.

- [ ] **Step 1: Write failing page tests**

Static tests verify:
- `html.auth-pending`
- auth gate runs before revealing page
- no session -> `index.html`
- no active vault -> `sync.html`
- successful `refreshSession()` required before removing auth-pending
- chat request headers include Bearer token + chat API key
- no direct `11434` or Ollama URL in browser source
- output rendering uses ChatMarkdown, not model-output `innerHTML` directly
- settings save through encrypted ChatStore
- home and desktop rail include Chat route

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --test-name-pattern="chat page"`
Expected: FAIL.

- [ ] **Step 3: Implement authenticated page shell**

Create responsive desktop/sidebar + mobile drawer UI.
Keep body invisible until Supabase refresh succeeds and vault is active.

- [ ] **Step 4: Implement settings and sync bootstrap**

On first open, settings request:
- Chat API endpoint (Tailscale Serve HTTPS URL)
- Chat API key
- default model

Encrypt locally immediately and sync ciphertext to `chat_vaults`.

- [ ] **Step 5: Implement chat behavior**

- fetch model list
- new/delete/select conversation
- send stream
- stop generation with AbortController
- regenerate last assistant answer
- title = shortened first user message
- save encrypted local state after changes
- schedule/debounce remote encrypted sync
- display conflict without destructive overwrite

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat: add normal chat mode ui`

### Task 6: Full Security and Regression Verification

**Files:**
- Modify only files required by discovered test failures.

**Interfaces:**
- No new public interface.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 2: Run static verification**

Run: `npm run verify:static`
Expected: PASS.

- [ ] **Step 3: Search repository for secret leakage patterns**

Check that:
- `CHAT_API_KEY_SHA256` example contains placeholder only
- no real Chat API key appears
- no service-role/secret Supabase key appears
- no prompt logging code exists
- browser files do not contain `127.0.0.1:11434` or caller-selectable internal fetch URL

- [ ] **Step 4: Verify Supabase live security**

Query:
- `chat_vaults.rls_enabled = true`
- policies restrict rows to `auth.uid() = user_id`
- update policy has USING + WITH CHECK
- update function is not SECURITY DEFINER
- PUBLIC cannot execute update function

Run Security Advisor and compare with pre-change baseline (one existing leaked-password-protection warning).

- [ ] **Step 5: Manual local smoke commands**

Document exact Windows commands:
- generate random Chat API key
- calculate SHA-256
- set env vars without committing them
- run `node chat-server/server.mjs`
- expose port with Tailscale Serve
- verify unauthenticated curl fails
- verify iPhone authenticated chat succeeds

- [ ] **Step 6: Final commit**

Commit any verification fixes with descriptive message.
