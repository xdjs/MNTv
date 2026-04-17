-- Drop the legacy spotify_taste column from profiles.
-- The dual-write pattern (spotify_taste + music_taste) shipped in
-- 20260408200000_apple_music_support.sql. music_taste is now the sole
-- source of truth for taste data, keyed by service ("spotify", "apple").
-- The live DB has 0 rows at drop time — no data loss.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS spotify_taste;
