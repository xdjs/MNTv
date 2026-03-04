
DROP POLICY IF EXISTS "lastfm_cache_select" ON public.lastfm_cache;

CREATE POLICY "lastfm_cache_service_role_select"
  ON public.lastfm_cache FOR SELECT
  USING (auth.role() = 'service_role');
