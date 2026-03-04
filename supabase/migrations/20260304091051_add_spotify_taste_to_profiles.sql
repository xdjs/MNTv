-- Add spotify_taste column to profiles table
-- Stores { topArtists: string[], topTracks: string[] } as JSONB
-- so Spotify listening data is synced across devices instead of being
-- locked to localStorage on a single browser.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS spotify_taste jsonb;
