-- Short URL mapping for companion QR codes
CREATE TABLE public.companion_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  short_id text NOT NULL UNIQUE,
  artist text NOT NULL,
  title text NOT NULL,
  album text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Same track always maps to the same short_id
CREATE UNIQUE INDEX companion_links_track_key ON public.companion_links (artist, title);

ALTER TABLE public.companion_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read companion links"
  ON public.companion_links FOR SELECT USING (true);

CREATE POLICY "Anyone can insert companion links"
  ON public.companion_links FOR INSERT WITH CHECK (true);
