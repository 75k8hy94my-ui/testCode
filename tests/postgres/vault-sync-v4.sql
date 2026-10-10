\set ON_ERROR_STOP on

-- Isolated role/JWT matrix. This runs only against the disposable CI PostgreSQL service.
insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;
insert into public.manga_reader_vaults (user_id, payload, revision)
values
  ('10000000-0000-0000-0000-000000000001', '{"version":1,"data":{"ciphertext":"legacy-fixture"}}', 7),
  ('20000000-0000-0000-0000-000000000002', '{"syncProtocolVersion":3,"version":1}', 4)
on conflict (user_id) do update set payload = excluded.payload, revision = excluded.revision;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}', false);

DO $$
declare got integer;
begin
  select public.manga_reader_vault_sync_capability() into got;
  if got <> 4 then raise exception 'capability did not report protocol v4'; end if;
  if (select count(*) from public.manga_reader_vaults) <> 1 then raise exception 'RLS exposed another owner row'; end if;
  if has_table_privilege(current_user, 'public.manga_reader_vaults', 'INSERT')
    or has_table_privilege(current_user, 'public.manga_reader_vaults', 'UPDATE')
    or has_table_privilege(current_user, 'public.manga_reader_vaults', 'DELETE') then
    raise exception 'direct write privilege remains';
  end if;
  if has_function_privilege(current_user, 'public.update_manga_reader_vault(bigint,jsonb)', 'EXECUTE') then
    raise exception 'legacy update RPC remains executable';
  end if;
  if not has_function_privilege(current_user, 'private.update_manga_reader_vault_v4_worker(bigint,jsonb)', 'EXECUTE') then
    raise exception 'authenticated role cannot reach the guarded worker';
  end if;
end $$;

-- CAS mismatch must be a non-exception zero-row result, preserving legacy data.
DO $$
declare affected integer;
begin
  select count(*) into affected from public.update_manga_reader_vault_v4(6, '{"syncProtocolVersion":4,"version":1}');
  if affected <> 0 then raise exception 'stale CAS did not return zero rows'; end if;
  if (select revision from public.manga_reader_vaults where user_id = auth.uid()) <> 7 then raise exception 'stale CAS changed revision'; end if;
end $$;

-- Direct worker invocation repeats protocol and CAS guards and can only mutate auth.uid().
DO $$
declare affected integer;
begin
  begin
    perform * from private.update_manga_reader_vault_v4_worker(7, '{"syncProtocolVersion":3,"version":1}');
    raise exception 'old protocol was accepted by direct worker call' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then null;
  end;
  select count(*) into affected from public.update_manga_reader_vault_v4(7, '{"syncProtocolVersion":4,"version":1}');
  if affected <> 1 then raise exception 'v4 update failed'; end if;
  if (select revision from public.manga_reader_vaults where user_id = auth.uid()) <> 8 then raise exception 'revision was not incremented exactly once'; end if;
end $$;

-- Create is owner-bound, protocol-gated, and cannot replace an existing Vault.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', false);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":false}', false);
DO $$
declare affected integer;
begin
  begin
    perform * from private.create_manga_reader_vault_v4_worker('{"syncProtocolVersion":3,"version":1}');
    raise exception 'old protocol create was accepted' using errcode = 'ZX001';
  exception when sqlstate 'P0001' then null;
  end;
  select count(*) into affected from public.create_manga_reader_vault_v4('{"syncProtocolVersion":4,"version":1}');
  if affected <> 1 then raise exception 'new owner Vault was not created'; end if;
  begin
    perform * from private.create_manga_reader_vault_v4_worker('{"syncProtocolVersion":4,"version":1}');
    raise exception 'duplicate Vault create was accepted' using errcode = 'ZX001';
  exception when sqlstate '23505' then null;
  end;
end $$;

-- SECURITY DEFINER worker cannot bypass user binding when called directly.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":false}', false);
DO $$
declare affected integer;
begin
  select count(*) into affected from private.update_manga_reader_vault_v4_worker(7, '{"syncProtocolVersion":4,"version":1}');
  if affected <> 0 then raise exception 'direct worker modified another user row'; end if;
  if (select revision from public.manga_reader_vaults where user_id = '10000000-0000-0000-0000-000000000001') <> 8 then raise exception 'other owner revision changed'; end if;
end $$;

-- Anonymous JWT is rejected even if it carries a subject.
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000004', false);
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":true}', false);
DO $$
begin
  begin
    perform public.manga_reader_vault_sync_capability();
    raise exception 'anonymous capability probe was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Every definer worker pins search_path to empty and wrappers remain invoker functions.
DO $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('require_vault_sync_v4','manga_reader_vault_sync_capability_worker','create_manga_reader_vault_v4_worker','update_manga_reader_vault_v4_worker')
      and (not p.prosecdef or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=""%')
  ) then raise exception 'worker security definer/search_path configuration is unsafe'; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('manga_reader_vault_sync_capability','create_manga_reader_vault_v4','update_manga_reader_vault_v4') and p.prosecdef
  ) then raise exception 'public wrapper must be SECURITY INVOKER'; end if;
end $$;
