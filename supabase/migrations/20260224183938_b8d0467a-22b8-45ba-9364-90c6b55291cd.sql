
CREATE TABLE public.companion_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_key text NOT NULL,
  listen_count_tier integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(track_key, listen_count_tier)
);

ALTER TABLE public.companion_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to companion_cache"
  ON public.companion_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
