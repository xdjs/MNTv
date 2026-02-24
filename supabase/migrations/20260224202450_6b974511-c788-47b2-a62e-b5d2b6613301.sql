
-- Cache for pre-seeded demo nuggets (first-listen content)
CREATE TABLE public.nugget_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id TEXT NOT NULL UNIQUE,
  nuggets JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public read, function write)
ALTER TABLE public.nugget_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to nugget_cache"
ON public.nugget_cache
FOR SELECT
USING (true);

CREATE POLICY "Allow service role insert/update on nugget_cache"
ON public.nugget_cache
FOR ALL
USING (true)
WITH CHECK (true);
