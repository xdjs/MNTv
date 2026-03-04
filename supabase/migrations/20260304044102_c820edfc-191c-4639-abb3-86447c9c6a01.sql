
CREATE TABLE public.lastfm_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  top_artists jsonb NOT NULL DEFAULT '[]',
  recent_tracks jsonb NOT NULL DEFAULT '[]',
  user_info jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lastfm_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on lastfm_cache"
  ON public.lastfm_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
