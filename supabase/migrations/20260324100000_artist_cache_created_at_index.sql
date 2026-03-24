-- Index for cron cleanup query: WHERE created_at < NOW() - INTERVAL '2 days'
CREATE INDEX IF NOT EXISTS idx_artist_cache_created_at ON artist_cache(created_at);
