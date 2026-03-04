
## The Problem

Right now the Last.fm username is just stored in localStorage and passed as a text hint to Gemini. We never actually call the Last.fm API. The user wants real data — but calling the Last.fm API on every single companion load would be wasteful and could run up costs fast.

## The Smart Solution: `lastfm_cache` table + TTL refresh

Instead of calling Last.fm on every listen, we:
1. Store the fetched Last.fm profile data in a new `lastfm_cache` table in the database
2. Only refresh it if the cached data is older than **24 hours** (configurable TTL)
3. The `generate-companion` edge function checks the cache first — if fresh, uses it; if stale/missing, fetches from Last.fm API, stores it, then uses it

This means a user who listens 20 times in a day only makes **1** Last.fm API call, not 20.

---

## What Last.fm Data to Fetch

The Last.fm API is free (no cost per call, just rate-limited). We'll fetch:
- `user.getTopArtists` — top 10 artists (period: 1 month) → used to personalize "Explore Next" recommendations
- `user.getRecentTracks` — last 5 tracks → used to avoid recommending things they just heard
- `user.getInfo` — playcount, registered date → for the "Nerd" tier badge context

This gets injected into the Gemini prompt as structured context, not just a username string.

---

## Files to Change

### 1. Database migration — new `lastfm_cache` table
```sql
CREATE TABLE public.lastfm_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  top_artists jsonb NOT NULL DEFAULT '[]',
  recent_tracks jsonb NOT NULL DEFAULT '[]',
  user_info jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: public read/write (no auth on this app)
ALTER TABLE public.lastfm_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on lastfm_cache" ON public.lastfm_cache FOR ALL USING (true) WITH CHECK (true);
```

### 2. New edge function: `supabase/functions/lastfm-sync/index.ts`
A dedicated function that:
- Accepts `{ username: string }`
- Checks `lastfm_cache` for existing row
- If `fetched_at` < 24h ago → return cached data immediately (no Last.fm API call)
- If stale or missing → call Last.fm API for `user.getTopArtists`, `user.getRecentTracks`, `user.getInfo`
- Upsert result into `lastfm_cache`
- Return the data

This function needs a `LASTFM_API_KEY` secret (Last.fm API keys are free — user will need to create one at last.fm/api/account/create).

### 3. Update `supabase/functions/generate-companion/index.ts`
- If `lastFmUsername` is provided, call the `lastfm-sync` function internally (via supabase functions invoke, or direct HTTP to the same project)
- Inject structured Last.fm context into the Gemini prompt:
```
User's Last.fm top artists this month: Radiohead, Aphex Twin, Portishead...
Recently played: [track list]
Total scrobbles: 45,230
```
Instead of the current weak: `"Last.fm user: {username} — personalize recommendations subtly"`

### 4. Update `supabase/config.toml`
Add `[functions.lastfm-sync]` with `verify_jwt = false`

### 5. Frontend: `src/pages/Setup.tsx`
- After user enters Last.fm username and hits Continue, call `lastfm-sync` immediately in the background to warm the cache
- Show a small "Syncing your Last.fm..." loading state while it runs
- If Last.fm API key isn't configured yet, gracefully degrade (no crash)

---

## TTL Strategy (Cost Control)

| Scenario | Last.fm API calls |
|---|---|
| 1st listen ever | 1 call to warm cache |
| Listens 2–100 same day | 0 calls (served from DB cache) |
| First listen next day | 1 call to refresh |
| User changes username | 1 call |

24h TTL keeps data reasonably fresh (Last.fm scrobble data changes daily) while keeping API usage minimal. Could be bumped to 6h for Nerd users if they want more up-to-date context.

---

## Secret Needed

The Last.fm API is free but requires an API key. We'll need to request a `LASTFM_API_KEY` secret from the user. They can get one at: **last.fm/api/account/create** (instant, no payment required).

---

## Summary of New Files/Tables

| Item | Type | Purpose |
|---|---|---|
| `lastfm_cache` | DB table | Stores fetched Last.fm data with TTL |
| `supabase/functions/lastfm-sync/index.ts` | Edge function | Fetch + cache Last.fm data |
| `generate-companion/index.ts` | Updated | Uses rich Last.fm context in Gemini prompt |
| `src/pages/Setup.tsx` | Updated | Warms cache on username entry |

Before we can build this, we need the `LASTFM_API_KEY` secret. The user will need to create a free Last.fm API account.
