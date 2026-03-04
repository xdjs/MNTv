-- Allow authenticated users to insert/update/delete nugget_cache
-- (needed for sentinel pattern + cache writes from the client)

DROP POLICY IF EXISTS "nugget_cache_write" ON public.nugget_cache;
DROP POLICY IF EXISTS "nugget_cache_update" ON public.nugget_cache;
DROP POLICY IF EXISTS "nugget_cache_delete" ON public.nugget_cache;

CREATE POLICY "nugget_cache_write"
  ON public.nugget_cache FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "nugget_cache_update"
  ON public.nugget_cache FOR UPDATE
  USING (auth.role() IN ('authenticated', 'service_role'));

CREATE POLICY "nugget_cache_delete"
  ON public.nugget_cache FOR DELETE
  USING (auth.role() IN ('authenticated', 'service_role'));
