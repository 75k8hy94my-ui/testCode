-- 既存の同期ポリシーを変更せず、画像用バケットだけを作成する安全な追加SQL。
-- Supabase SQL Editorでこのファイルだけを単独実行してください。
insert into storage.buckets (id, name, public)
values ('local-manga', 'local-manga', true)
on conflict (id) do nothing;
