-- Multi-service support: music_taste column + artist_cache composite key
-- Part of Apple Music integration (Phase 2)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. profiles: add service-agnostic music_taste column
-- ═══════════════════════════════════════════════════════════════════════

-- New column stores taste data keyed by service:
--   { "spotify": { topArtists, topTracks, artistImages, artistIds, trackImages } }
--   { "apple":   { topArtists, topTracks, artistImages, artistIds, trackImages, partial: true } }
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS music_taste JSONB;

-- Backfill existing spotify_taste data into the new structure
UPDATE public.profiles
SET music_taste = jsonb_build_object('spotify', spotify_taste)
WHERE spotify_taste IS NOT NULL
  AND music_taste IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. artist_cache: add service column + canonical_name for cross-service bio reuse
-- ═══════════════════════════════════════════════════════════════════════

-- Service column: same artist can be cached under different IDs per service
ALTER TABLE public.artist_cache
  ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'spotify';

-- Canonical name: lowercase artist name for cross-service lookups
-- (e.g., reuse Gemini-generated bio from Spotify cache when Apple Music requests same artist)
ALTER TABLE public.artist_cache
  ADD COLUMN IF NOT EXISTS canonical_name TEXT;

-- Change primary key from single-column to composite (artist_id, service)
-- artist_id is only unique within a service
ALTER TABLE public.artist_cache
  DROP CONSTRAINT IF EXISTS artist_cache_pkey;

ALTER TABLE public.artist_cache
  ADD PRIMARY KEY (artist_id, service);

-- Index for cross-service bio lookup by canonical name
CREATE INDEX IF NOT EXISTS idx_artist_cache_canonical_name
  ON public.artist_cache (canonical_name)
  WHERE canonical_name IS NOT NULL;
