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

create policy "Users can update their own encrypted vault"
on public.manga_reader_vaults for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
