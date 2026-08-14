# CODEX_PROJECT_SPEC

```yaml
project:
  name: manga-reader
  repo: 75k8hy94my-ui/testCode
  branch: main
  baseline_commit: 03312c4
  stack: static-html-css-js
  build: none
  dependencies: none
  entry: index.html
  dev: "python3 -m http.server 8000"
  dev_url: http://127.0.0.1:8000/index.html
  production_requires: [https]
source_of_truth: current_code > this_file
```

## FILE_CONTRACTS

```yaml
files:
  index.html:
    role: auth_login_signup
    next: sync.html
    api: [/auth/v1/signup, /auth/v1/token?grant_type=password, /auth/v1/token?grant_type=refresh_token]
  sync.html:
    role: vault_create_unlock_passkey_logout
    next: reader.html
    uses: [supabase-config.js, vault-session.js]
  reader.html:
    role: main_reader_bookshelf
    features: [url_manga, bookshelf, folders, series, authors, tags, history, unread, favorites, videos, toc, progress, import_export, cloud_sync]
    uses: [supabase-config.js, vault-session.js]
local-reader.html:
    role: local_folder_reader
    features: [folder_drop, natural_sort, vertical_horizontal, reverse, zoom, hide, favorite, crop, optional_storage_sync]
    uses: [supabase-config.js, vault-session.js]
  links.html:
    role: independent_local_link_manager
    sync: false
  vault-session.js:
    role: encrypted_vault_runtime
    export: window.MangaVault
  supabase-config.js:
    role: public_browser_config
    forbidden: [service_role_key, secrets]
  supabase-schema.sql:
    role: full_db_and_storage_rls_setup
  supabase-storage-setup.sql:
    role: storage_only_setup
  SECURITY.md:
    role: supplementary_security_notes
```

## ROUTING_AND_AUTH

```yaml
routes:
  index.html: unauthenticated_or_session_expired
  sync.html: authenticated_without_active_vault
  reader.html: authenticated_with_active_vault
  local-reader.html: reader_subroute
  links.html: standalone_local_page
guards:
  reader:
    no_session: index.html
    no_MangaVault.loadActive: sync.html
  sync:
    no_session_or_user_email: index.html
session:
  localStorage_key: mangaReaderSupabaseSession
  refresh: on_reader_boot_and_vault_operations
  logout:
    remote: POST /auth/v1/logout best_effort
    local_delete:
      - mangaReaderSupabaseSession
      - mangaReaderVaultSyncMeta
      - mangaReaderActiveVault(sessionStorage)
      - mangaReaderSavedFolders
      - mangaReaderSavedItems
      - mangaReaderVideos
      - mangaReaderInfoCache
      - mangaReaderToc
      - mangaReaderLastPage
      - mangaReaderLastUrl
      - mangaReaderSavedUrls
      - mangaReaderGithubSync
```

## SUPABASE_AND_CRYPTO

```yaml
database:
  table: public.manga_reader_vaults
  columns: [user_id(uuid pk -> auth.users.id cascade), payload(jsonb), updated_at(timestamptz)]
  rls: user_id == auth.uid()
  cardinality: one_vault_per_user
storage:
  bucket: local-manga
  public: false
  path_prefix: "<auth.uid>/<local-uuid>/..."
  rls: first_path_segment == auth.uid
crypto:
  data: AES-256-GCM
  vault_key: random_256_bit
  passphrase_kdf: PBKDF2-HMAC-SHA-256
  passphrase_iterations: 600000
  passphrase_salt: random_16_bytes
  gcm_iv: random_12_bytes_per_encryption
  recovery_key: "mrk1_" + base64url(random_256_bit)
  raw_key_storage: sessionStorage
  plaintext_uploaded: false
  vault_payload: encrypted_envelope_only
concurrency:
  fetch_existing: user_id + updated_at
  reject_stale_write: true
  refresh_on_401: true
passkey:
  protocol: WebAuthn
  requires: [PublicKeyCredential, navigator.credentials, PRF extension]
  wrappers: multiple_allowed
```

## VAULT_PAYLOAD

```js
{
  folders: [],
  items: [],
  videos: [],
  mangaInfo: {},
  toc: {},
  lastPages: {},
  authorCards: [],
  theme: "dark"
}
```

```yaml
localStorage:
  mangaReaderSavedFolders: folder_records
  mangaReaderSavedItems: manga_records_history_records_local_sync_records
  mangaReaderVideos: "{id,a,b,title,addedAt,...}[]"
  mangaReaderInfoCache: "url -> {ext,count,numberWidth,pattern,hitLimit,state,retryFrom}"
  mangaReaderToc: "resumeKey -> [{page,name}]"
  mangaReaderLastPage: "resumeKey -> {page,wasLast,savedAt}"
  mangaReaderAuthorCards: author_cards
  mangaReaderTheme: [dark, light]
  mangaReaderLastUrl: last_open_context
  mangaReaderStorageTransferLimitDaily: bytes
  mangaReaderStorageTransferUsageDaily: "{day,bytes}"
  "mangaReaderSavedVaultPassphrase:<userId>": optional_user_opt_in_only
  linkManagerItemsV1: links_html_only_not_in_vault
sessionStorage:
  mangaReaderActiveVault: "{rawKey,keyWraps}"
indexedDB:
  db: mangaReaderImageCache
```

## ITEM_CONTRACTS

```js
// normal/custom item; all fields except id/title are optional for compatibility
{
  id, url, title, folderId, addedAt,
  series, volume, author, tags, sourceWork,
  numberWidth, pagePattern, pages,
  favorite, lastReadAt, readCount,
  pageMeta, favoriteOnly
}

// local Storage item
{
  id: "local-item-<uuid>", title, folderId: "local-<uuid>", addedAt,
  localSync: true,
  pages: [public_url_compatibility_values],
  storagePaths: ["<uid>/<folder>/<page>"] ,
  storageBytes: [number],
  pageMeta: [{name,hidden,favorite,crop:{top,right,bottom,left}}],
  favoriteOnly: boolean
}
```

## URL_PAGE_DETECTION

```yaml
extensions: [jpg, jpeg, png, webp]
load_timeout_ms: 8000
detect_batch_size: 6
max_pages: 2000
page_patterns:
  - sequential: "1.jpg, 2.jpg"
  - zero_padded: "01.jpg, 02.jpg"
  - prefix_suffix: true
  - long_numeric_id: "if numeric token >= 7 and prefix has non-digit, preserve id and increment final 3 digits"
cache:
  max_entries: 300
  retryable_on: timeout
  retry_from: last_known_count + 1
  complete_only_after: missing_page_or_max_limit
guards:
  one_detection_per_key: true
  generation_guard_on_reader_switch: true
```

## READER_BEHAVIOR

```yaml
view:
  modes: [page_turn, continuous_vertical]
  fit: [contain, width, height]
  spread_split: true
  keyboard: [ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Home, End, M]
  touch: [page_swipe, manga_swipe, double_tap_favorite]
  themes: [dark, light]
  safe_mode: blur_images
  image_enhance:
    local_only: true
    max_pixels: 8000000
    sample_limit: 140000
bookshelf:
  smart_views: [history, favorites, series, unread_order, synced]
  page_size: 25
  operations: [save, edit, delete, favorite, folder_move, reorder, bulk_edit, filter, author_cards]
reading_state:
  session_window_ms: 1800000
  mark_read_at_page: 5
  short_work_threshold: final_page_when_count_known
  final_page_resume: page_1
  history: dedupe_by_normalized_base_url_and_unshift
sync_schedule:
  trigger: local_mutation
  debounce_ms: 800
  conflict: reject_stale_updated_at
```

## LOCAL_READER_BEHAVIOR

```yaml
input:
  sources: [webkitdirectory, file_drop]
  accepted_mime: image/*
  accepted_extensions: [avif, bmp, gif, jpg, jpeg, jfif, png, svg, webp]
  sort: Intl.Collator(numeric=true,sensitivity=base)
state_key: "mangaReaderLocalState:<currentFolder>"
  controls: [vertical_horizontal, name_reverse, first_prev_next_last, zoom_100_to_250, favorites_only, crop]
  render_page_size: 32
  render_policy: only_current_render_page_is_in_dom
  render_page_navigation: [chunk_prev, chunk_next]
  global_image_navigation: first_prev_next_last_across_chunks
gestures:
  swipe_left: hide_current
  double_tap: toggle_favorite
  center_tap: toggle_bars
  key_M: toggle_bars
crop:
  destructive: false
  storage: canvas_data_url_in_local_state_or_pageMeta
  apply_behavior: preserve_target_image_and_scroll_back_to_it_after_rerender
cloud_sync:
  opt_in: true
  bucket: local-manga
  upload: sequential_one_file_at_a_time
  path: "<uid>/local-<uuid>/<5digit>-<safe_filename>"
  auth_check: before_upload
  refresh_session: before_upload_best_effort
  cancellation: AbortController
  ui_lock_during_sync: true
  first_page: show_before_background_signing
  nearby_window: center-5..center+5
  rest: background_warm
  daily_transfer_limit_default: 157286400
  cache: IndexedDB_mangaReaderImageCache
  delete: remove_storage_objects_with_synced_item
```

## LINKS_PAGE

```yaml
storage_key: linkManagerItemsV1
max_import_items: 5000
fields: [url, title, note, tags, favorite, readAt, createdAt, updatedAt]
features: [add, edit, delete, normalize_url, deduplicate, search, unread_filter, favorite_filter, tag_filter, json_export, json_import, theme]
vault_sync: false
query_capture: "?url=<url> opens add dialog"
```

## STORAGE_SQL

```yaml
full_setup: supabase-schema.sql
storage_only_setup: supabase-storage-setup.sql
bucket_policy:
  insert/update/delete/select: authenticated AND bucket_id == local-manga AND path[0] == auth.uid
do_not_use_for_private_images: /storage/v1/object/public/
private_read: signed_url_or_private_download_endpoint
```

## CHANGE_RULES

```yaml
preserve:
  - static_no_build_architecture
  - japanese_ui
  - iPhone_safe_area_and_responsive_layout
  - localStorage_key_compatibility
  - vault_payload_backward_compatibility
  - storage_path_user_prefix_and_rls_alignment
  - no_plaintext_upload_to_vault
  - no_service_role_key_in_client
  - bounded_remote_image_concurrency
sync_field_change_requires_update:
  - sync.html: buildPayload/applyPayload
  - reader.html: buildSyncPayload/applyImportedData
  - local-reader.html: persistCloudState
do_not_merge_into_vault:
  - links.html/linkManagerItemsV1
avoid:
  - public_storage_urls_for_private_images
  - credentials_in_logs_or_commits
  - unbounded_page_detection_or_upload_parallelism
  - destructive_migrations_without_legacy_read_support
```

## VALIDATION

```yaml
static:
  - "python3 -m http.server 8000"
  - "curl -I http://127.0.0.1:8000/index.html"
  - "curl -I http://127.0.0.1:8000/sync.html"
  - "curl -I http://127.0.0.1:8000/reader.html"
  - "curl -I http://127.0.0.1:8000/local-reader.html"
  - "curl -I http://127.0.0.1:8000/links.html"
repo:
  - "git diff --check"
  - "git status --short"
manual_required:
  - auth_signup_login_refresh_logout
  - vault_create_passphrase_recovery_passkey
  - normal_url_page_detection_and_resume
  - bookshelf_crud_history_unread_favorite_import_export
  - local_folder_sort_hide_favorite_crop_zoom
  - storage_upload_cancel_reload_signed_read_delete
  - theme_vault_round_trip
```

## CURRENT_STATE

```yaml
tests: none
worktree_at_spec_creation: clean
spec_file_status: untracked_until_committed
latest_features: [local_reader, private_storage_sync, daily_transfer_budget, indexeddb_image_cache]
```

## DELIVERY_POLICY

```yaml
every_change:
  required_sequence: [implement, validate, commit, push_main, wait_pages_build, verify_public_url]
  hosting: github_pages_legacy
  source: {branch: main, path: /}
  public_url: https://75k8hy94my-ui.github.io/testCode/
  https: enforced
  deploy_trigger: push_to_main
  completion_requires: public_url_contains_current_change
auth:
  github_connector: available
  local_gh: may_be_unavailable
branch_policy: main_is_deployed_branch
```
