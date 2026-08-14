create table if not exists public.manga_reader_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.manga_reader_vaults enable row level security;

drop policy if exists "Users can read their own encrypted vault" on public.manga_reader_vaults;
drop policy if exists "Users can create their own encrypted vault" on public.manga_reader_vaults;
drop policy if exists "Users can update their own encrypted vault" on public.manga_reader_vaults;

create policy "Users can read their own encrypted vault"
on public.manga_reader_vaults for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own encrypted vault"
on public.manga_reader_vaults for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- ローカル漫画の同期用。画像本体はvaultのJSONに入れず、Storageへ1枚ずつ保存する。
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

create policy "Users can update their own encrypted vault"
on public.manga_reader_vaults for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
