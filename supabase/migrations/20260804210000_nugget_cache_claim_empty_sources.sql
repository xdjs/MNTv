-- Constrain `sources` on the claim policy, not just `nuggets`.
--
-- 20260804130000 limited a client INSERT to a bare claim by requiring
-- status='generating' AND nuggets='[]'. It left `sources` unconstrained,
-- so a claim row could carry an arbitrary sources payload.
--
-- That is not exploitable today: every read path gates on
-- status === 'ready' before trusting nuggets or sources
-- (useAINuggets.ts:638, :746, :1179, and pollForReadyNuggets at :274).
-- But that safety depends on every present and future read site
-- remembering the gate, which is the weaker guarantee — raised in review
-- on #125. The constraint costs nothing and moves the guarantee into the
-- database, where forgetting is not an option.
--
-- Matches what the client actually sends when claiming a track
-- (useAINuggets.ts:709): { track_id, status: 'generating', nuggets: [],
-- sources: {} }.

DROP POLICY IF EXISTS "nugget_cache_claim" ON public.nugget_cache;

CREATE POLICY "nugget_cache_claim"
  ON public.nugget_cache FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND status = 'generating'
      AND nuggets = '[]'::jsonb
      AND sources = '{}'::jsonb
    )
  );
