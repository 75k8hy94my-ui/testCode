\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public.manga_reader_vault_history') IS NULL THEN
    RAISE EXCEPTION 'history_table_missing';
  END IF;
END $$;

DO $$
DECLARE vault_before record;
BEGIN
  IF (SELECT count(*) FROM public.manga_reader_vault_history) <> (SELECT count(*) FROM public.manga_reader_vaults) THEN
    RAISE EXCEPTION 'backfill_count_mismatch';
  END IF;
  FOR vault_before IN SELECT * FROM public.vault_history_test_expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.manga_reader_vault_history AS history
      WHERE history.user_id = vault_before.user_id
        AND history.revision = vault_before.revision
        AND history.updated_at = vault_before.updated_at
        AND history.encrypted_data = vault_before.payload -> 'data'
    ) THEN RAISE EXCEPTION 'initial_snapshot_mismatch'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.manga_reader_vaults AS vault
      WHERE vault.user_id = vault_before.user_id
        AND vault.payload = vault_before.payload
        AND vault.revision = vault_before.revision
        AND vault.updated_at = vault_before.updated_at
    ) THEN RAISE EXCEPTION 'migration_changed_vault_row'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.manga_reader_vault_history WHERE encoded_bytes <> octet_length(encrypted_data::text)) THEN
    RAISE EXCEPTION 'encoded_byte_count_mismatch';
  END IF;
END $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
DO $$
DECLARE before_count integer;
DECLARE saved_revision bigint;
DECLARE saved_id uuid;
DECLARE failed boolean := false;
BEGIN
  SELECT count(*) INTO before_count FROM public.manga_reader_vault_history;
  SELECT revision INTO saved_revision FROM public.manga_reader_vaults WHERE user_id = '10000000-0000-0000-0000-000000000001';
  IF (SELECT count(*) FROM public.update_manga_reader_vault_v4(saved_revision - 1, '{"syncProtocolVersion":4,"version":1,"data":{"ciphertext":"stale"}}')) <> 0 THEN
    RAISE EXCEPTION 'stale_cas_succeeded';
  END IF;
  IF (SELECT count(*) FROM public.manga_reader_vault_history) <> before_count THEN RAISE EXCEPTION 'stale_cas_created_history'; END IF;
  IF (SELECT count(*) FROM public.update_manga_reader_vault_v4(saved_revision, '{"syncProtocolVersion":4,"version":1,"data":{"ciphertext":"synthetic-update"}}')) <> 1 THEN
    RAISE EXCEPTION 'v4_cas_failed';
  END IF;
  IF (SELECT count(*) FROM public.manga_reader_vault_history) <> before_count + 1 THEN RAISE EXCEPTION 'successful_cas_missing_history'; END IF;
  SELECT history_id INTO saved_id FROM public.manga_reader_vault_history
  WHERE user_id = '10000000-0000-0000-0000-000000000001' ORDER BY revision DESC LIMIT 1;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'history_id_missing'; END IF;
  BEGIN
    PERFORM * FROM public.update_manga_reader_vault_v4(saved_revision + 1,
      jsonb_build_object('syncProtocolVersion',4,'version',1,'data',jsonb_build_object('ciphertext',repeat('x',16 * 1024 * 1024))));
  EXCEPTION WHEN OTHERS THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'oversized_snapshot_was_accepted'; END IF;
  IF (SELECT revision FROM public.manga_reader_vaults WHERE user_id = '10000000-0000-0000-0000-000000000001') <> saved_revision + 1 THEN
    RAISE EXCEPTION 'history_failure_did_not_rollback_vault';
  END IF;
  IF (SELECT count(*) FROM public.manga_reader_vault_history) <> before_count + 1 THEN RAISE EXCEPTION 'failed_update_created_history'; END IF;
END $$;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.manga_reader_vault_history'::regclass) THEN RAISE EXCEPTION 'history_rls_disabled'; END IF;
  IF has_table_privilege('authenticated','public.manga_reader_vault_history','INSERT')
    OR has_table_privilege('authenticated','public.manga_reader_vault_history','UPDATE')
    OR has_table_privilege('authenticated','public.manga_reader_vault_history','DELETE') THEN RAISE EXCEPTION 'history_direct_write_grant'; END IF;
  IF NOT has_table_privilege('service_role','public.manga_reader_vault_history','SELECT')
    OR NOT has_table_privilege('service_role','public.manga_reader_vault_history','INSERT')
    OR NOT has_table_privilege('service_role','public.manga_reader_vault_history','UPDATE')
    OR NOT has_table_privilege('service_role','public.manga_reader_vault_history','DELETE') THEN RAISE EXCEPTION 'history_service_role_privileges_missing'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261010223740' AND name = 'vault_history') <> 1 THEN
    RAISE EXCEPTION 'history_migration_not_recorded';
  END IF;
END $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
DO $$
DECLARE current_revision bigint;
DECLARE iteration integer;
DECLARE oldest_id uuid;
BEGIN
  SELECT history_id INTO oldest_id FROM public.manga_reader_vault_history
  WHERE user_id = '10000000-0000-0000-0000-000000000001' ORDER BY revision ASC LIMIT 1;
  IF public.set_manga_reader_vault_history_protected(oldest_id, true) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'initial_history_pin_failed';
  END IF;
  FOR iteration IN 1..55 LOOP
    SELECT revision INTO current_revision FROM public.manga_reader_vaults
    WHERE user_id = '10000000-0000-0000-0000-000000000001';
    PERFORM * FROM public.update_manga_reader_vault_v4(current_revision,
      '{"syncProtocolVersion":4,"version":1,"data":{"ciphertext":"retention-fixture"}}');
  END LOOP;
  IF (SELECT count(*) FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001') <> 50 THEN
    RAISE EXCEPTION 'history_count_limit_not_enforced';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.manga_reader_vault_history WHERE history_id = oldest_id AND protected) THEN
    RAISE EXCEPTION 'retention_deleted_protected_history';
  END IF;
  IF (SELECT min(revision) FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001' AND NOT protected)
      <> (SELECT max(revision) - 48 FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'oldest_unprotected_history_not_pruned';
  END IF;
  PERFORM public.set_manga_reader_vault_history_protected(oldest_id, false);
END $$;

-- Extra rows are synthetic pin-limit fixtures; direct INSERT is performed as
-- the isolated database owner, never through the authenticated client role.
INSERT INTO public.manga_reader_vault_history (user_id, revision, updated_at, encrypted_data, encoded_bytes)
SELECT '10000000-0000-0000-0000-000000000001', 1000 + n, now(), '{"ciphertext":"pin-fixture"}'::jsonb,
       octet_length('{"ciphertext":"pin-fixture"}'::jsonb::text)
FROM generate_series(1, 6) AS n;
SELECT set_config('test.vault_history_foreign_id',
  (SELECT history_id::text FROM public.manga_reader_vault_history
   WHERE user_id = '20000000-0000-0000-0000-000000000002' LIMIT 1), false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
DO $$
DECLARE visible_count integer;
DECLARE selected_id uuid;
DECLARE foreign_id uuid;
DECLARE failed boolean := false;
DECLARE ids uuid[];
DECLARE position integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.manga_reader_vault_history;
  IF visible_count < 1 THEN RAISE EXCEPTION 'owner_cannot_read_history'; END IF;
  IF EXISTS (SELECT 1 FROM public.manga_reader_vault_history WHERE user_id <> auth.uid()) THEN RAISE EXCEPTION 'rls_exposed_other_history'; END IF;
  SELECT history_id INTO selected_id FROM public.manga_reader_vault_history ORDER BY revision DESC LIMIT 1;
  foreign_id := current_setting('test.vault_history_foreign_id')::uuid;
  BEGIN
    INSERT INTO public.manga_reader_vault_history (user_id, revision, updated_at, encrypted_data, encoded_bytes)
    VALUES (auth.uid(), 999, now(), '{"ciphertext":"forbidden"}', 32);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'direct_history_insert_succeeded'; END IF;
  failed := false;
  BEGIN
    UPDATE public.manga_reader_vault_history SET protected = true WHERE history_id = selected_id;
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'direct_history_update_succeeded'; END IF;
  failed := false;
  BEGIN
    DELETE FROM public.manga_reader_vault_history WHERE history_id = selected_id;
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'direct_history_delete_succeeded'; END IF;
  IF public.set_manga_reader_vault_history_protected(selected_id, true) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'owner_pin_rpc_failed';
  END IF;
  failed := false;
  BEGIN
    PERFORM public.set_manga_reader_vault_history_protected(foreign_id, true);
  EXCEPTION WHEN SQLSTATE 'P0002' THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'cross_owner_pin_succeeded'; END IF;
  SELECT array_agg(history_id ORDER BY revision) INTO ids FROM (
    SELECT history_id, revision FROM public.manga_reader_vault_history
    WHERE user_id = auth.uid() AND revision BETWEEN 1001 AND 1006 ORDER BY revision
  ) AS fixtures;
  FOR position IN 1..4 LOOP
    IF public.set_manga_reader_vault_history_protected(ids[position], true) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'history_pin_under_limit_failed';
    END IF;
  END LOOP;
  failed := false;
  BEGIN
    PERFORM public.set_manga_reader_vault_history_protected(ids[5], true);
  EXCEPTION WHEN SQLSTATE '54000' THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'history_pin_count_limit_not_enforced'; END IF;
END $$;
RESET ROLE;

-- Release the count-limit pins, then check the encoded-byte cap independently.
UPDATE public.manga_reader_vault_history
SET encrypted_data = jsonb_build_object('ciphertext', repeat('x', 9 * 1024 * 1024)),
    encoded_bytes = octet_length(jsonb_build_object('ciphertext', repeat('x', 9 * 1024 * 1024))::text)
WHERE user_id = '10000000-0000-0000-0000-000000000001' AND revision BETWEEN 1001 AND 1003;
UPDATE public.manga_reader_vault_history
SET encrypted_data = jsonb_build_object('ciphertext', repeat('x', 6 * 1024 * 1024)),
    encoded_bytes = octet_length(jsonb_build_object('ciphertext', repeat('x', 6 * 1024 * 1024))::text)
WHERE user_id = '10000000-0000-0000-0000-000000000001' AND revision = 1004;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
DO $$
DECLARE ids uuid[];
DECLARE position integer;
DECLARE failed boolean := false;
BEGIN
  SELECT array_agg(history_id ORDER BY revision) INTO ids FROM public.manga_reader_vault_history
  WHERE user_id = auth.uid() AND revision BETWEEN 1001 AND 1006;
  FOR position IN 1..6 LOOP
    PERFORM public.set_manga_reader_vault_history_protected(ids[position], false);
  END LOOP;
  PERFORM public.set_manga_reader_vault_history_protected(ids[1], true);
  PERFORM public.set_manga_reader_vault_history_protected(ids[2], true);
  PERFORM public.set_manga_reader_vault_history_protected(ids[3], true);
  BEGIN
    PERFORM public.set_manga_reader_vault_history_protected(ids[4], true);
  EXCEPTION WHEN SQLSTATE '54000' THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'history_pin_byte_limit_not_enforced'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE failed boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',false);
  PERFORM set_config('request.jwt.claims','{}',false);
  BEGIN
    PERFORM public.set_manga_reader_vault_history_protected(
      (SELECT history_id FROM public.manga_reader_vault_history ORDER BY revision DESC LIMIT 1), true);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'unauthenticated_pin_succeeded'; END IF;
END $$;

-- Exceed the per-user byte cap with synthetic archived data, then let a real
-- Vault CAS trigger retention. Protected history must survive byte pruning.
INSERT INTO public.manga_reader_vault_history (user_id, revision, updated_at, encrypted_data, encoded_bytes)
SELECT '10000000-0000-0000-0000-000000000001', 2000 + n, now(),
       jsonb_build_object('ciphertext', repeat('x', 9 * 1024 * 1024)),
       octet_length(jsonb_build_object('ciphertext', repeat('x', 9 * 1024 * 1024))::text)
FROM generate_series(1, 5) AS n;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',false);
DO $$
DECLARE current_revision bigint;
BEGIN
  SELECT revision INTO current_revision FROM public.manga_reader_vaults
  WHERE user_id = '10000000-0000-0000-0000-000000000001';
  PERFORM * FROM public.update_manga_reader_vault_v4(current_revision,
    '{"syncProtocolVersion":4,"version":1,"data":{"ciphertext":"byte-retention-fixture"}}');
  IF (SELECT count(*) FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001') > 50 THEN
    RAISE EXCEPTION 'history_count_cap_failed_after_byte_pressure';
  END IF;
  IF (SELECT sum(encoded_bytes) FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001') > 64 * 1024 * 1024 THEN
    RAISE EXCEPTION 'history_byte_cap_not_enforced';
  END IF;
  IF (SELECT count(*) FROM public.manga_reader_vault_history
      WHERE user_id = '10000000-0000-0000-0000-000000000001' AND revision BETWEEN 1001 AND 1003 AND protected) <> 3 THEN
    RAISE EXCEPTION 'byte_retention_deleted_protected_history';
  END IF;
END $$;

-- A realistic near-834 KiB encrypted-envelope fixture exercises the maximum
-- snapshot count while staying below the 64 MiB cap. Values are synthetic.
UPDATE public.manga_reader_vault_history SET protected = false
WHERE user_id = '10000000-0000-0000-0000-000000000001';
DELETE FROM public.manga_reader_vault_history
WHERE user_id = '10000000-0000-0000-0000-000000000001';
\timing on
DO $$
DECLARE current_revision bigint;
DECLARE iteration integer;
BEGIN
  FOR iteration IN 1..50 LOOP
    SELECT revision INTO current_revision FROM public.manga_reader_vaults
    WHERE user_id = '10000000-0000-0000-0000-000000000001';
    PERFORM * FROM public.update_manga_reader_vault_v4(current_revision,
      jsonb_build_object('syncProtocolVersion',4,'version',1,'data',
        jsonb_build_object('ciphertext',repeat('x',833 * 1024))));
  END LOOP;
  IF (SELECT count(*) FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001') <> 50 THEN
    RAISE EXCEPTION 'near_834k_history_count_limit_failed';
  END IF;
  IF (SELECT sum(encoded_bytes) FROM public.manga_reader_vault_history WHERE user_id = '10000000-0000-0000-0000-000000000001') > 64 * 1024 * 1024 THEN
    RAISE EXCEPTION 'near_834k_history_byte_limit_failed';
  END IF;
END $$;
\timing off
