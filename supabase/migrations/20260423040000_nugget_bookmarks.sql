-- Bookmarking for nuggets. Users save nuggets they find interesting; the
-- bookmarks surface on their profile page. Identity comes from the
-- streaming service (Spotify or Apple) and is verified server-side by
-- the bookmark-nugget edge function — RLS here denies all direct client
-- access. All reads and writes must go through the edge function with
-- SUPABASE_SECRET_KEY (bypasses RLS).

CREATE TABLE IF NOT EXISTS public.nugget_bookmarks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service         text NOT NULL CHECK (service IN ('spotify','apple')),
  user_service_id text NOT NULL,
  track_id        text NOT NULL,
  artist          text NOT NULL,
  title           text NOT NULL,
  album           text,
  nugget_kind     text NOT NULL,
  headline        text NOT NULL,
  body            text NOT NULL,
  source          jsonb,
  image_url       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Fast per-user listing (newest first) — the profile page's primary query.
CREATE INDEX IF NOT EXISTS nugget_bookmarks_user_created_idx
  ON public.nugget_bookmarks (service, user_service_id, created_at DESC);

-- Soft dedup: identical headline-on-same-track bookmarked twice collapses.
-- Not strictly enforced (regeneration may produce slightly different headlines),
-- but catches the common double-tap case via ON CONFLICT DO NOTHING in the
-- edge function's INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS nugget_bookmarks_natural_key_idx
  ON public.nugget_bookmarks (service, user_service_id, track_id, nugget_kind, headline);

-- RLS: deny all direct client access. Writes and reads must go through
-- the bookmark-nugget edge function which uses SUPABASE_SECRET_KEY.
ALTER TABLE public.nugget_bookmarks ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon or authenticated roles.
-- service_role bypasses RLS by default.
