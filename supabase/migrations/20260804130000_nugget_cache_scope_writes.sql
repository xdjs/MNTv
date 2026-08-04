-- Scope nugget_cache writes so a visitor cannot destroy or poison the cache.
--
-- The problem: the write policies added in 20260304180000 grant INSERT,
-- UPDATE and DELETE to the `authenticated` role with NO row conditions.
-- Anonymous sign-in (src/lib/ensureSupabaseSession.ts) hands that role to
-- every visitor who reaches Connect, so in practice any visitor could
-- overwrite or delete any cached nugget row in the table.
--
-- Why it was written that way: at the time the CLIENT wrote nugget_cache
-- after generation, and that write failed for anon users. The fix chosen
-- then was to widen the policy. In April 2026 the write moved server-side
-- (generate-nuggets upserts with the admin key, bypassing RLS) and the
-- policy was never narrowed again. That function's own comment records it:
--
--     "the server writes here using the admin key (bypasses RLS).
--      Client's cache-write is now redundant but harmless."
--
-- So the broad grant is vestigial. What the client still genuinely needs
-- is the generation LOCK, not the ability to write content:
--
--   INSERT status='generating'        claim a track. The unique index on
--                                     track_id makes this atomic across
--                                     clients — a second claim gets 23505
--                                     and that client waits instead of
--                                     paying for duplicate generation.
--   DELETE WHERE status='generating'  release the claim, or clear a stale
--                                     one after the poll timeout when the
--                                     claiming client died mid-generation.
--
-- This migration keeps exactly that and removes the rest. A ready row —
-- real nuggets someone paid Exa and Gemini to produce — becomes writable
-- only by the server.
--
-- Residual exposure, stated plainly: a visitor can still create or clear
-- generation claims. Worst case they force duplicate generation, or make
-- other clients wait out the poll timeout on a track. Both are bounded and
-- self-healing, and closing them would mean moving the lock server-side —
-- a generate-nuggets deploy, which is guarded for unrelated reasons. This
-- migration deliberately takes the part that needs no deploy.

DROP POLICY IF EXISTS "nugget_cache_write" ON public.nugget_cache;
DROP POLICY IF EXISTS "nugget_cache_update" ON public.nugget_cache;
DROP POLICY IF EXISTS "nugget_cache_delete" ON public.nugget_cache;

-- INSERT: a bare claim, or anything from the server.
-- `nuggets = '[]'` is what stops this being a content-planting hole: a
-- claim row carries no facts, so it cannot be used to serve fabricated
-- nuggets to other listeners.
CREATE POLICY "nugget_cache_claim"
  ON public.nugget_cache FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      auth.role() = 'authenticated'
      AND status = 'generating'
      AND nuggets = '[]'::jsonb
    )
  );

-- UPDATE: server only. The client has no reason to modify a row in place —
-- it resolves its own claim by letting the server's upsert overwrite it.
CREATE POLICY "nugget_cache_update"
  ON public.nugget_cache FOR UPDATE
  USING (auth.role() = 'service_role');

-- DELETE: an in-flight claim only. Ready rows are durable cache.
CREATE POLICY "nugget_cache_delete"
  ON public.nugget_cache FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (auth.role() = 'authenticated' AND status = 'generating')
  );
