-- Remove third-party taste data columns from profiles.
-- Spotify and YouTube top artists/tracks will be held in
-- localStorage only (session-scoped) and never persisted to the DB.
-- The only identity data we keep is: user_id, streaming_service,
-- last_fm_username, tier.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS spotify_top_artists,
  DROP COLUMN IF EXISTS spotify_top_tracks,
  DROP COLUMN IF EXISTS youtube_top_artists;
