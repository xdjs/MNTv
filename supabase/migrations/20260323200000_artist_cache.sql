-- Artist cache: stores spotify-artist edge function responses (24h TTL)
create table if not exists artist_cache (
  artist_id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS: public read-only (consistent with nugget_cache, companion_cache).
-- No INSERT/UPDATE/DELETE policy for anon/authenticated = writes blocked by RLS.
-- Only service_role (edge functions) can write, as it bypasses RLS.
alter table artist_cache enable row level security;

create policy "artist_cache_public_read"
  on artist_cache for select
  using (true);
