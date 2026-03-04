
-- ── companion_cache ───────────────────────────────────────────────────
-- Drop the catch-all permissive policy
DROP POLICY IF EXISTS "Allow all access to companion_cache" ON public.companion_cache;

-- Public read (shared cache, intentional)
CREATE POLICY "companion_cache_select"
  ON public.companion_cache FOR SELECT
  USING (true);

-- Only service role can write (edge functions use service role key)
CREATE POLICY "companion_cache_insert"
  ON public.companion_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "companion_cache_update"
  ON public.companion_cache FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "companion_cache_delete"
  ON public.companion_cache FOR DELETE
  USING (auth.role() = 'service_role');


-- ── lastfm_cache ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all on lastfm_cache" ON public.lastfm_cache;

CREATE POLICY "lastfm_cache_select"
  ON public.lastfm_cache FOR SELECT
  USING (true);

CREATE POLICY "lastfm_cache_insert"
  ON public.lastfm_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "lastfm_cache_update"
  ON public.lastfm_cache FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "lastfm_cache_delete"
  ON public.lastfm_cache FOR DELETE
  USING (auth.role() = 'service_role');


-- ── nugget_cache ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow service role insert/update on nugget_cache" ON public.nugget_cache;

CREATE POLICY "nugget_cache_write"
  ON public.nugget_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "nugget_cache_update"
  ON public.nugget_cache FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "nugget_cache_delete"
  ON public.nugget_cache FOR DELETE
  USING (auth.role() = 'service_role');
