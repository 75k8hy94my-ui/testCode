-- 既存の同期ポリシーを変更せず、画像用バケットだけを作成する安全な追加SQL。
-- Supabase SQL Editorでこのファイルだけを単独実行してください。
insert into storage.buckets (id, name, public)
values ('local-manga', 'local-manga', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can upload local manga" on storage.objects;
drop policy if exists "Users can update local manga" on storage.objects;
drop policy if exists "Users can delete local manga" on storage.objects;
drop policy if exists "Users can read local manga" on storage.objects;

create policy "Users can upload local manga" on storage.objects for insert to authenticated
with check (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users can update local manga" on storage.objects for update to authenticated
using (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users can delete local manga" on storage.objects for delete to authenticated
using (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users can read local manga" on storage.objects for select to authenticated
using (bucket_id = 'local-manga' and (storage.foldername(name))[1] = (select auth.uid()::text));
