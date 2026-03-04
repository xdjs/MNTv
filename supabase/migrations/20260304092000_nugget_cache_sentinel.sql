-- Item 8: Nugget cache deduplication sentinel
--
-- Adds a `status` column to nugget_cache so the client can:
--   1. Write a 'generating' sentinel before the AI call
--   2. Poll for 'ready' if another client is already generating
--   3. Write the real nuggets + status:'ready' after AI succeeds
--   4. Clean up the sentinel on AI failure
--
-- Existing rows default to 'ready' so the cache check keeps working
-- after this migration runs.

ALTER TABLE public.nugget_cache
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';

-- Unique index so only ONE concurrent INSERT wins the "claim" race.
-- A second INSERT on the same track_id returns PG error 23505 (unique_violation)
-- which the client interprets as "someone else is generating — poll them."
CREATE UNIQUE INDEX IF NOT EXISTS nugget_cache_track_id_key
  ON public.nugget_cache (track_id);
