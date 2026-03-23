-- Enable pg_cron if not already enabled
create extension if not exists pg_cron with schema extensions;

-- Schedule weekly cleanup of stale artist_cache rows (older than 2 days)
-- Edge function TTL is 24h; 2-day buffer prevents edge cases around the boundary
select cron.schedule(
  'artist-cache-cleanup',
  '0 3 * * 0',  -- every Sunday at 3:00 AM UTC
  $$DELETE FROM public.artist_cache WHERE created_at < NOW() - INTERVAL '2 days'$$
);
