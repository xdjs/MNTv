CREATE TABLE public.nugget_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_key TEXT NOT NULL UNIQUE,
  listen_count INTEGER DEFAULT 1,
  previous_nuggets JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.nugget_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access" ON public.nugget_history FOR ALL USING (true) WITH CHECK (true);