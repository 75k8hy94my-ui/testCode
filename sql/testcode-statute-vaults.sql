-- Apply using Supabase SQL migration; independent encrypted statutes corpus.
CREATE TABLE IF NOT EXISTS public.testcode_statute_vaults (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 ciphertext jsonb NOT NULL,
 wrapped_key jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.testcode_statute_vaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.testcode_statute_vaults FROM anon;
GRANT SELECT, INSERT ON public.testcode_statute_vaults TO authenticated;
GRANT UPDATE(revision,ciphertext,updated_at) ON public.testcode_statute_vaults TO authenticated;
DROP POLICY IF EXISTS "statute_owner_select" ON public.testcode_statute_vaults;
DROP POLICY IF EXISTS "statute_owner_insert" ON public.testcode_statute_vaults;
DROP POLICY IF EXISTS "statute_owner_update" ON public.testcode_statute_vaults;
CREATE POLICY "statute_owner_select" ON public.testcode_statute_vaults FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "statute_owner_insert" ON public.testcode_statute_vaults FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "statute_owner_update" ON public.testcode_statute_vaults FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
